package services

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"chat-interno-server/internal/database"
	"chat-interno-server/internal/models"
)

var (
	ErrUserNotFound       = errors.New("usuário não encontrado")
	ErrInvalidCredentials = errors.New("credenciais inválidas")
	ErrInvalidToken       = errors.New("token de autenticação inválido ou expirado")
	ErrUserInactive       = errors.New("usuário inativo no sistema")
	ErrEmailAlreadyExists = errors.New("já existe um usuário cadastrado com este e-mail")
)

type TokenPayload struct {
	UserID    string          `json:"uid"`
	Email     string          `json:"eml"`
	Role      models.UserRole `json:"rol"`
	ExpiresAt int64           `json:"exp"`
}

type AuthService struct {
	db        *database.DB
	jwtSecret []byte
}

func NewAuthService(db *database.DB, jwtSecret string) *AuthService {
	if jwtSecret == "" {
		jwtSecret = "sol-crm-master-secret-key-2026-production"
	}

	return &AuthService{
		db:        db,
		jwtSecret: []byte(jwtSecret),
	}
}

// Authenticate valida e-mail e senha no PostgreSQL (Regras 1, 2, 7 e 10)
func (s *AuthService) Authenticate(email, password string) (*models.User, string, error) {
	cleanEmail := strings.ToLower(strings.TrimSpace(email))

	user, err := s.db.GetUserByEmail(cleanEmail)
	if err != nil {
		return nil, "", ErrInvalidCredentials
	}

	if !user.Active {
		return nil, "", ErrUserInactive
	}

	if !database.CheckPassword(password, user.PasswordHash) {
		return nil, "", ErrInvalidCredentials
	}

	// Atualiza último login no banco
	_ = s.db.UpdateLastLogin(user.ID)
	user.LastLogin = time.Now().UTC()

	// Gera token com validade de 24 horas
	token, err := s.generateToken(user)
	if err != nil {
		return nil, "", err
	}

	userCopy := *user
	return &userCopy, token, nil
}

// ValidateToken valida e decodifica o token do cabeçalho Bearer
func (s *AuthService) ValidateToken(tokenString string) (*models.User, error) {
	parts := strings.Split(tokenString, ".")
	if len(parts) != 2 {
		return nil, ErrInvalidToken
	}

	dataB64 := parts[0]
	sigB64 := parts[1]

	dataBytes, err := base64.RawURLEncoding.DecodeString(dataB64)
	if err != nil {
		return nil, ErrInvalidToken
	}

	sigBytes, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return nil, ErrInvalidToken
	}

	// Valida assinatura HMAC-SHA256
	h := hmac.New(sha256.New, s.jwtSecret)
	h.Write(dataBytes)
	expectedSig := h.Sum(nil)

	if subtle.ConstantTimeCompare(sigBytes, expectedSig) != 1 {
		return nil, ErrInvalidToken
	}

	var payload TokenPayload
	if err := json.Unmarshal(dataBytes, &payload); err != nil {
		return nil, ErrInvalidToken
	}

	if time.Now().Unix() > payload.ExpiresAt {
		return nil, ErrInvalidToken
	}

	user, err := s.db.GetUserByID(payload.UserID)
	if err != nil || !user.Active {
		return nil, ErrUserNotFound
	}

	userCopy := *user
	return &userCopy, nil
}

// GetUserByID busca usuário pelo ID no PostgreSQL
func (s *AuthService) GetUserByID(id string) (*models.User, error) {
	return s.db.GetUserByID(id)
}

// ListUsers lista todos os usuários cadastrados no PostgreSQL
func (s *AuthService) ListUsers() ([]*models.User, error) {
	return s.db.ListUsers()
}

// CreateUser cadastra um novo usuário no PostgreSQL
func (s *AuthService) CreateUser(name, email, role, department, password, phone string) (*models.User, error) {
	cleanEmail := strings.ToLower(models.SanitizeText(email))

	// Verifica se já existe
	if _, err := s.db.GetUserByEmail(cleanEmail); err == nil {
		return nil, ErrEmailAlreadyExists
	}

	cleanName := models.SanitizeText(name)
	if cleanName == "" {
		return nil, errors.New("nome é obrigatório")
	}

	if len(password) < 6 {
		return nil, errors.New("senha deve possuir no mínimo 6 caracteres")
	}

	uRole := models.RoleOperador
	if role == string(models.RoleGestor) {
		uRole = models.RoleGestor
	} else if role == string(models.RoleAdmin) {
		uRole = models.RoleAdmin
	}

	id := "usr-" + uuid.New().String()[:8]
	now := time.Now().UTC()

	newUser := &models.User{
		ID:         id,
		Name:       cleanName,
		Email:      cleanEmail,
		Role:       uRole,
		Department: models.SanitizeText(department),
		Active:     true,
		CreatedAt:  now,
		LastLogin:  now,
		Phone:      models.SanitizeText(phone),
	}

	if err := s.db.CreateUser(newUser, password); err != nil {
		return nil, fmt.Errorf("erro ao salvar usuário no banco: %w", err)
	}

	return newUser, nil
}

// UpdateUser atualiza os dados e permissões de um usuário existente no PostgreSQL
func (s *AuthService) UpdateUser(id, name, email, role, department, phone string, active bool) (*models.User, error) {
	cleanName := models.SanitizeText(name)
	cleanEmail := strings.ToLower(models.SanitizeText(email))
	cleanDept := models.SanitizeText(department)
	cleanPhone := models.SanitizeText(phone)

	if cleanName == "" {
		return nil, errors.New("nome não pode ser vazio")
	}
	if cleanEmail == "" {
		return nil, errors.New("e-mail não pode ser vazio")
	}

	uRole := models.RoleOperador
	if role == string(models.RoleGestor) {
		uRole = models.RoleGestor
	} else if role == string(models.RoleAdmin) {
		uRole = models.RoleAdmin
	}

	updated, err := s.db.UpdateUser(id, cleanName, cleanEmail, string(uRole), cleanDept, cleanPhone, active)
	if err != nil {
		return nil, fmt.Errorf("erro ao atualizar usuário no postgres: %w", err)
	}

	return updated, nil
}

// UpdateUserProfile atualiza dados do próprio usuário autenticado
func (s *AuthService) UpdateUserProfile(id, name, phone, department string) (*models.User, error) {
	return s.db.UpdateUserProfile(id, name, phone, department)
}

// ChangePassword altera a senha do usuário no banco
func (s *AuthService) ChangePassword(id, oldPassword, newPassword string) error {
	if len(newPassword) < 6 {
		return errors.New("a nova senha deve ter no mínimo 6 caracteres")
	}
	return s.db.ChangePassword(id, oldPassword, newPassword)
}

func (s *AuthService) generateToken(user *models.User) (string, error) {
	payload := TokenPayload{
		UserID:    user.ID,
		Email:     user.Email,
		Role:      user.Role,
		ExpiresAt: time.Now().Add(24 * time.Hour).Unix(),
	}

	dataBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	dataB64 := base64.RawURLEncoding.EncodeToString(dataBytes)

	h := hmac.New(sha256.New, s.jwtSecret)
	h.Write(dataBytes)
	sigBytes := h.Sum(nil)
	sigB64 := base64.RawURLEncoding.EncodeToString(sigBytes)

	return fmt.Sprintf("%s.%s", dataB64, sigB64), nil
}

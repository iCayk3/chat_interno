package models

import (
	"strings"
	"time"
)

// UserRole define os níveis de acesso RBAC no CRM
type UserRole string

const (
	RoleOperador UserRole = "operador"
	RoleGestor   UserRole = "gestor"
	RoleAdmin    UserRole = "admin"
)

// User representa o usuário autenticado do sistema
// Regra 7 de segurança: PasswordHash tem tag json:"-" e NUNCA é enviado em respostas JSON
type User struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	Role         UserRole  `json:"role"`
	Department   string    `json:"department"`
	PasswordHash string    `json:"-"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"createdAt"`
	LastLogin    time.Time `json:"lastLogin"`
	Phone        string    `json:"phone,omitempty"`
}

// LoginRequest payload de requisição de login
// Regra 1 de segurança: Validação estrita de tipos e tamanhos
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse retorno com token de sessão seguro e dados públicos do usuário
type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// ValidateLoginRequest valida campos obrigatórios do formulário no servidor (Regra 1)
func ValidateLoginRequest(req LoginRequest) (string, string, bool) {
	cleanEmail := strings.ToLower(SanitizeText(req.Email))
	cleanPass := strings.TrimSpace(req.Password)

	if cleanEmail == "" || len(cleanEmail) > 150 || !strings.Contains(cleanEmail, "@") {
		return "", "", false
	}

	if cleanPass == "" || len(cleanPass) < 6 || len(cleanPass) > 100 {
		return "", "", false
	}

	return cleanEmail, cleanPass, true
}

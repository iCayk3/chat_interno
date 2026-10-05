package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"chat-interno-server/internal/models"
)

// HandleLogin processa a autenticação de operadores, gestores e administradores
// Regras 1, 2, 7 e 10 de segurança rigorosamente aplicadas
func (h *Handler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Corpo da requisição inválido. Informe e-mail e senha em formato JSON.",
		})
		return
	}

	cleanEmail, cleanPass, valid := models.ValidateLoginRequest(req)
	if !valid {
		w.WriteHeader(http.StatusUnprocessableEntity)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Informe um e-mail válido e senha com no mínimo 6 caracteres.",
		})
		return
	}

	user, token, err := h.authService.Authenticate(cleanEmail, cleanPass)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Credenciais inválidas. Verifique seu e-mail e senha.",
		})
		return
	}

	resp := models.LoginResponse{
		Token: token,
		User:  *user,
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// HandleGetMe retorna os dados do usuário autenticado a partir do token Bearer
func (h *Handler) HandleGetMe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := h.extractAuthUser(r)
	if user == nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Sessão inválida ou expirada. Faça login novamente.",
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(user)
}

// HandleListUsers lista usuários cadastrados com filtragem por permissão (Gestor só vê seu time, Admin vê tudo)
func (h *Handler) HandleListUsers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := h.extractAuthUser(r)
	if user == nil || (user.Role != models.RoleAdmin && user.Role != models.RoleGestor) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Acesso negado. Apenas gestores e administradores podem listar atendentes.",
		})
		return
	}

	users, err := h.authService.ListUsers()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Falha ao consultar usuários no PostgreSQL.",
		})
		return
	}

	// Gestor: enxerga exclusivamente os atendentes da sua equipe / departamento
	if user.Role == models.RoleGestor {
		teamUsers := make([]*models.User, 0)
		for _, u := range users {
			if strings.EqualFold(strings.TrimSpace(u.Department), strings.TrimSpace(user.Department)) {
				teamUsers = append(teamUsers, u)
			}
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(teamUsers)
		return
	}

	// Administrador: acesso irrestrito
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(users)
}

// HandleCreateUser cadastra novo atendente/usuário no sistema
func (h *Handler) HandleCreateUser(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := h.extractAuthUser(r)
	if user == nil || (user.Role != models.RoleAdmin && user.Role != models.RoleGestor) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Acesso negado. Apenas gestores e administradores podem cadastrar atendentes.",
		})
		return
	}

	var req struct {
		Name       string `json:"name"`
		Email      string `json:"email"`
		Role       string `json:"role"`
		Department string `json:"department"`
		Password   string `json:"password"`
		Phone      string `json:"phone"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Dados inválidos para criação de usuário.",
		})
		return
	}

	// Se for gestor, trava o departamento no departamento do gestor e impede criação de admins
	if user.Role == models.RoleGestor {
		req.Department = user.Department
		req.Role = string(models.RoleOperador)
	}

	newUser, err := h.authService.CreateUser(req.Name, req.Email, req.Role, req.Department, req.Password, req.Phone)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(newUser)
}

// HandleUpdateUser atualiza os dados cadastrais e permissões de um atendente/usuário existente
func (h *Handler) HandleUpdateUser(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := h.extractAuthUser(r)
	if user == nil || (user.Role != models.RoleAdmin && user.Role != models.RoleGestor) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Acesso negado. Apenas gestores e administradores podem editar atendentes.",
		})
		return
	}

	targetID := chi.URLParam(r, "id")
	if targetID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "ID do usuário é obrigatório.",
		})
		return
	}

	var req struct {
		Name       string `json:"name"`
		Email      string `json:"email"`
		Role       string `json:"role"`
		Department string `json:"department"`
		Phone      string `json:"phone"`
		Active     bool   `json:"active"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "JSON inválido para edição de usuário.",
		})
		return
	}

	// Validação Anti-IDOR para Gestor
	if user.Role == models.RoleGestor {
		target, err := h.authService.GetUserByID(targetID)
		if err != nil || target == nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Atendente não encontrado.",
			})
			return
		}
		if !strings.EqualFold(strings.TrimSpace(target.Department), strings.TrimSpace(user.Department)) {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Acesso negado. Você só pode gerenciar atendentes da sua própria equipe.",
			})
			return
		}
		// Gestor não pode transferir para outro departamento nem promover a admin
		req.Department = user.Department
		if target.Role == models.RoleAdmin {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Acesso negado. Você não pode modificar um administrador.",
			})
			return
		}
		req.Role = string(target.Role)
	}

	updated, err := h.authService.UpdateUser(targetID, req.Name, req.Email, req.Role, req.Department, req.Phone, req.Active)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(updated)
}

// HandleUpdateProfile atualiza informações pessoais do próprio usuário
func (h *Handler) HandleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := h.extractAuthUser(r)
	if user == nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Usuário não autenticado.",
		})
		return
	}

	var req struct {
		Name       string `json:"name"`
		Phone      string `json:"phone"`
		Department string `json:"department"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido."})
		return
	}

	updated, err := h.authService.UpdateUserProfile(user.ID, req.Name, req.Phone, req.Department)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Falha ao atualizar dados."})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(updated)
}

// HandleChangePassword altera a senha do usuário autenticado
func (h *Handler) HandleChangePassword(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := h.extractAuthUser(r)
	if user == nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Usuário não autenticado."})
		return
	}

	var req struct {
		OldPassword string `json:"oldPassword"`
		NewPassword string `json:"newPassword"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido."})
		return
	}

	if err := h.authService.ChangePassword(user.ID, req.OldPassword, req.NewPassword); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Senha alterada com sucesso."})
}

// extractAuthUser obtém o usuário autenticado a partir do Bearer Token
func (h *Handler) extractAuthUser(r *http.Request) *models.User {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return nil
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return nil
	}

	user, err := h.authService.ValidateToken(parts[1])
	if err != nil {
		return nil
	}

	return user
}

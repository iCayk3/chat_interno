package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"chat-interno-server/internal/models"
)

// HandleRBXCustomerLookup busca os dados cadastrais do cliente no RBX pelo CPF/CNPJ
func (h *Handler) HandleRBXCustomerLookup(w http.ResponseWriter, r *http.Request) {
	cpfCnpj := r.URL.Query().Get("cpfCnpj")
	if cpfCnpj == "" {
		cpfCnpj = r.URL.Query().Get("query")
	}

	if strings.TrimSpace(cpfCnpj) == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Parâmetro cpfCnpj é obrigatório"})
		return
	}

	client, err := h.rbxService.LookupClientByCPFCNPJ(r.Context(), cpfCnpj)
	if err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, client)
}

// HandleRBXFinancial retorna os títulos em aberto e situação financeira do cliente
func (h *Handler) HandleRBXFinancial(w http.ResponseWriter, r *http.Request) {
	customerId := r.URL.Query().Get("customerId")
	cpfCnpj := r.URL.Query().Get("cpfCnpj")

	if customerId == "" && cpfCnpj == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Informe customerId ou cpfCnpj"})
		return
	}

	financial, err := h.rbxService.GetClientFinancial(r.Context(), customerId, cpfCnpj)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, financial)
}

// HandleRBXPix gera o código Pix Copia e Cola para um boleto
func (h *Handler) HandleRBXPix(w http.ResponseWriter, r *http.Request) {
	var body struct {
		BilletID int64 `json:"billetId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.BilletID == 0 {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "billetId é obrigatório"})
		return
	}

	pixCode, err := h.rbxService.GetPixCopiaCola(r.Context(), body.BilletID)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"billetId":     body.BilletID,
		"pixCopiaCola": pixCode,
	})
}

// HandleRBXBoleto gera o link de download do boleto bancário em PDF
func (h *Handler) HandleRBXBoleto(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DocumentID int64 `json:"documentId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.DocumentID == 0 {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "documentId é obrigatório"})
		return
	}

	link, err := h.rbxService.GetBoletoPDF(r.Context(), body.DocumentID)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"documentId": body.DocumentID,
		"boletoLink": link,
	})
}

// HandleRBXPromessa registra o aviso de pagamento / desbloqueio em confiança
func (h *Handler) HandleRBXPromessa(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CustomerID string      `json:"customerId"`
		DocumentID interface{} `json:"documentId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload inválido"})
		return
	}

	var docID int64
	switch v := body.DocumentID.(type) {
	case float64:
		docID = int64(v)
	case string:
		docID, _ = strconv.ParseInt(v, 10, 64)
	}

	resp, err := h.rbxService.SendPaymentNotification(r.Context(), body.CustomerID, docID)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, resp)
}

// HandleRBXGetConfig retorna a configuração atual do RBX
func (h *Handler) HandleRBXGetConfig(w http.ResponseWriter, r *http.Request) {
	cfg := h.rbxService.GetConfig()
	h.respondJSON(w, http.StatusOK, cfg)
}

// HandleRBXSaveConfig atualiza a configuração do RBX (Gestor e Admin)
func (h *Handler) HandleRBXSaveConfig(w http.ResponseWriter, r *http.Request) {
	user := h.extractAuthUser(r)
	if user == nil || (user.Role != models.RoleAdmin && user.Role != models.RoleGestor) {
		h.respondJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso não autorizado"})
		return
	}

	var cfg models.RBXConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if err := h.rbxService.SaveConfig(&cfg); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Configurações do RBX salvas com sucesso!",
		"config":  cfg,
	})
}

// HandleRBXTestConnection testa a conexão com o servidor RBX
func (h *Handler) HandleRBXTestConnection(w http.ResponseWriter, r *http.Request) {
	res, err := h.rbxService.TestConnection(r.Context())
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, res)
}

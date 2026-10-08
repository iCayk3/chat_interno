package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"master-license-server/internal/models"
	"master-license-server/internal/services"
)

type MasterHandler struct {
	service *services.MasterService
	apiKey  string
}

func NewMasterHandler(service *services.MasterService, apiKey string) *MasterHandler {
	return &MasterHandler{
		service: service,
		apiKey:  apiKey,
	}
}

// AdminAuthMiddleware protege rotas de gestão da Master API
func (h *MasterHandler) AdminAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Se nenhuma chave foi configurada, permite localmente para facilidade de uso
		if h.apiKey == "" {
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		key := strings.TrimPrefix(authHeader, "Bearer ")
		if key == "" {
			key = r.URL.Query().Get("api_key")
		}

		if key != h.apiKey {
			h.respondJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "Acesso não autorizado ao Painel Central Mestre",
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}

// HandleHeartbeat responde às requisições periódicas de verificação dos softwares clientes
func (h *MasterHandler) HandleHeartbeat(w http.ResponseWriter, r *http.Request) {
	var req models.LicenseHeartbeatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	res, err := h.service.ProcessHeartbeat(req)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, res)
}

// HandleActivateLicense ativa uma chave informada pelo cliente
func (h *MasterHandler) HandleActivateLicense(w http.ResponseWriter, r *http.Request) {
	var req models.LicenseHeartbeatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	res, err := h.service.ProcessActivation(req)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, res)
}

// HandleAutoRegister cadastra automaticamente uma nova instalação ou identifica instalação existente
func (h *MasterHandler) HandleAutoRegister(w http.ResponseWriter, r *http.Request) {
	var req models.AutoRegisterTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	res, err := h.service.AutoRegisterTenant(req)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, res)
}

// HandleListTenants lista todos os clientes cadastrados
func (h *MasterHandler) HandleListTenants(w http.ResponseWriter, r *http.Request) {
	list := h.service.ListTenants()
	h.respondJSON(w, http.StatusOK, list)
}

// HandleCreateTenant cadastra novo cliente e gera chave
func (h *MasterHandler) HandleCreateTenant(w http.ResponseWriter, r *http.Request) {
	var req models.CreateTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if strings.TrimSpace(req.TenantName) == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Razão Social / Nome da Empresa é obrigatório"})
		return
	}

	tenant, err := h.service.CreateTenant(req)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusCreated, tenant)
}

// HandleGetTenant busca detalhes por ID
func (h *MasterHandler) HandleGetTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tenant, err := h.service.GetTenant(id)
	if err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, tenant)
}

// HandleUpdateTenantStatus altera status para ativo, suspenso, revogado ou cortesia
func (h *MasterHandler) HandleUpdateTenantStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.UpdateTenantStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	tenant, err := h.service.UpdateTenantStatus(id, req)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, tenant)
}

// HandleExtendTrial prorroga a avaliação gratuita (+15, +30, etc.)
func (h *MasterHandler) HandleExtendTrial(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.ExtendTrialRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if req.DaysToAdd <= 0 {
		req.DaysToAdd = 30
	}

	tenant, err := h.service.ExtendTrial(id, req.DaysToAdd)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, tenant)
}

// HandleUpdateDiscount aplica ou edita o desconto concedido
func (h *MasterHandler) HandleUpdateDiscount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.UpdateDiscountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	tenant, err := h.service.UpdateDiscount(id, req)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, tenant)
}

// HandleUpdateOperationMode altera o modelo de operação liberado (erp, native, hybrid)
func (h *MasterHandler) HandleUpdateOperationMode(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.UpdateOperationModeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	tenant, err := h.service.UpdateOperationMode(id, req.AllowedOperationMode)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Modelo de operação atualizado com sucesso",
		"tenant":  tenant,
	})
}

// HandleUpdateBilling atualiza dados de PIX e QR Code para regularização
func (h *MasterHandler) HandleUpdateBilling(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.UpdateBillingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	tenant, err := h.service.UpdateBilling(id, req)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, tenant)
}

// HandleDeleteTenant exclui um cliente
func (h *MasterHandler) HandleDeleteTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.service.DeleteTenant(id); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]string{"message": "Cliente removido com sucesso"})
}

// HandleGetStats retorna estatísticas consolidadas
func (h *MasterHandler) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	stats := h.service.GetStats()
	h.respondJSON(w, http.StatusOK, stats)
}

// HandleGetFinanceSettings retorna as configurações de recebimento do Proprietário
func (h *MasterHandler) HandleGetFinanceSettings(w http.ResponseWriter, r *http.Request) {
	settings := h.service.GetFinanceSettings()
	// Mascara token sensível na leitura se configurado
	if settings.MercadoPagoAccessToken != "" && len(settings.MercadoPagoAccessToken) > 10 {
		t := settings.MercadoPagoAccessToken
		settings.MercadoPagoAccessToken = t[:6] + "..." + t[len(t)-4:]
	}
	h.respondJSON(w, http.StatusOK, settings)
}

// HandleSaveFinanceSettings salva as configurações de PIX e Mercado Pago do Proprietário
func (h *MasterHandler) HandleSaveFinanceSettings(w http.ResponseWriter, r *http.Request) {
	var req models.MasterFinanceSettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	current := h.service.GetFinanceSettings()
	// Se o token vier mascarado, mantém o anterior
	if strings.Contains(req.MercadoPagoAccessToken, "...") {
		req.MercadoPagoAccessToken = current.MercadoPagoAccessToken
	}

	if err := h.service.UpdateFinanceSettings(req); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Configurações financeiras do Master salvas com sucesso!",
		"finance": req,
	})
}

// HandleGetPlanOptions retorna os planos mensal e anual disponíveis com preços calculados
func (h *MasterHandler) HandleGetPlanOptions(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("license_key")
	options, err := h.service.GetPlanOptions(key)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, options)
}

// HandleCreateCheckout processa a solicitação de assinatura (mensal ou anual) e gera a cobrança
func (h *MasterHandler) HandleCreateCheckout(w http.ResponseWriter, r *http.Request) {
	var req models.CreateCheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if req.LicenseKey == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Chave da instalação não informada"})
		return
	}

	resp, err := h.service.CreateCheckout(req)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, resp)
}

// HandleConfirmPayment libera o software imediatamente após a identificação do pagamento
func (h *MasterHandler) HandleConfirmPayment(w http.ResponseWriter, r *http.Request) {
	var req models.ConfirmPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if req.LicenseKey == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Chave da instalação não informada"})
		return
	}

	tenant, err := h.service.ConfirmPayment(req)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Pagamento confirmado com sucesso! Instalação liberada.",
		"tenant":  tenant,
	})
}

// HandleMercadoPagoWebhook recebe notificações do Mercado Pago e libera automaticamente o cliente
func (h *MasterHandler) HandleMercadoPagoWebhook(w http.ResponseWriter, r *http.Request) {
	paymentID := r.URL.Query().Get("data.id")
	if paymentID == "" {
		paymentID = r.URL.Query().Get("id")
	}

	if paymentID == "" {
		var body struct {
			Data struct {
				ID string `json:"id"`
			} `json:"data"`
			Type string `json:"type"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		paymentID = body.Data.ID
	}

	if paymentID != "" {
		_ = h.service.ProcessMercadoPagoWebhook(paymentID)
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (h *MasterHandler) respondJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(data)
}

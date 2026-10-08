package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"chat-interno-server/internal/models"
)

// LicenseMiddleware intercepta as requisições à API e bloqueia acesso se o software estiver suspenso ou expirado
func (h *Handler) LicenseMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Rotas liberadas mesmo quando suspenso (Login, consulta de licença, ativação e webhooks)
		if strings.HasPrefix(path, "/api/health") ||
			strings.HasPrefix(path, "/api/auth/login") ||
			strings.HasPrefix(path, "/api/auth/me") ||
			strings.HasPrefix(path, "/api/system/license") ||
			strings.HasPrefix(path, "/api/webhooks/") ||
			strings.HasPrefix(path, "/ws") {
			next.ServeHTTP(w, r)
			return
		}

		if h.licenseService != nil && !h.licenseService.IsLicenseActive() {
			lic, _ := h.licenseService.GetLicenseStatus()
			reason := "Licença suspensa ou período de avaliação gratuito de 30 dias expirado."
			var pix, qrCode string
			var amount float64
			var supportPhone, supportEmail string

			if lic != nil {
				if lic.SuspensionReason != "" {
					reason = lic.SuspensionReason
				}
				pix = lic.PaymentPix
				qrCode = lic.PaymentQRCodeBase64
				amount = lic.PaymentAmount
				supportPhone = lic.ContactSupportPhone
				supportEmail = lic.ContactSupportEmail
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusPaymentRequired) // 402 Payment Required
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"error":               "license_suspended",
				"message":             reason,
				"licenseStatus":       "suspended",
				"paymentPix":          pix,
				"paymentQrCodeBase64": qrCode,
				"paymentAmount":       amount,
				"contactSupportPhone": supportPhone,
				"contactSupportEmail": supportEmail,
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}

// HandleGetLicenseStatus retorna o status da licença para o painel web
func (h *Handler) HandleGetLicenseStatus(w http.ResponseWriter, r *http.Request) {
	if h.licenseService == nil {
		h.respondJSON(w, http.StatusOK, map[string]interface{}{
			"status":             "trial",
			"licenseType":        "trial",
			"trialDaysRemaining": 30,
			"active":             true,
		})
		return
	}

	lic, err := h.licenseService.GetLicenseStatus()
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, "Erro ao consultar status da licença")
		return
	}

	h.respondJSON(w, http.StatusOK, lic)
}

// HandleActivateLicense ativa manualmente uma chave de licença no software
func (h *Handler) HandleActivateLicense(w http.ResponseWriter, r *http.Request) {
	var req models.ActivateLicenseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Payload inválido")
		return
	}

	if h.licenseService == nil {
		h.respondError(w, http.StatusServiceUnavailable, "Serviço de licenciamento não inicializado")
		return
	}

	updated, err := h.licenseService.ActivateLicense(r.Context(), req.LicenseKey)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Licença ativada com sucesso!",
		"license": updated,
	})
}

// HandleRefreshLicense força um heartbeat imediato com o Super Sistema Master
func (h *Handler) HandleRefreshLicense(w http.ResponseWriter, r *http.Request) {
	if h.licenseService == nil {
		h.respondError(w, http.StatusServiceUnavailable, "Serviço de licenciamento não inicializado")
		return
	}

	if err := h.licenseService.PerformHeartbeat(r.Context()); err != nil {
		h.respondError(w, http.StatusInternalServerError, "Falha ao sincronizar com o Servidor Mestre")
		return
	}

	lic, _ := h.licenseService.GetLicenseStatus()
	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Status da licença sincronizado!",
		"license": lic,
	})
}

// HandleGetLicensePlans retorna as opções de assinatura mensal e anual consultadas no Master
func (h *Handler) HandleGetLicensePlans(w http.ResponseWriter, r *http.Request) {
	if h.licenseService == nil {
		h.respondError(w, http.StatusServiceUnavailable, "Serviço de licenciamento não inicializado")
		return
	}

	plans, err := h.licenseService.GetPlanOptions(r.Context())
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.respondJSON(w, http.StatusOK, plans)
}

// HandleCreateLicenseCheckout gera a cobrança por PIX ou Cartão/Mercado Pago
func (h *Handler) HandleCreateLicenseCheckout(w http.ResponseWriter, r *http.Request) {
	if h.licenseService == nil {
		h.respondError(w, http.StatusServiceUnavailable, "Serviço de licenciamento não inicializado")
		return
	}

	var req models.CreateLicenseCheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Payload inválido")
		return
	}

	resp, err := h.licenseService.CreateCheckout(r.Context(), req.Cycle, req.PaymentMethod)
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.respondJSON(w, http.StatusOK, resp)
}

// HandleCheckPaymentStatus verifica junto ao Master se o pagamento foi identificado e libera
func (h *Handler) HandleCheckPaymentStatus(w http.ResponseWriter, r *http.Request) {
	if h.licenseService == nil {
		h.respondError(w, http.StatusServiceUnavailable, "Serviço de licenciamento não inicializado")
		return
	}

	lic, err := h.licenseService.CheckPaymentStatus(r.Context())
	if err != nil {
		h.respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"active":  lic.Status == models.LicenseStatusActive || lic.Status == models.LicenseStatusTrial,
		"license": lic,
	})
}

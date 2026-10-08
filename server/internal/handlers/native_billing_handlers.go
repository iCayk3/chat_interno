package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"chat-interno-server/internal/models"
	"chat-interno-server/internal/services"
)

// ============================================================================
// SYSTEM SETTINGS & SETUP WIZARD HANDLERS
// ============================================================================

func (h *Handler) HandleGetSystemSettings(w http.ResponseWriter, r *http.Request) {
	if h.nativeBillingService == nil {
		h.respondJSON(w, http.StatusOK, map[string]interface{}{
			"operationMode":  "erp",
			"setupCompleted": false,
		})
		return
	}
	res, err := h.nativeBillingService.GetSystemSettingsResponse()
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, res)
}

func (h *Handler) HandleSaveSystemSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OperationMode  string `json:"operationMode"`
		SetupCompleted *bool  `json:"setupCompleted"`
		CompanyName    string `json:"companyName"`
		CompanyCNPJ    string `json:"companyCnpj"`
		CompanyPhone   string `json:"companyPhone"`
		CompanyEmail   string `json:"companyEmail"`
		MercadoPago    struct {
			AccessToken   string `json:"accessToken"`
			PublicKey     string `json:"publicKey"`
			WebhookSecret string `json:"webhookSecret"`
			Sandbox       bool   `json:"sandbox"`
		} `json:"mercadopago"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	// Validação de entrada (Regra 1)
	opMode := models.OperationMode(body.OperationMode)
	if opMode != models.OperationModeERP && opMode != models.OperationModeNative && opMode != models.OperationModeHybrid {
		opMode = models.OperationModeERP
	}

	// Validação de Liberação por Licença (Master)
	if h.licenseService != nil {
		lic, _ := h.licenseService.GetLicenseStatus()
		if lic != nil && lic.AllowedOperationMode != "" && lic.AllowedOperationMode != "hybrid" {
			if string(opMode) != lic.AllowedOperationMode {
				modeName := "Integrado com ERP"
				if lic.AllowedOperationMode == "native" {
					modeName = "Nativo (Mercado Pago)"
				}
				h.respondJSON(w, http.StatusForbidden, map[string]string{
					"error": fmt.Sprintf("A sua licença autoriza exclusivamente o modo '%s'. Para utilizar outros modos operacionais, solicite a liberação no Master.", modeName),
				})
				return
			}
		}
	}

	// Carrega configurações existentes para manter tokens caso não tenham sido alterados
	existing, _ := h.nativeBillingService.GetSystemSettings()
	if existing == nil {
		existing = &models.SystemSettings{}
	}

	existing.OperationMode = opMode
	if body.SetupCompleted != nil {
		existing.SetupCompleted = *body.SetupCompleted
	} else {
		existing.SetupCompleted = true
	}

	if body.CompanyName != "" {
		existing.CompanyName = services.SanitizeString(body.CompanyName)
	}
	if body.CompanyCNPJ != "" {
		existing.CompanyCNPJ = services.CleanNumberDoc(body.CompanyCNPJ)
	}
	if body.CompanyPhone != "" {
		existing.CompanyPhone = services.CleanNumberDoc(body.CompanyPhone)
	}
	if body.CompanyEmail != "" {
		existing.CompanyEmail = strings.TrimSpace(body.CompanyEmail)
	}

	// Atualiza credenciais do Mercado Pago apenas se fornecido valor novo
	if body.MercadoPago.AccessToken != "" && !strings.Contains(body.MercadoPago.AccessToken, "...") {
		existing.MercadoPago.AccessToken = strings.TrimSpace(body.MercadoPago.AccessToken)
	}
	if body.MercadoPago.PublicKey != "" {
		existing.MercadoPago.PublicKey = strings.TrimSpace(body.MercadoPago.PublicKey)
	}
	if body.MercadoPago.WebhookSecret != "" && !strings.Contains(body.MercadoPago.WebhookSecret, "••") {
		existing.MercadoPago.WebhookSecret = strings.TrimSpace(body.MercadoPago.WebhookSecret)
	}
	existing.MercadoPago.Sandbox = body.MercadoPago.Sandbox

	if err := h.nativeBillingService.SaveSystemSettings(existing); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao salvar configurações do sistema"})
		return
	}

	res, _ := h.nativeBillingService.GetSystemSettingsResponse()
	h.respondJSON(w, http.StatusOK, res)
}

func (h *Handler) HandleTestMercadoPago(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AccessToken string `json:"accessToken"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	ok, msg, err := h.nativeBillingService.TestMercadoPago(r.Context(), body.AccessToken)
	if err != nil || !ok {
		h.respondJSON(w, http.StatusBadRequest, map[string]interface{}{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": msg,
	})
}

// ============================================================================
// NATIVE PLANS HANDLERS
// ============================================================================

func (h *Handler) HandleListNativePlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.nativeBillingService.ListPlans()
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, plans)
}

func (h *Handler) HandleCreateNativePlan(w http.ResponseWriter, r *http.Request) {
	var body models.NativePlan
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	plan, err := h.nativeBillingService.CreatePlan(&body)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusCreated, plan)
}

func (h *Handler) HandleUpdateNativePlan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID do plano é obrigatório"})
		return
	}

	var body models.NativePlan
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	plan, err := h.nativeBillingService.UpdatePlan(id, &body)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, plan)
}

func (h *Handler) HandleDeleteNativePlan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID do plano é obrigatório"})
		return
	}

	if err := h.nativeBillingService.DeletePlan(id); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ============================================================================
// NATIVE CUSTOMERS HANDLERS
// ============================================================================

func (h *Handler) HandleListNativeCustomers(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	status := r.URL.Query().Get("status")
	planId := r.URL.Query().Get("planId")

	customers, err := h.nativeBillingService.ListCustomers(search, status, planId)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, customers)
}

func (h *Handler) HandleGetNativeCustomer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	customer, err := h.nativeBillingService.GetCustomer(id)
	if err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": "Cliente não localizado"})
		return
	}
	h.respondJSON(w, http.StatusOK, customer)
}

func (h *Handler) HandleLookupNativeCustomer(w http.ResponseWriter, r *http.Request) {
	cpfCnpj := r.URL.Query().Get("cpfCnpj")
	if cpfCnpj == "" {
		cpfCnpj = r.URL.Query().Get("query")
	}
	if strings.TrimSpace(cpfCnpj) == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Informe cpfCnpj para consulta"})
		return
	}

	customer, err := h.nativeBillingService.GetCustomerByCPF(cpfCnpj)
	if err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": "Cliente não localizado na base nativa"})
		return
	}
	h.respondJSON(w, http.StatusOK, customer)
}

func (h *Handler) HandleCreateNativeCustomer(w http.ResponseWriter, r *http.Request) {
	var body models.CreateCustomerRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	customer, err := h.nativeBillingService.CreateCustomer(body)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusCreated, customer)
}

func (h *Handler) HandleUpdateNativeCustomer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID do cliente é obrigatório"})
		return
	}

	var body models.CreateCustomerRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	customer, err := h.nativeBillingService.UpdateCustomer(id, body)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, customer)
}

func (h *Handler) HandleDeleteNativeCustomer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID do cliente é obrigatório"})
		return
	}

	if err := h.nativeBillingService.DeleteCustomer(id); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ============================================================================
// NATIVE INVOICES & MERCADO PAGO HANDLERS
// ============================================================================

func (h *Handler) HandleListNativeInvoices(w http.ResponseWriter, r *http.Request) {
	customerId := r.URL.Query().Get("customerId")
	cpf := r.URL.Query().Get("cpfCnpj")
	status := r.URL.Query().Get("status")

	invoices, err := h.nativeBillingService.ListInvoices(customerId, cpf, status)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, invoices)
}

func (h *Handler) HandleGetNativeInvoice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	inv, err := h.nativeBillingService.GetInvoice(id)
	if err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": "Fatura não localizada"})
		return
	}
	h.respondJSON(w, http.StatusOK, inv)
}

func (h *Handler) HandleCreateNativeInvoice(w http.ResponseWriter, r *http.Request) {
	var body models.CreateInvoiceRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	inv, err := h.nativeBillingService.CreateInvoice(body)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusCreated, inv)
}

func (h *Handler) HandleGenerateInvoicePix(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID da fatura é obrigatório"})
		return
	}

	inv, err := h.nativeBillingService.GeneratePixForInvoice(r.Context(), id)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":         true,
		"invoiceId":       inv.ID,
		"pixQrCode":       inv.PixQRCode,
		"pixQrCodeBase64": inv.PixQRCodeBase64,
		"status":          inv.Status,
	})
}

func (h *Handler) HandleGenerateInvoiceBoleto(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID da fatura é obrigatório"})
		return
	}

	inv, err := h.nativeBillingService.GenerateBoletoForInvoice(r.Context(), id)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"invoiceId":     inv.ID,
		"boletoUrl":     inv.BoletoURL,
		"boletoBarcode": inv.BoletoBarcode,
		"status":        inv.Status,
	})
}

func (h *Handler) HandlePayInvoiceManual(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	inv, err := h.nativeBillingService.MarkInvoiceAsPaidManual(id)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, inv)
}

// HandleSendNativeInvoiceToChat despacha o Pix ou Boleto diretamente na conversa ativa do cliente
func (h *Handler) HandleSendNativeInvoiceToChat(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ConversationID string `json:"conversationId"`
		InvoiceID      string `json:"invoiceId"`
		Method         string `json:"method"` // "pix" ou "boleto"
		OperatorID     string `json:"operatorId"`
		OperatorName   string `json:"operatorName"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	inv, err := h.nativeBillingService.GetInvoice(body.InvoiceID)
	if err != nil || inv == nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": "Fatura não encontrada"})
		return
	}

	content := ""
	if body.Method == "pix" {
		// Assegura geração do Pix no Mercado Pago
		if inv.PixQRCode == "" {
			inv, err = h.nativeBillingService.GeneratePixForInvoice(r.Context(), inv.ID)
			if err != nil {
				h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
		}
		content = fmt.Sprintf(
			"💳 *Código Pix Copia e Cola para Pagamento*\n\n"+
				"📄 *Fatura:* %s\n"+
				"💰 *Valor:* R$ %.2f\n"+
				"📅 *Vencimento:* %s\n\n"+
				"Copie o código abaixo e pague em seu aplicativo do banco:\n\n```\n%s\n```",
			inv.Description, inv.Amount, inv.DueDate, inv.PixQRCode,
		)
	} else {
		// Assegura geração do Boleto no Mercado Pago
		if inv.BoletoURL == "" {
			inv, err = h.nativeBillingService.GenerateBoletoForInvoice(r.Context(), inv.ID)
			if err != nil {
				h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
		}
		content = fmt.Sprintf(
			"📄 *Boleto Bancário para Pagamento*\n\n"+
				"📌 *Fatura:* %s\n"+
				"💰 *Valor:* R$ %.2f\n"+
				"📅 *Vencimento:* %s\n"+
				"🔢 *Linha Digitável:* %s\n\n"+
				"🔗 *Link do Boleto (PDF):*\n%s",
			inv.Description, inv.Amount, inv.DueDate, inv.BoletoBarcode, inv.BoletoURL,
		)
	}

	opName := body.OperatorName
	if opName == "" {
		opName = "Atendente SOL"
	}
	opID := body.OperatorID
	if opID == "" {
		opID = "op-admin"
	}

	chatMsg := &models.Message{
		ID:             "msg-" + uuid.New().String()[:8],
		ConversationID: body.ConversationID,
		SenderID:       opID,
		SenderName:     opName,
		SenderType:     models.SenderOperator,
		Content:        content,
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}

	_ = h.chatService.SaveMessage(chatMsg)

	// Broadcast na sala e nos canais externos
	wsAction := &models.WSAction{
		Type:    "message",
		Payload: chatMsg,
	}
	h.hub.BroadcastToRoom(body.ConversationID, wsAction, nil)
	h.hub.BroadcastToOperators(wsAction, body.ConversationID)

	// Despacha para WhatsApp/Telegram se a conversa for externa
	if conv, _ := h.chatService.GetConversation(body.ConversationID); conv != nil && conv.Channel != "" && conv.Channel != "mobile" && conv.Channel != "web" {
		if h.channelService != nil {
			h.channelService.SendMessageToChannel(conv, content)
		}
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": chatMsg,
	})
}

// ============================================================================
// MERCADO PAGO WEBHOOK HANDLER
// ============================================================================

func (h *Handler) HandleMercadoPagoWebhook(w http.ResponseWriter, r *http.Request) {
	// 1. Obtém dados do webhook via Query Params ou JSON Body
	dataID := r.URL.Query().Get("data.id")
	if dataID == "" {
		dataID = r.URL.Query().Get("id")
	}

	bodyBytes, _ := io.ReadAll(r.Body)

	if dataID == "" && len(bodyBytes) > 0 {
		var notifPayload struct {
			Action string `json:"action"`
			Type   string `json:"type"`
			Data   struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		if err := json.Unmarshal(bodyBytes, &notifPayload); err == nil {
			dataID = notifPayload.Data.ID
		}
	}

	if dataID == "" {
		// Mercado Pago faz testes de ping sem dataID
		w.WriteHeader(http.StatusOK)
		return
	}

	// 2. Validação de Assinatura HMAC-SHA256 (Cibersegurança estrita - Regra 1)
	settings, err := h.nativeBillingService.GetSystemSettings()
	if err == nil && settings.MercadoPago.WebhookSecret != "" {
		xSignature := r.Header.Get("x-signature")
		xRequestId := r.Header.Get("x-request-id")
		if !h.mercadoPagoService.ValidateWebhookSignature(xSignature, xRequestId, dataID, settings.MercadoPago.WebhookSecret) {
			log.Printf("⚠️ [MERCADO PAGO WEBHOOK REJECTED] Assinatura inválida para notificação ID %s", dataID)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
	}

	// 3. Processa a notificação em goroutine assíncrona para responder 200 OK imediatamente ao Mercado Pago
	go func(targetID string) {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := h.nativeBillingService.ProcessMercadoPagoWebhook(ctx, targetID); err != nil {
			log.Printf("❌ [MERCADO PAGO WEBHOOK ERROR] Falha ao processar pagamento %s: %v", targetID, err)
		}
	}(dataID)

	w.WriteHeader(http.StatusOK)
}

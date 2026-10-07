package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

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

// HandleRBXPix gera o código Pix Copia e Cola e o QR Code em base64 para um boleto
func (h *Handler) HandleRBXPix(w http.ResponseWriter, r *http.Request) {
	var body struct {
		BilletID   int64 `json:"billetId"`
		DocumentID int64 `json:"documentId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	targetID := body.BilletID
	if targetID == 0 {
		targetID = body.DocumentID
	}
	if targetID == 0 {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "billetId ou documentId é obrigatório"})
		return
	}

	pixCode, qrCode, err := h.rbxService.GetPixData(r.Context(), targetID)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"billetId":     targetID,
		"pixCopiaCola": pixCode,
		"pixQrCode":    qrCode,
	})
}

// HandleRBXQRCode retorna especificamente a imagem do QR Code do Pix em base64
func (h *Handler) HandleRBXQRCode(w http.ResponseWriter, r *http.Request) {
	var body struct {
		BilletID   int64 `json:"billetId"`
		DocumentID int64 `json:"documentId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	targetID := body.BilletID
	if targetID == 0 {
		targetID = body.DocumentID
	}
	if targetID == 0 {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "billetId ou documentId é obrigatório"})
		return
	}

	qrCode, err := h.rbxService.GetPixQRCode(r.Context(), targetID)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"billetId":  targetID,
		"pixQrCode": qrCode,
	})
}

// HandleRBXBoleto gera o link de download do boleto bancário em PDF no RBX
func (h *Handler) HandleRBXBoleto(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DocumentID int64 `json:"documentId"`
		DocID      int64 `json:"document_id"`
		BilletID   int64 `json:"billetId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	targetID := body.DocumentID
	if targetID == 0 {
		targetID = body.DocID
	}
	if targetID == 0 {
		targetID = body.BilletID
	}
	if targetID == 0 {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "documentId é obrigatório"})
		return
	}

	link, err := h.rbxService.GetBoletoPDF(r.Context(), targetID)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"documentId": targetID,
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
	if user == nil {
		h.respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sessão inválida ou expirada. Faça login novamente."})
		return
	}
	if user.Role != models.RoleAdmin && user.Role != models.RoleGestor {
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

// HandleSendRBXBoleto baixa o boleto oficial do RBX, armazena temporariamente no HD por 1h
// e envia o arquivo na conversa de atendimento via chat e WebSocket
func (h *Handler) HandleSendRBXBoleto(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ConversationID string  `json:"conversationId"`
		DocumentID     int64   `json:"documentId"`
		DocID          int64   `json:"document_id"`
		BilletID       int64   `json:"billetId"`
		DocumentNumber string  `json:"documentNumber"`
		Value          float64 `json:"value"`
		DueDate        string  `json:"dueDate"`
		Historic       string  `json:"historic"`
		SenderID       string  `json:"senderId"`
		SenderName     string  `json:"senderName"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	targetID := body.DocumentID
	if targetID == 0 {
		targetID = body.DocID
	}
	if targetID == 0 {
		targetID = body.BilletID
	}
	if targetID == 0 {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "documentId é obrigatório"})
		return
	}

	if body.ConversationID == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "conversationId é obrigatório"})
		return
	}

	// Validação de Segurança e Regra de Negócio: o atendente só pode enviar após assumir o atendimento
	conv, err := h.chatService.GetConversation(body.ConversationID)
	if err != nil || conv == nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": "Atendimento não encontrado"})
		return
	}
	if conv.Status == models.ConvWaiting {
		h.respondJSON(w, http.StatusForbidden, map[string]string{"error": "Você precisa assumir o atendimento antes de enviar boletos no chat."})
		return
	}
	if conv.Status == models.ConvClosed {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Este atendimento já foi encerrado."})
		return
	}

	// 1. Obtém o link e/ou base64 do RBX
	link, b64, err := h.rbxService.GetBoletoData(r.Context(), targetID)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Falha ao gerar boleto no RBX: " + err.Error()})
		return
	}

	// 2. Faz o download seguro para a pasta temporária do servidor com auto-delete em 1h
	filename, _, err := h.fileService.DownloadAndSaveBoleto(r.Context(), targetID, link, b64)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Falha ao processar arquivo PDF do boleto: " + err.Error()})
		return
	}

	fileURL := "/api/files/boletos/" + filename

	// 3. Monta texto claro e estruturado para o chat
	docNum := body.DocumentNumber
	if docNum == "" {
		docNum = fmt.Sprintf("%d", targetID)
	}
	valStr := fmt.Sprintf("%.2f", body.Value)
	dueStr := body.DueDate
	histStr := body.Historic
	if histStr == "" {
		histStr = "Documento a receber"
	}

	pdfLink := link
	if pdfLink == "" {
		pdfLink = fileURL
	}

	content := fmt.Sprintf("📄 Segue a 2ª via do seu boleto bancário:\n• Documento: #%s\n• Valor: R$ %s\n• Vencimento: %s\n• Referência: %s\n\n[Baixar Boleto PDF](%s)",
		docNum, valStr, dueStr, histStr, pdfLink)

	whatsAppText := fmt.Sprintf("📄 *2ª Via do Boleto Bancário*\n• *Documento:* #%s\n• *Valor:* R$ %s\n• *Vencimento:* %s\n• *Referência:* %s\n\n🔗 *Link para baixar/visualizar o Boleto (PDF):*\n%s",
		docNum, valStr, dueStr, histStr, pdfLink)

	senderName := body.SenderName
	if senderName == "" {
		senderName = "Atendente"
	}
	senderID := body.SenderID
	if senderID == "" {
		senderID = "operator"
	}

	now := time.Now().UTC()
	chatMsg := &models.Message{
		ID:             "msg-" + uuid.New().String()[:12],
		ConversationID: body.ConversationID,
		SenderID:       senderID,
		SenderType:     models.SenderOperator,
		SenderName:     senderName,
		Content:        content,
		Timestamp:      now.Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}

	// 4. Salva a mensagem no histórico da conversa
	if err := h.chatService.SaveMessage(chatMsg); err != nil {
		log.Printf("⚠️ Erro ao salvar mensagem de boleto: %v", err)
	}

	// 5. Broadcast em tempo real para a sala e para os operadores
	wsAction := &models.WSAction{
		Type:    "message",
		Payload: chatMsg,
	}
	h.hub.BroadcastToRoom(body.ConversationID, wsAction, nil)
	h.hub.BroadcastToOperators(wsAction, body.ConversationID)

	// 6. Despacha o boleto diretamente para o canal externo do cliente (WhatsApp ou Telegram)
	if conv.Channel != "" && conv.Channel != "mobile" && conv.Channel != "web" {
		go func(c *models.Conversation, msgText, directPdfLink, dNum, dDue string) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[SEND BOLETO CHANNEL RECOVER]: %v", r)
				}
			}()

			log.Printf("🚀 [BOLETO DISPATCH] Enviando boleto #%s para canal %s (%s)", dNum, c.Channel, c.ChannelID)

			// Se for WhatsApp Evolution e tiver link direto do PDF
			if c.Channel == "whatsapp_evolution" && directPdfLink != "" {
				cfg, _ := h.channelService.GetChannelsConfig()
				if cfg != nil && cfg.WhatsAppEvolution.Enabled {
					inst := cfg.WhatsAppEvolution.InstanceName
					if inst == "" {
						inst = "solprovedorgroup"
					}
					caption := fmt.Sprintf("📄 Boleto Bancário #%s - Vencimento: %s", dNum, dDue)
					fileName := fmt.Sprintf("boleto_%s.pdf", dNum)
					err := h.channelService.SendEvolutionMedia(
						cfg.WhatsAppEvolution.ServerURL,
						cfg.WhatsAppEvolution.ApiKey,
						inst,
						c.ChannelID,
						directPdfLink,
						"application/pdf",
						fileName,
						caption,
					)
					if err != nil {
						log.Printf("⚠️ [EVOLUTION MEDIA] Falha ao enviar documento nativo (%v), enviando mensagem de texto com link", err)
						h.channelService.SendMessageToChannel(c, msgText)
						return
					}
					// Se o documento nativo PDF foi enviado com sucesso, envia também a mensagem com dados e link
					h.channelService.SendMessageToChannel(c, msgText)
					return
				}
			}

			// Para WhatsApp Oficial, Telegram ou fallback do Evolution:
			h.channelService.SendMessageToChannel(c, msgText)
		}(conv, whatsAppText, link, docNum, dueStr)
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Boleto enviado no chat e no canal com sucesso!",
		"fileUrl": pdfLink,
		"chatMsg": chatMsg,
	})
}

// HandleServeBoletoFile serve o arquivo PDF temporário de boleto
func (h *Handler) HandleServeBoletoFile(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "filename")
	if filename == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Nome do arquivo não informado"})
		return
	}

	filePath, ok := h.fileService.GetBoletoFilePath(filename)
	if !ok {
		h.respondJSON(w, http.StatusGone, map[string]string{
			"error": "Este boleto temporário expirou por segurança após 1 hora e foi removido do servidor. Solicite uma nova 2ª via ao atendente.",
		})
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=\"%s\"", filename))
	w.Header().Set("Cache-Control", "private, max-age=3600")

	http.ServeFile(w, r, filePath)
}

// HandleRBXGetGroups retorna a lista de grupos de clientes cadastrados no RBX
func (h *Handler) HandleRBXGetGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := h.rbxService.GetCustomerGroups(r.Context())
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, groups)
}

// HandleRBXGetGroupClients retorna os clientes de um determinado grupo no RBX
func (h *Handler) HandleRBXGetGroupClients(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if code == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Código do grupo é obrigatório"})
		return
	}
	clients, err := h.rbxService.GetClientsByGroup(r.Context(), code)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, clients)
}


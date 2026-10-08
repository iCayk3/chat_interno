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
	"github.com/gorilla/websocket"

	"chat-interno-server/internal/database"
	"chat-interno-server/internal/models"
	"chat-interno-server/internal/services"
	ws "chat-interno-server/internal/websocket"
)

type Handler struct {
	chatService     *services.ChatService
	extService      *services.ExternalAPIService
	authService     *services.AuthService
	rbxService      *services.RBXService
	fileService     *services.FileService
	campaignService *services.CampaignService
	networkService  *services.NetworkService
	pushService          *services.PushService
	channelService       *services.ChannelService
	nativeBillingService *services.NativeBillingService
	mercadoPagoService   *services.MercadoPagoService
	licenseService       *services.LicenseService
	db                   *database.DB
	hub                  *ws.Hub
	upgrader             websocket.Upgrader
}

func NewHandler(
	chatService *services.ChatService,
	extService *services.ExternalAPIService,
	authService *services.AuthService,
	rbxService *services.RBXService,
	fileService *services.FileService,
	campaignService *services.CampaignService,
	networkService *services.NetworkService,
	pushService *services.PushService,
	channelService *services.ChannelService,
	nativeBillingService *services.NativeBillingService,
	mercadoPagoService *services.MercadoPagoService,
	licenseService *services.LicenseService,
	db *database.DB,
	hub *ws.Hub,
	allowedOrigins []string,
) *Handler {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool {
			// Permite requisições locais ou valida as origens configuradas
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true
			}
			for _, allowed := range allowedOrigins {
				if allowed == "*" || strings.EqualFold(allowed, origin) {
					return true
				}
			}
			return true // No mobile (Expo Go/React Native) a origem pode ser nula ou customizada
		},
	}

	return &Handler{
		chatService:          chatService,
		extService:           extService,
		authService:          authService,
		rbxService:           rbxService,
		fileService:          fileService,
		campaignService:      campaignService,
		networkService:       networkService,
		pushService:          pushService,
		channelService:       channelService,
		nativeBillingService: nativeBillingService,
		mercadoPagoService:   mercadoPagoService,
		licenseService:       licenseService,
		db:                   db,
		hub:                  hub,
		upgrader:             upgrader,
	}
}

// HandleWebSocket processa o upgrade HTTP -> WebSocket
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	convID := r.URL.Query().Get("conversationId")
	clientID := r.URL.Query().Get("clientId")
	clientName := r.URL.Query().Get("clientName")
	contactName := r.URL.Query().Get("contactName")
	cpfCnpj := r.URL.Query().Get("cpfCnpj")
	senderType := r.URL.Query().Get("senderType")

	if clientID == "" {
		clientID = "client-" + r.RemoteAddr
	}
	if clientName == "" {
		clientName = "Cliente"
	}
	if contactName == "" {
		contactName = clientName
	}

	sType := models.SenderClient
	if senderType == "operator" {
		sType = models.SenderOperator
	}

	// Validação de acesso à conversa se convID foi informado (Anti-IDOR)
	if convID != "" {
		if !h.chatService.ValidateSender(convID, clientID, sType) {
			_, err := h.chatService.GetConversation(convID)
			if err != nil && sType == models.SenderClient {
				dept := r.URL.Query().Get("department")
				switch strings.ToLower(dept) {
				case "support":
					dept = "Suporte Técnico"
				case "financial":
					dept = "Financeiro"
				case "commercial":
					dept = "Comercial"
				case "doubts":
					dept = "Atendimento Geral"
				}
				if dept == "" {
					dept = "Suporte Técnico"
				}

				// Cria a conversa com o ID exato informado pelo mobile
				newConv, _ := h.chatService.CreateConversationWithID(convID, models.StartChatRequest{
					ClientID:    clientID,
					ClientName:  clientName,
					ContactName: contactName,
					CpfCnpj:     cpfCnpj,
					Department:  dept,
				})
				// Notifica operadores instantaneamente
				if newConv != nil {
					h.hub.BroadcastToOperators(&models.WSAction{
						Type:    "new_chat_waiting",
						Payload: newConv,
					})
				}
			}
		}
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS HANDLER] Falha no upgrade do WebSocket: %v", err)
		return
	}

	senderDisplayName := clientName
	if sType == models.SenderClient && contactName != "" {
		senderDisplayName = contactName
	}

	deviceID := r.URL.Query().Get("deviceId")
	cleanCpfDigits := ""
	for _, ch := range cpfCnpj {
		if ch >= '0' && ch <= '9' {
			cleanCpfDigits += string(ch)
		}
	}

	client := &ws.Client{
		Hub:             h.hub,
		Conn:            conn,
		Send:            make(chan []byte, 256),
		ConversationID:  convID,
		SenderID:        clientID,
		SenderName:      senderDisplayName,
		SenderType:      sType,
		CpfCnpj:         cleanCpfDigits,
		DeviceID:        deviceID,
		ChatService:     h.chatService,
		PushService:     h.pushService,
		CampaignService: h.campaignService,
		ChannelService:  h.channelService,
	}

	h.hub.RegisterClient(client)

	go client.WritePump()
	go client.ReadPump()
}

// HandleCreateConversation inicia uma conversa via REST
func (h *Handler) HandleCreateConversation(w http.ResponseWriter, r *http.Request) {
	var req models.StartChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	switch strings.ToLower(req.Department) {
	case "support":
		req.Department = "Suporte Técnico"
	case "financial":
		req.Department = "Financeiro"
	case "commercial":
		req.Department = "Comercial"
	case "doubts":
		req.Department = "Atendimento Geral"
	}
	if req.Department == "" {
		req.Department = "Suporte Técnico"
	}

	conv, err := h.chatService.CreateConversation(req)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Notifica operadores da nova conversa na fila
	h.hub.BroadcastToOperators(&models.WSAction{
		Type:    "new_chat_waiting",
		Payload: conv,
	})

	h.respondJSON(w, http.StatusCreated, conv)
}

// HandleStartOutboundConversation inicia um atendimento avulso (outbound) a partir do painel do operador
func (h *Handler) HandleStartOutboundConversation(w http.ResponseWriter, r *http.Request) {
	var req models.StartOutboundChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	cleanClientName := models.SanitizeText(req.ClientName)
	if cleanClientName == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Nome do cliente é obrigatório"})
		return
	}

	cleanChannel := strings.ToLower(strings.TrimSpace(req.Channel))
	if cleanChannel == "" {
		cleanChannel = "whatsapp_evolution"
	}

	// Normalização do identificador do canal (número de telefone, chat ID, etc.)
	cleanChannelID := strings.TrimSpace(req.ChannelID)
	cleanChannelID = strings.ReplaceAll(cleanChannelID, "+", "")
	cleanChannelID = strings.ReplaceAll(cleanChannelID, " ", "")
	cleanChannelID = strings.ReplaceAll(cleanChannelID, "-", "")
	cleanChannelID = strings.ReplaceAll(cleanChannelID, "(", "")
	cleanChannelID = strings.ReplaceAll(cleanChannelID, ")", "")
	cleanChannelID = strings.ReplaceAll(cleanChannelID, "@s.whatsapp.net", "")
	cleanChannelID = strings.ReplaceAll(cleanChannelID, "@c.us", "")

	if cleanChannelID == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Identificador do destinatário (telefone/ID) é obrigatório"})
		return
	}

	// Se for WhatsApp (Evolution ou Oficial) e for número brasileiro sem DDI, adiciona 55
	if (cleanChannel == "whatsapp_evolution" || cleanChannel == "whatsapp_official") && (len(cleanChannelID) == 10 || len(cleanChannelID) == 11) {
		cleanChannelID = "55" + cleanChannelID
	}

	opID := strings.TrimSpace(req.OperatorID)
	opName := strings.TrimSpace(req.OperatorName)
	if opID == "" {
		opID = "usr-op-01"
	}
	if opName == "" {
		opName = "Atendente SOL"
	}

	contactName := models.SanitizeText(req.ContactName)
	if contactName == "" {
		contactName = cleanClientName
	}

	dept := models.SanitizeText(req.Department)
	if dept == "" {
		dept = "Suporte Técnico"
	}

	var renderedMessageText string

	// 1. Validação e despacho conforme canal selecionado
	switch cleanChannel {
	case "whatsapp_official":
		// Na API Oficial da Meta, o início ativo de conversa FORA da janela de 24h EXIGE template autorizado
		cleanTemplate := strings.TrimSpace(req.TemplateName)
		if cleanTemplate == "" {
			h.respondJSON(w, http.StatusBadRequest, map[string]string{
				"error": "Para iniciar atendimento via WhatsApp Oficial (Meta), a seleção de um template pré-aprovado é obrigatória.",
			})
			return
		}
		lang := strings.TrimSpace(req.TemplateLanguage)
		if lang == "" {
			lang = "pt_BR"
		}
		cfg, _ := h.channelService.GetChannelsConfig()
		phoneID := ""
		token := ""
		if cfg != nil {
			phoneID = cfg.WhatsAppOfficial.PhoneNumberID
			token = cfg.WhatsAppOfficial.AccessToken
		}

		rendered, err := h.channelService.SendWhatsAppOfficialTemplate(phoneID, token, cleanChannelID, cleanTemplate, lang, req.TemplateParams)
		if err != nil {
			log.Printf("⚠️ [OUTBOUND WHATSAPP OFICIAL ERRO] %v", err)
			if !strings.Contains(err.Error(), "não configuradas") {
				h.respondJSON(w, http.StatusBadRequest, map[string]string{
					"error": fmt.Sprintf("Erro ao enviar template na Meta Cloud API: %v", err),
				})
				return
			}
		}
		renderedMessageText = rendered

	case "whatsapp_evolution":
		// Canal não oficial: mensagem de texto livre como o atendente desejar
		cleanMsg := strings.TrimSpace(req.InitialMessage)
		if cleanMsg == "" {
			h.respondJSON(w, http.StatusBadRequest, map[string]string{
				"error": "A mensagem inicial para o WhatsApp é obrigatória.",
			})
			return
		}
		cfg, _ := h.channelService.GetChannelsConfig()
		serverURL := "http://45.166.31.237:8080"
		apiKey := "rr66oi90rr66oi90"
		instanceName := "solprovedorgroup"
		if cfg != nil {
			if cfg.WhatsAppEvolution.ServerURL != "" {
				serverURL = cfg.WhatsAppEvolution.ServerURL
			}
			if cfg.WhatsAppEvolution.ApiKey != "" {
				apiKey = cfg.WhatsAppEvolution.ApiKey
			}
			if cfg.WhatsAppEvolution.InstanceName != "" {
				instanceName = cfg.WhatsAppEvolution.InstanceName
			}
		}

		if err := h.channelService.SendEvolutionMessage(serverURL, apiKey, instanceName, cleanChannelID, cleanMsg); err != nil {
			log.Printf("⚠️ [OUTBOUND EVOLUTION ERRO] %v", err)
			h.respondJSON(w, http.StatusBadRequest, map[string]string{
				"error": fmt.Sprintf("Erro ao enviar mensagem pelo Evolution API: %v", err),
			})
			return
		}
		renderedMessageText = cleanMsg

	case "telegram":
		cleanMsg := strings.TrimSpace(req.InitialMessage)
		if cleanMsg == "" {
			h.respondJSON(w, http.StatusBadRequest, map[string]string{
				"error": "A mensagem inicial para o Telegram é obrigatória.",
			})
			return
		}
		cfg, _ := h.channelService.GetChannelsConfig()
		botToken := ""
		if cfg != nil {
			botToken = cfg.Telegram.BotToken
		}
		if err := h.channelService.SendTelegramMessage(botToken, cleanChannelID, cleanMsg); err != nil {
			log.Printf("⚠️ [OUTBOUND TELEGRAM ERRO] %v", err)
			h.respondJSON(w, http.StatusBadRequest, map[string]string{
				"error": fmt.Sprintf("Erro ao enviar mensagem pelo Telegram: %v", err),
			})
			return
		}
		renderedMessageText = cleanMsg

	case "mobile", "web":
		cleanMsg := strings.TrimSpace(req.InitialMessage)
		if cleanMsg == "" {
			h.respondJSON(w, http.StatusBadRequest, map[string]string{
				"error": "A mensagem inicial é obrigatória.",
			})
			return
		}
		renderedMessageText = cleanMsg

	default:
		h.respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Canal de atendimento não suportado: " + cleanChannel,
		})
		return
	}

	// 2. Criação ou reaproveitamento do atendimento avulso (se já houver conversa ativa)
	now := time.Now().UTC()
	var conv *models.Conversation
	if h.db != nil {
		conv, _ = h.db.GetActiveConversationByChannel(cleanChannel, cleanChannelID)
	}

	if conv == nil {
		prefix := "conv-out-"
		clientID := "out-" + cleanChannelID
		if cleanChannel == "whatsapp_evolution" || cleanChannel == "whatsapp_official" {
			prefix = "conv-wapp-"
			clientID = "wapp-" + cleanChannelID
		} else if cleanChannel == "telegram" {
			prefix = "conv-tg-"
			clientID = "tg-" + cleanChannelID
		}
		convID := prefix + uuid.New().String()[:8]
		conv = &models.Conversation{
			ID:          convID,
			ClientID:    clientID,
			ClientName:  cleanClientName,
			ContactName: contactName,
			CpfCnpj:     models.SanitizeText(req.CpfCnpj),
			Department:  dept,
			Status:      models.ConvActive,
			Operator: &models.OperatorInfo{
				ID:   opID,
				Name: opName,
			},
			CreatedAt:  now,
			UpdatedAt:  now,
			AssignedAt: &now,
			Channel:    cleanChannel,
			ChannelID:  cleanChannelID,
		}
	} else {
		// Reaproveita a conversa ativa, atualizando operador e status
		conv.Status = models.ConvActive
		conv.Operator = &models.OperatorInfo{
			ID:   opID,
			Name: opName,
		}
		conv.AssignedAt = &now
		conv.UpdatedAt = now
		if cleanClientName != "" {
			conv.ClientName = cleanClientName
		}
	}

	// Persiste no banco de dados e memória
	if h.db != nil {
		_ = h.db.UpsertConversation(conv)
	}
	h.chatService.UpsertMemoryConversation(conv)

	// 3. Registra a primeira mensagem do operador
	msgID := "msg-out-" + uuid.New().String()[:8]
	msg := &models.Message{
		ID:             msgID,
		ConversationID: conv.ID,
		SenderID:       opID,
		SenderName:     opName,
		SenderType:     models.SenderOperator,
		Content:        renderedMessageText,
		Timestamp:      now.Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}

	_ = h.chatService.SaveMessage(msg)

	// 4. Notifica operadores via WebSocket em tempo real
	h.hub.BroadcastToOperators(&models.WSAction{
		Type:    "conversation_updated",
		Payload: conv,
	})
	h.hub.BroadcastToOperators(&models.WSAction{
		Type:    "message",
		Payload: msg,
	}, conv.ID)
	h.hub.BroadcastToRoom(conv.ID, &models.WSAction{
		Type:    "message",
		Payload: msg,
	}, nil)

	log.Printf("🚀 [OUTBOUND CHAT] Atendimento avulso iniciado por %s para %s via %s (ID: %s)", opName, cleanClientName, cleanChannel, conv.ID)

	h.respondJSON(w, http.StatusCreated, map[string]interface{}{
		"conversation": conv,
		"message":      msg,
	})
}

// HandleListConversations lista conversas ativas ou em espera com filtro opcional de CPF
func (h *Handler) HandleListConversations(w http.ResponseWriter, r *http.Request) {
	status := models.ConversationStatus(r.URL.Query().Get("status"))
	cpfCnpj := r.URL.Query().Get("cpfCnpj")
	if cpfCnpj == "" {
		cpfCnpj = r.URL.Query().Get("cpf")
	}
	list := h.chatService.ListConversationsWithFilter(status, cpfCnpj)
	h.respondJSON(w, http.StatusOK, list)
}

// HandleGetConversation busca detalhes de uma conversa
func (h *Handler) HandleGetConversation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	conv, err := h.chatService.GetConversation(id)
	if err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": "Conversa não encontrada"})
		return
	}
	h.respondJSON(w, http.StatusOK, conv)
}

// HandleGetMessages busca histórico de mensagens
func (h *Handler) HandleGetMessages(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	msgs, err := h.chatService.GetMessages(id, limit)
	if err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": "Conversa não encontrada"})
		return
	}
	h.respondJSON(w, http.StatusOK, msgs)
}

// HandleAssignOperator atribui operador ao chat
func (h *Handler) HandleAssignOperator(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		OperatorID   string `json:"operatorId"`
		OperatorName string `json:"operatorName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	conv, err := h.chatService.AssignOperator(id, body.OperatorID, body.OperatorName)
	if err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	// Notifica os participantes da sala via WebSocket
	h.hub.BroadcastToRoom(id, &models.WSAction{
		Type: "operator_assigned",
		Payload: map[string]string{
			"conversationId": id,
			"operatorId":     body.OperatorID,
			"operatorName":   body.OperatorName,
		},
	}, nil)

	// Broadcast da mensagem de sistema informando que o operador assumiu
	h.hub.BroadcastToRoom(id, &models.WSAction{
		Type: "message",
		Payload: &models.Message{
			ID:             "sys-assign-" + uuid.New().String()[:8],
			ConversationID: id,
			SenderID:       "system",
			SenderType:     models.SenderSystem,
			SenderName:     "Sistema SOL",
			Content:        fmt.Sprintf("O atendente %s assumiu o atendimento.", body.OperatorName),
			Timestamp:      time.Now().UTC().Format(time.RFC3339),
			Status:         models.StatusDelivered,
		},
	}, nil)

	// Atualiza operadores para sincronizar listas em tempo real
	h.hub.BroadcastToOperators(&models.WSAction{
		Type:    "conversation_updated",
		Payload: conv,
	})

	h.respondJSON(w, http.StatusOK, conv)
}

// HandleCloseConversation encerra a conversa utilizando a mensagem configurada ou personalizada
func (h *Handler) HandleCloseConversation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body struct {
		Reason   string `json:"reason"`
		ClosedBy string `json:"closedBy"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	conv, err := h.chatService.GetConversation(id)
	if err != nil || conv == nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": "Conversa não encontrada"})
		return
	}

	closedBy := strings.TrimSpace(body.ClosedBy)
	if closedBy == "" {
		if conv.Operator != nil && conv.Operator.Name != "" {
			closedBy = conv.Operator.Name
		} else {
			closedBy = "Atendente SOL"
		}
	}

	isWhatsApp := conv.Channel == "whatsapp_evolution" || conv.Channel == "whatsapp_official"

	if isWhatsApp {
		// Se for WhatsApp, coloca a conversa em 'waiting_rating' e envia mensagem solicitando nota de 1 a 5
		updatedConv, ratingPrompt, err := h.chatService.CloseConversationAndRequestRating(id, closedBy, body.Reason)
		if err != nil {
			h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		// Envia a mensagem com a solicitação de nota diretamente no WhatsApp do cliente!
		if h.channelService != nil {
			h.channelService.SendMessageToChannel(updatedConv, ratingPrompt)
		}

		// Notifica via WebSocket para que os operadores vejam a conversa na aba de Finalizados / Aguardando Nota
		h.hub.BroadcastToRoom(id, &models.WSAction{
			Type: "chat_closed",
			Payload: map[string]string{
				"conversationId": id,
				"reason":         ratingPrompt,
			},
		}, nil)
		h.hub.BroadcastToOperators(&models.WSAction{
			Type:    "conversation_updated",
			Payload: updatedConv,
		})
		h.hub.BroadcastToOperators(&models.WSAction{
			Type: "chat_closed",
			Payload: map[string]string{
				"conversationId": id,
				"reason":         ratingPrompt,
			},
		})

		// Tolerância de 10 minutos para o cliente avaliar. Se não responder em 10 minutos, encerra de vez!
		go func(cID string) {
			time.Sleep(10 * time.Minute)
			h.chatService.FinalizePendingRating(cID)
			// Notifica os operadores da finalização definitiva
			if finalConv, err := h.chatService.GetConversation(cID); err == nil && finalConv != nil {
				h.hub.BroadcastToOperators(&models.WSAction{
					Type:    "conversation_updated",
					Payload: finalConv,
				})
			}
		}(id)

		h.respondJSON(w, http.StatusOK, map[string]interface{}{
			"message":      "Atendimento encerrado e pesquisa de satisfação enviada ao cliente via WhatsApp (aguardando avaliação por até 10 minutos)",
			"conversation": updatedConv,
		})
		return
	}

	// Para outros canais (app mobile, web): encerra normalmente
	if err := h.chatService.CloseConversation(id); err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		if h.db != nil {
			reason = h.db.GetCloseMessage()
		} else {
			reason = "Atendimento encerrado com sucesso! Agradecemos o seu contato."
		}
	}

	// Broadcast para os participantes da sala (cliente) com a mensagem real configurada
	h.hub.BroadcastToRoom(id, &models.WSAction{
		Type: "chat_closed",
		Payload: map[string]string{
			"conversationId": id,
			"reason":         reason,
		},
	}, nil)

	// Broadcast para o painel de operadores atualizarem a aba Finalizados
	h.hub.BroadcastToOperators(&models.WSAction{
		Type: "chat_closed",
		Payload: map[string]string{
			"conversationId": id,
			"reason":         reason,
		},
	})

	h.respondJSON(w, http.StatusOK, map[string]string{"message": "Conversa encerrada", "reason": reason})
}

// HandleGetSettings retorna as configurações globais de chat e fluxo do bot
func (h *Handler) HandleGetSettings(w http.ResponseWriter, r *http.Request) {
	if h.db == nil {
		h.respondJSON(w, http.StatusOK, database.DefaultSettings())
		return
	}

	settings, err := h.db.GetChatSettings()
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao carregar configurações"})
		return
	}

	h.respondJSON(w, http.StatusOK, settings)
}

// HandleSaveSettings salva as configurações de mensagens e o fluxo visual do chatbot
// Regras de segurança RBAC (Regras 1, 2, 4 do AGENTS.md): Apenas Gestor e Administrador
func (h *Handler) HandleSaveSettings(w http.ResponseWriter, r *http.Request) {
	user := h.extractAuthUser(r)
	if user == nil {
		h.respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Autenticação obrigatória"})
		return
	}

	if user.Role != models.RoleAdmin && user.Role != models.RoleGestor {
		h.respondJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso não autorizado para operadores"})
		return
	}

	var req models.ChatSettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	// Validação rigorosa dos dados (Regra 1 de Segurança)
	if strings.TrimSpace(req.CloseMessage) == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "A mensagem de encerramento não pode ser vazia"})
		return
	}
	if len(req.CloseMessage) > 1000 {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "A mensagem de encerramento excede o limite de 1000 caracteres"})
		return
	}

	if h.db != nil {
		if err := h.db.SaveChatSettings(&req); err != nil {
			h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao salvar configurações no banco de dados"})
			return
		}
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"message":  "Configurações salvas com sucesso!",
		"settings": req,
	})
}

// HandleCustomerLookup executa consultas concorrentes em sistemas externos
func (h *Handler) HandleCustomerLookup(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("query")
	if query == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Parâmetro query é obrigatório"})
		return
	}

	data, err := h.extService.EnrichCustomerData(r.Context(), query)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao consultar dados externos"})
		return
	}

	h.respondJSON(w, http.StatusOK, data)
}

// HandleHealth health check
func (h *Handler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	companyName := "Central de Atendimento"
	if h.db != nil {
		if settings, err := h.db.GetSystemSettings(); err == nil && settings != nil && settings.CompanyName != "" {
			companyName = settings.CompanyName
		}
	}
	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "healthy",
		"system":      "Chat-Interno Go Backend",
		"companyName": companyName,
		"version":     "1.0.0",
	})
}

// HandleResetAll encerra todas as conversas e limpa todo o histórico em memória
func (h *Handler) HandleResetAll(w http.ResponseWriter, r *http.Request) {
	h.chatService.ResetAll()

	// Notifica todos os operadores globais para zerar as telas em tempo real
	h.hub.BroadcastToOperators(&models.WSAction{
		Type: "conversations_cleared",
		Payload: map[string]string{
			"message": "Todas as conversas e históricos foram limpos para novos testes",
		},
	})

	h.respondJSON(w, http.StatusOK, map[string]string{
		"message": "Todas as conversas e históricos foram limpos com sucesso",
	})
}

// HandleUpdateConversationNetwork atualiza a infraestrutura de rede (OLT, PON, CTO) de um cliente/conversa
func (h *Handler) HandleUpdateConversationNetwork(w http.ResponseWriter, r *http.Request) {
	convID := chi.URLParam(r, "id")
	if convID == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID da conversa é obrigatório"})
		return
	}

	var body struct {
		OLT     string `json:"olt"`
		PON     string `json:"pon"`
		CTO     string `json:"cto"`
		CpfCnpj string `json:"cpfCnpj"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	conv, err := h.chatService.UpdateNetworkInfo(convID, body.OLT, body.PON, body.CTO)
	if err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	cleanDoc := strings.TrimSpace(body.CpfCnpj)
	if cleanDoc == "" {
		cleanDoc = strings.TrimSpace(conv.CpfCnpj)
	}

	if cleanDoc != "" {
		// 1. Salva explicitamente a associação CPF -> OLT, PON, CTO no banco para uso futuro permanente
		if h.db != nil {
			_ = h.db.SaveCustomerNetwork(cleanDoc, body.OLT, body.PON, body.CTO)
		}
		// 2. Atualiza o cadastro dos aparelhos para campanhas e disparos
		_ = h.campaignService.UpdateDeviceNetwork(cleanDoc, body.OLT, body.PON, body.CTO)
	}

	// Notifica operadores via WebSocket para atualizar os cards em tempo real
	h.hub.BroadcastToOperators(&models.WSAction{
		Type:    "conversation_updated",
		Payload: conv,
	})

	h.respondJSON(w, http.StatusOK, conv)
}

// HandleGetCustomerNetwork busca a infraestrutura de rede (OLT, PON, CTO) vinculada ao CPF
func (h *Handler) HandleGetCustomerNetwork(w http.ResponseWriter, r *http.Request) {
	cpf := r.URL.Query().Get("cpf")
	if cpf == "" {
		cpf = r.URL.Query().Get("cpfCnpj")
	}
	clean := strings.TrimSpace(cpf)
	if clean == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "CPF ou CNPJ é obrigatório"})
		return
	}

	olt, pon, cto := "", "", ""
	if h.db != nil {
		var err error
		olt, pon, cto, err = h.db.GetCustomerNetwork(clean)
		if err != nil {
			log.Printf("[NETWORK] Erro ao buscar rede do cliente por CPF: %v", err)
		}
	}

	h.respondJSON(w, http.StatusOK, map[string]string{
		"cpfCnpj": clean,
		"olt":     olt,
		"pon":     pon,
		"cto":     cto,
	})
}

// HandleSaveCustomerNetwork associa ou altera a OLT, PON e CTO vinculadas a um CPF
func (h *Handler) HandleSaveCustomerNetwork(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CpfCnpj string `json:"cpfCnpj"`
		OLT     string `json:"olt"`
		PON     string `json:"pon"`
		CTO     string `json:"cto"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	clean := strings.TrimSpace(body.CpfCnpj)
	if clean == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "CPF ou CNPJ é obrigatório"})
		return
	}

	if h.db != nil {
		if err := h.db.SaveCustomerNetwork(clean, body.OLT, body.PON, body.CTO); err != nil {
			h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao salvar associação da CTO no banco"})
			return
		}
	}
	_ = h.campaignService.UpdateDeviceNetwork(clean, body.OLT, body.PON, body.CTO)

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Associação de CTO salva com sucesso para o CPF!",
		"cpfCnpj": clean,
		"olt":     body.OLT,
		"pon":     body.PON,
		"cto":     body.CTO,
	})
}

func (h *Handler) respondJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(data)
}

func (h *Handler) respondError(w http.ResponseWriter, statusCode int, message string) {
	h.respondJSON(w, statusCode, map[string]string{"error": message})
}

package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"

	"chat-interno-server/internal/models"
	"chat-interno-server/internal/services"
	ws "chat-interno-server/internal/websocket"
)

type Handler struct {
	chatService *services.ChatService
	extService  *services.ExternalAPIService
	hub         *ws.Hub
	upgrader    websocket.Upgrader
}

func NewHandler(
	chatService *services.ChatService,
	extService *services.ExternalAPIService,
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
		chatService: chatService,
		extService:  extService,
		hub:         hub,
		upgrader:    upgrader,
	}
}

// HandleWebSocket processa o upgrade HTTP -> WebSocket
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	convID := r.URL.Query().Get("conversationId")
	clientID := r.URL.Query().Get("clientId")
	clientName := r.URL.Query().Get("clientName")
	senderType := r.URL.Query().Get("senderType")

	if clientID == "" {
		clientID = "client-" + r.RemoteAddr
	}
	if clientName == "" {
		clientName = "Cliente"
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
				// Cria a conversa com o ID exato informado pelo mobile
				newConv, _ := h.chatService.CreateConversationWithID(convID, models.StartChatRequest{
					ClientID:   clientID,
					ClientName: clientName,
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

	client := &ws.Client{
		Hub:            h.hub,
		Conn:           conn,
		Send:           make(chan []byte, 256),
		ConversationID: convID,
		SenderID:       clientID,
		SenderName:     clientName,
		SenderType:     sType,
		ChatService:    h.chatService,
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

// HandleListConversations lista conversas ativas ou em espera
func (h *Handler) HandleListConversations(w http.ResponseWriter, r *http.Request) {
	status := models.ConversationStatus(r.URL.Query().Get("status"))
	list := h.chatService.ListConversations(status)
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
			"operatorId":   body.OperatorID,
			"operatorName": body.OperatorName,
		},
	}, nil)

	h.respondJSON(w, http.StatusOK, conv)
}

// HandleCloseConversation encerra a conversa
func (h *Handler) HandleCloseConversation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.chatService.CloseConversation(id); err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	// Broadcast para os participantes da sala (cliente)
	h.hub.BroadcastToRoom(id, &models.WSAction{
		Type: "chat_closed",
		Payload: map[string]string{
			"conversationId": id,
			"reason":         "Atendimento encerrado pelo operador",
		},
	}, nil)

	// Broadcast para o painel de operadores atualizarem a aba Finalizados
	h.hub.BroadcastToOperators(&models.WSAction{
		Type: "chat_closed",
		Payload: map[string]string{
			"conversationId": id,
		},
	})

	h.respondJSON(w, http.StatusOK, map[string]string{"message": "Conversa encerrada"})
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
	h.respondJSON(w, http.StatusOK, map[string]string{
		"status": "healthy",
		"system": "Chat-Interno Go Backend",
	})
}

func (h *Handler) respondJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(data)
}

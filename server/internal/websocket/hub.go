package websocket

import (
	"encoding/json"
	"log"
	"sync"

	"chat-interno-server/internal/models"
	"chat-interno-server/internal/services"
)

// BroadcastEvent encapsula a mensagem a ser enviada para uma conversa
type BroadcastEvent struct {
	ConversationID string
	Sender         *Client
	Data           []byte
}

// Hub gerencia todas as conexões de clientes e operadores
type Hub struct {
	// Conversas ativas: conversationId -> map[client]bool
	rooms map[string]map[*Client]bool

	// Operadores online ouvindo fila e novas conversas
	operators map[*Client]bool

	register   chan *Client
	unregister chan *Client
	broadcast  chan *BroadcastEvent

	chatService *services.ChatService
	mu          sync.RWMutex
}

func NewHub(chatService *services.ChatService) *Hub {
	return &Hub{
		rooms:       make(map[string]map[*Client]bool),
		operators:   make(map[*Client]bool),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
		broadcast:   make(chan *BroadcastEvent),
		chatService: chatService,
	}
}

// Run executa o loop de eventos concorrente do Hub
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			// Registra operador globalmente se aplicável
			if client.SenderType == models.SenderOperator {
				h.operators[client] = true
			}

			// Se houver conversationId, associa à sala
			if client.ConversationID != "" {
				if h.rooms[client.ConversationID] == nil {
					h.rooms[client.ConversationID] = make(map[*Client]bool)
				}
				h.rooms[client.ConversationID][client] = true
			}
			h.mu.Unlock()
			log.Printf("[WS HUB] Cliente conectado: %s (Tipo: %s, Sala: %s)", client.SenderName, client.SenderType, client.ConversationID)

		case client := <-h.unregister:
			h.mu.Lock()
			if client.SenderType == models.SenderOperator {
				delete(h.operators, client)
			}

			if client.ConversationID != "" && h.rooms[client.ConversationID] != nil {
				delete(h.rooms[client.ConversationID], client)
				if len(h.rooms[client.ConversationID]) == 0 {
					delete(h.rooms, client.ConversationID)
				}
			}
			close(client.Send)
			h.mu.Unlock()
			log.Printf("[WS HUB] Cliente desconectado: %s (Sala: %s)", client.SenderName, client.ConversationID)

		case event := <-h.broadcast:
			h.mu.RLock()
			// Envia para todos os participantes daquela sala
			if clients, ok := h.rooms[event.ConversationID]; ok {
				for client := range clients {
					select {
					case client.Send <- event.Data:
					default:
						// Canal cheio: desconecta cliente lento para evitar travamento
						close(client.Send)
						delete(clients, client)
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastToRoom envia mensagem para todos os participantes de uma conversa
func (h *Hub) BroadcastToRoom(conversationID string, action *models.WSAction, sender *Client) {
	data, err := json.Marshal(action)
	if err != nil {
		log.Printf("[WS HUB] Erro ao serializar evento: %v", err)
		return
	}

	h.broadcast <- &BroadcastEvent{
		ConversationID: conversationID,
		Sender:         sender,
		Data:           data,
	}
}

// BroadcastToOperators notifica todos os operadores (ex: novo chamado na fila ou mensagem global),
// permitindo excluir operadores que já estejam na sala especificada para evitar duplicidade de mensagens
func (h *Hub) BroadcastToOperators(action *models.WSAction, excludeConversationID ...string) {
	data, err := json.Marshal(action)
	if err != nil {
		return
	}

	exclude := ""
	if len(excludeConversationID) > 0 {
		exclude = excludeConversationID[0]
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for op := range h.operators {
		if exclude != "" && op.ConversationID == exclude {
			continue // Já recebeu pela sala!
		}
		select {
		case op.Send <- data:
		default:
			// Não bloqueia
		}
	}
}

// RegisterClient registra uma nova conexão no loop central
func (h *Hub) RegisterClient(client *Client) {
	h.register <- client
}

// UnregisterClient remove uma conexão no loop central
func (h *Hub) UnregisterClient(client *Client) {
	h.unregister <- client
}

// JoinRoom associa um cliente a uma sala específica sem reiniciar a conexão WS
func (h *Hub) JoinRoom(client *Client, conversationID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Se já estava em outra sala, remove dela
	if client.ConversationID != "" && h.rooms[client.ConversationID] != nil {
		delete(h.rooms[client.ConversationID], client)
	}

	client.ConversationID = conversationID
	if conversationID != "" {
		if h.rooms[conversationID] == nil {
			h.rooms[conversationID] = make(map[*Client]bool)
		}
		h.rooms[conversationID][client] = true
	}
	log.Printf("[WS HUB] Cliente %s (%s) ingressou na sala: %s", client.SenderName, client.SenderType, conversationID)
}



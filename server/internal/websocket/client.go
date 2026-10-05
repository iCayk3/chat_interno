package websocket

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"

	"chat-interno-server/internal/models"
	"chat-interno-server/internal/services"
)

const (
	// Tempo limite para escrita na conexão
	writeWait = 10 * time.Second

	// Tempo limite de leitura de pong
	pongWait = 60 * time.Second

	// Intervalo de envio de pings (precisa ser menor que pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Tamanho máximo do frame de mensagem (previne sobrecarga de memória)
	maxMessageSize = 8192
)

// Client representa uma conexão individual de WebSocket
type Client struct {
	Hub            *Hub
	Conn           *websocket.Conn
	Send           chan []byte
	ConversationID string
	SenderID       string
	SenderName     string
	SenderType     models.SenderType
	ChatService    *services.ChatService
}

// ReadPump bombeia mensagens do WebSocket para o Hub com validações de segurança
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, rawMessage, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS CLIENT] Erro inesperado ao ler mensagem: %v", err)
			}
			break
		}

		var action models.WSAction
		if err := json.Unmarshal(rawMessage, &action); err != nil {
			log.Printf("[WS CLIENT] Mensagem com formato inválido ignorada: %v", err)
			continue
		}

		c.handleAction(&action)
	}
}

// handleAction processa as ações com validação no servidor (Regra 1 e 4 de Segurança)
func (c *Client) handleAction(action *models.WSAction) {
	switch action.Type {
	case "send_message":
		// Desserializa payload de mensagem
		payloadBytes, err := json.Marshal(action.Payload)
		if err != nil {
			return
		}

		var msg models.Message
		if err := json.Unmarshal(payloadBytes, &msg); err != nil {
			return
		}

		// Define a sala de destino pretendida
		targetConvID := msg.ConversationID
		if targetConvID == "" {
			targetConvID = c.ConversationID
		}

		if targetConvID == "" {
			log.Printf("[WS CLIENT] Mensagem rejeitada: sem conversationId válido de %s", c.SenderName)
			return
		}

		// Validação e sincronização de salas por perfil
		if c.SenderType == models.SenderOperator {
			// Operadores podem transitar livremente entre salas de atendimento
			if c.ConversationID != targetConvID {
				c.Hub.JoinRoom(c, targetConvID)
			}
		} else {
			// Clientes possuem validação estrita (Anti-IDOR)
			if c.ConversationID != "" && targetConvID != c.ConversationID {
				log.Printf("[SECURITY] Tentativa de envio em sala não autorizada: %s por %s", targetConvID, c.SenderID)
				return
			}
			if c.ConversationID == "" {
				c.Hub.JoinRoom(c, targetConvID)
			}
		}

		// Assegura autoria correta e imutável da mensagem
		msg.ConversationID = targetConvID
		if c.SenderType == models.SenderOperator {
			if msg.SenderID != "" {
				c.SenderID = msg.SenderID
			}
			if msg.SenderName != "" {
				c.SenderName = msg.SenderName
			}
		}
		msg.SenderID = c.SenderID
		msg.SenderName = c.SenderName
		msg.SenderType = c.SenderType
		msg.Status = models.StatusDelivered

		// Salva no serviço com validação de texto
		if err := c.ChatService.SaveMessage(&msg); err != nil {
			log.Printf("[WS CLIENT] Erro ao salvar mensagem: %v", err)
			return
		}

		// Faz o broadcast para todos os participantes da sala (cliente + operador atual)
		c.Hub.BroadcastToRoom(targetConvID, &models.WSAction{
			Type:    "message",
			Payload: msg,
		}, c)

		// Notifica operadores de OUTRAS salas para atualizar a lista lateral (sem duplicar para quem já está na sala)
		if c.SenderType == models.SenderClient {
			c.Hub.BroadcastToOperators(&models.WSAction{
				Type:    "message",
				Payload: msg,
			}, targetConvID)
		}

	case "typing":
		payloadBytes, err := json.Marshal(action.Payload)
		if err != nil {
			return
		}

		var typing models.TypingPayload
		if err := json.Unmarshal(payloadBytes, &typing); err != nil {
			return
		}

		targetConvID := typing.ConversationID
		if targetConvID == "" {
			targetConvID = c.ConversationID
		}

		if targetConvID == "" {
			return
		}

		typing.ConversationID = targetConvID
		typing.SenderID = c.SenderID
		typing.SenderName = c.SenderName

		c.Hub.BroadcastToRoom(targetConvID, &models.WSAction{
			Type:    "typing",
			Payload: typing,
		}, c)

		if c.SenderType == models.SenderClient {
			c.Hub.BroadcastToOperators(&models.WSAction{
				Type:    "typing",
				Payload: typing,
			}, targetConvID)
		}

	case "join_room":
		payloadBytes, err := json.Marshal(action.Payload)
		if err != nil {
			return
		}
		var joinPayload struct {
			ConversationID string `json:"conversationId"`
		}
		if err := json.Unmarshal(payloadBytes, &joinPayload); err == nil && joinPayload.ConversationID != "" {
			c.Hub.JoinRoom(c, joinPayload.ConversationID)
		}
	}
}

// WritePump escreve mensagens do Hub para a conexão WebSocket individualmente como frames JSON válidos
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// O canal foi fechado pelo hub
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Envia cada mensagem como seu próprio frame de texto WebSocket (evita unir JSONs com \n)
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

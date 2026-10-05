package models

import (
	"strings"
	"time"
)

// SenderType define quem enviou a mensagem
type SenderType string

const (
	SenderClient   SenderType = "client"
	SenderOperator SenderType = "operator"
	SenderSystem   SenderType = "system"
)

// MessageStatus define o estado de entrega
type MessageStatus string

const (
	StatusPending   MessageStatus = "pending"
	StatusSent      MessageStatus = "sent"
	StatusDelivered MessageStatus = "delivered"
	StatusRead      MessageStatus = "read"
)

// Message representa o modelo de dados alinhado estritamente com o mobile e web
type Message struct {
	ID             string        `json:"id"`
	ConversationID string        `json:"conversationId"`
	SenderID       string        `json:"senderId"`
	SenderType     SenderType    `json:"senderType"`
	SenderName     string        `json:"senderName"`
	Content        string        `json:"content"`
	Timestamp      string        `json:"timestamp"`
	Status         MessageStatus `json:"status"`
}

// ConversationStatus representa o ciclo de vida do atendimento
type ConversationStatus string

const (
	ConvWaiting ConversationStatus = "waiting"
	ConvActive  ConversationStatus = "active"
	ConvClosed  ConversationStatus = "closed"
)

// OperatorInfo dados públicos do operador que atende
type OperatorInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Conversation representa uma sessão de atendimento
type Conversation struct {
	ID         string             `json:"id"`
	ClientID   string             `json:"clientId"`
	ClientName string             `json:"clientName"`
	Department string             `json:"department,omitempty"`
	Status     ConversationStatus `json:"status"`
	Operator   *OperatorInfo      `json:"operator,omitempty"`
	CreatedAt  time.Time          `json:"createdAt"`
	UpdatedAt  time.Time          `json:"updatedAt"`

	// Dados internos não serializados para o cliente (Regra 7 de segurança)
	InternalNotes string `json:"-"`
}

// WSAction define o formato padrão de mensagens trocadas pelo WebSocket
type WSAction struct {
	Type    string      `json:"type"`              // ex: "send_message", "message", "typing", "operator_assigned", "chat_closed"
	Payload interface{} `json:"payload,omitempty"` // dados do evento
}

// TypingPayload payload para eventos de digitação
type TypingPayload struct {
	ConversationID string `json:"conversationId"`
	SenderID       string `json:"senderId"`
	SenderName     string `json:"senderName"`
	IsTyping       bool   `json:"isTyping"`
}

// StartChatRequest payload para iniciar conversa via REST
type StartChatRequest struct {
	ClientID   string `json:"clientId"`
	ClientName string `json:"clientName"`
	EmailOrDoc string `json:"emailOrDoc,omitempty"`
	Department string `json:"department,omitempty"`
}

// SanitizeText limpa espaços em branco e evita injeção simples
func SanitizeText(input string) string {
	trimmed := strings.TrimSpace(input)
	// Remove caracteres de controle nulos perigosos
	trimmed = strings.ReplaceAll(trimmed, "\x00", "")
	return trimmed
}

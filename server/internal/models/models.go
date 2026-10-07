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
	ConvWaiting       ConversationStatus = "waiting"
	ConvActive        ConversationStatus = "active"
	ConvClosed        ConversationStatus = "closed"
	ConvWaitingRating ConversationStatus = "waiting_rating"
)

// OperatorInfo dados públicos do operador que atende
type OperatorInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Conversation representa uma sessão de atendimento
type Conversation struct {
	ID          string             `json:"id"`
	ClientID    string             `json:"clientId"`
	ClientName  string             `json:"clientName"`
	ContactName string             `json:"contactName,omitempty"`
	CpfCnpj     string             `json:"cpfCnpj,omitempty"`
	Department    string             `json:"department,omitempty"`
	RbxGroup      string             `json:"rbxGroup,omitempty"`
	OLT           string             `json:"olt,omitempty"`
	PON           string             `json:"pon,omitempty"`
	CTO           string             `json:"cto,omitempty"`
	Status        ConversationStatus `json:"status"`
	Operator      *OperatorInfo      `json:"operator,omitempty"`
	CreatedAt     time.Time          `json:"createdAt"`
	UpdatedAt     time.Time          `json:"updatedAt"`
	AssignedAt    *time.Time         `json:"assignedAt,omitempty"`
	ClosedAt      *time.Time         `json:"closedAt,omitempty"`
	ClosedBy      string             `json:"closedBy,omitempty"`
	CloseReason   string             `json:"closeReason,omitempty"`
	Rating        *int               `json:"rating,omitempty"`
	RatingComment string             `json:"ratingComment,omitempty"`
	RatedAt       *time.Time         `json:"ratedAt,omitempty"`

	// Canal de entrada Omnichannel
	Channel     string `json:"channel,omitempty"`     // "mobile", "web", "telegram", "whatsapp_official", "whatsapp_evolution"
	ChannelID   string `json:"channelId,omitempty"`   // Identificador externo (Telegram chat_id, WhatsApp número)
	ChannelMeta string `json:"channelMeta,omitempty"` // Metadados adicionais em JSON

	// Dados internos não serializados para o cliente (Regra 7 de segurança)
	InternalNotes string `json:"-"`
}

// TelegramConfig configurações do bot do Telegram
type TelegramConfig struct {
	Enabled     bool   `json:"enabled"`
	BotToken    string `json:"botToken"`
	BotName     string `json:"botName"`
	BotUsername string `json:"botUsername"`
	WebhookURL  string `json:"webhookUrl"`
	Status      string `json:"status"` // "connected", "disconnected", "error"
}

// WhatsAppOfficialConfig configurações da Meta Cloud API
type WhatsAppOfficialConfig struct {
	Enabled            bool   `json:"enabled"`
	PhoneNumberID      string `json:"phoneNumberId"`
	WabaID             string `json:"wabaId"`
	AccessToken        string `json:"accessToken"`
	VerifyToken        string `json:"verifyToken"`
	DisplayPhoneNumber string `json:"displayPhoneNumber"`
	Status             string `json:"status"` // "connected", "disconnected", "error"
}

// WhatsAppEvolutionConfig configurações da Evolution API (não oficial)
type WhatsAppEvolutionConfig struct {
	Enabled      bool   `json:"enabled"`
	ServerURL    string `json:"serverUrl"`
	ApiKey       string `json:"apiKey"`
	InstanceName string `json:"instanceName"`
	WebhookURL   string `json:"webhookUrl"`
	Status       string `json:"status"` // "connected", "disconnected", "qrcode", "error"
	ProfileName  string `json:"profileName,omitempty"`
	OwnerJid     string `json:"ownerJid,omitempty"`
}

// ChannelsConfig agrega as configurações de todos os canais de atendimento
type ChannelsConfig struct {
	Telegram          TelegramConfig          `json:"telegram"`
	WhatsAppOfficial  WhatsAppOfficialConfig  `json:"whatsappOfficial"`
	WhatsAppEvolution WhatsAppEvolutionConfig `json:"whatsappEvolution"`
}

// EvolutionInstance dados de uma instância retornada pela Evolution API
type EvolutionInstance struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	ConnectionStatus string `json:"connectionStatus"` // "open", "connecting", "close"
	OwnerJid         string `json:"ownerJid"`
	ProfileName      string `json:"profileName"`
	Integration      string `json:"integration"`
	Token            string `json:"token"`
}

// RateConversationRequest payload para avaliação de atendimento pelo cliente (1 a 5 estrelas)
type RateConversationRequest struct {
	Rating  int    `json:"rating"`  // 1 (Muito Ruim) a 5 (Excelente)
	Comment string `json:"comment"` // Comentário opcional do cliente
}

// SearchConversationsFilter filtros de busca avançada para a Consulta de Atendimentos
type SearchConversationsFilter struct {
	OperatorID string
	Department string
	RbxGroup   string
	Status     string
	SearchTerm string
	StartDate  *time.Time
	EndDate    *time.Time
	Rating     *int
	Limit      int
	Offset     int
}

// SearchConversationsResponse resposta paginada da consulta de atendimentos
type SearchConversationsResponse struct {
	Conversations []*Conversation `json:"conversations"`
	Total         int             `json:"total"`
	Limit         int             `json:"limit"`
	Offset        int             `json:"offset"`
}

// ReportMetricsFilter filtros para agregação de relatórios
type ReportMetricsFilter struct {
	Period     string     // "today", "7days", "30days", "month", "custom"
	Department string
	OperatorID string
	StartDate  *time.Time
	EndDate    *time.Time
}

// DepartmentMetric consolidação de métricas por departamento/setor
type DepartmentMetric struct {
	Department    string  `json:"department"`
	TotalTickets  int     `json:"totalTickets"`
	AvgTMASeconds float64 `json:"avgTmaSeconds"` // TMA (Tempo Médio de Atendimento)
	AvgTMESeconds float64 `json:"avgTmeSeconds"` // TME (Tempo Médio de Espera)
	AvgRating     float64 `json:"avgRating"`     // CSAT médio (1 a 5)
	RatedCount    int     `json:"ratedCount"`
}

// OperatorMetric consolidação de métricas por atendente/operador
type OperatorMetric struct {
	OperatorID    string  `json:"operatorId"`
	OperatorName  string  `json:"operatorName"`
	Department    string  `json:"department"`
	TotalTickets  int     `json:"totalTickets"`
	AvgTMASeconds float64 `json:"avgTmaSeconds"`
	AvgTMESeconds float64 `json:"avgTmeSeconds"`
	AvgRating     float64 `json:"avgRating"`
	RatedCount    int     `json:"ratedCount"`
}

// DailyVolumeMetric volume diário de atendimentos para gráficos de evolução
type DailyVolumeMetric struct {
	Date          string `json:"date"`
	TotalTickets  int    `json:"totalTickets"`
	ClosedTickets int    `json:"closedTickets"`
}

// ReportSummaryResponse resumo executivo de relatórios com TMA, TME e satisfação
type ReportSummaryResponse struct {
	TotalTickets       int                `json:"totalTickets"`
	ClosedTickets      int                `json:"closedTickets"`
	ActiveTickets      int                `json:"activeTickets"`
	WaitingTickets     int                `json:"waitingTickets"`
	AvgTMASeconds      float64            `json:"avgTmaSeconds"` // TMA em segundos
	AvgTMESeconds      float64            `json:"avgTmeSeconds"` // TME em segundos
	AvgRating          float64            `json:"avgRating"`     // Nota média de 1.0 a 5.0
	TotalRated         int                `json:"totalRated"`
	RatingDistribution map[string]int     `json:"ratingDistribution"` // ex: "5": 24, "4": 12...
	Departments        []DepartmentMetric `json:"departments"`
	Operators          []OperatorMetric   `json:"operators"`
	DailyVolume        []DailyVolumeMetric`json:"dailyVolume"`
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
	ClientID    string `json:"clientId"`
	ClientName  string `json:"clientName"`
	ContactName string `json:"contactName,omitempty"`
	EmailOrDoc  string `json:"emailOrDoc,omitempty"`
	CpfCnpj     string `json:"cpfCnpj,omitempty"`
	Department  string `json:"department,omitempty"`
}

// SanitizeText limpa espaços em branco e evita injeção simples
func SanitizeText(input string) string {
	trimmed := strings.TrimSpace(input)
	// Remove caracteres de controle nulos perigosos
	trimmed = strings.ReplaceAll(trimmed, "\x00", "")
	return trimmed
}

// WhatsAppOfficialTemplate define um modelo de mensagem aprovado pela Meta
type WhatsAppOfficialTemplate struct {
	Name        string   `json:"name"`
	Language    string   `json:"language"`
	Category    string   `json:"category"`
	Status      string   `json:"status"` // "APPROVED"
	BodyText    string   `json:"bodyText"`
	ParamLabels []string `json:"paramLabels"`
}

// StartOutboundChatRequest dados para iniciar um atendimento avulso (ativo/outbound)
type StartOutboundChatRequest struct {
	Channel          string   `json:"channel"`                    // "whatsapp_evolution", "whatsapp_official", "telegram", "mobile"
	ChannelID        string   `json:"channelId"`                  // Número com DDD, chat ID, etc.
	ClientName       string   `json:"clientName"`                 // Nome do cliente
	ContactName      string   `json:"contactName,omitempty"`      // Nome do contato se diferente
	CpfCnpj          string   `json:"cpfCnpj,omitempty"`          // CPF ou CNPJ opcional
	Department       string   `json:"department,omitempty"`       // Setor
	OperatorID       string   `json:"operatorId"`                 // ID do operador autenticado
	OperatorName     string   `json:"operatorName"`               // Nome do operador
	InitialMessage   string   `json:"initialMessage,omitempty"`   // Mensagem livre para canais não oficiais
	TemplateName     string   `json:"templateName,omitempty"`     // Nome do template autorizado (Meta Oficial)
	TemplateLanguage string   `json:"templateLanguage,omitempty"` // Idioma do template (padrão pt_BR)
	TemplateParams   []string `json:"templateParams,omitempty"`   // Valores das variáveis {{1}}, {{2}}...
}


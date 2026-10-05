package services

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"chat-interno-server/internal/models"
)

var (
	ErrConversationNotFound = errors.New("conversa não encontrada")
	ErrInvalidInput         = errors.New("dados de entrada inválidos")
	ErrUnauthorizedSender   = errors.New("remetente não autorizado para esta conversa")
)

// ChatService gerencia a lógica de negócio do atendimento
type ChatService struct {
	conversations map[string]*models.Conversation
	messages      map[string][]*models.Message // conversationID -> list of messages
	mu            sync.RWMutex
}

func NewChatService() *ChatService {
	return &ChatService{
		conversations: make(map[string]*models.Conversation),
		messages:      make(map[string][]*models.Message),
	}
}

// CreateConversation inicia um atendimento com validações estritas (Regra 1 de Segurança)
func (s *ChatService) CreateConversation(req models.StartChatRequest) (*models.Conversation, error) {
	cleanName := models.SanitizeText(req.ClientName)
	if cleanName == "" {
		return nil, fmt.Errorf("%w: nome do cliente é obrigatório", ErrInvalidInput)
	}
	if len(cleanName) > 100 {
		return nil, fmt.Errorf("%w: nome excede o limite de 100 caracteres", ErrInvalidInput)
	}

	cleanClientID := strings.TrimSpace(req.ClientID)
	if cleanClientID == "" {
		cleanClientID = "client-" + uuid.New().String()[:8]
	}

	now := time.Now().UTC()
	convID := "conv-" + uuid.New().String()[:12]

	conv := &models.Conversation{
		ID:         convID,
		ClientID:   cleanClientID,
		ClientName: cleanName,
		Department: models.SanitizeText(req.Department),
		Status:     models.ConvWaiting,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.conversations[convID] = conv
	s.messages[convID] = make([]*models.Message, 0)

	// Cria mensagem inicial de boas-vindas do sistema
	sysMsg := &models.Message{
		ID:             "sys-" + uuid.New().String()[:8],
		ConversationID: convID,
		SenderID:       "system",
		SenderType:     models.SenderSystem,
		SenderName:     "Sistema SOL",
		Content:        fmt.Sprintf("Olá, %s! Seu atendimento foi iniciado. Em instantes um operador irá lhe atender.", cleanName),
		Timestamp:      now.Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}
	s.messages[convID] = append(s.messages[convID], sysMsg)

	return conv, nil
}

// CreateConversationWithID cria ou reutiliza uma conversa com um ID predefinido
func (s *ChatService) CreateConversationWithID(convID string, req models.StartChatRequest) (*models.Conversation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if existing, ok := s.conversations[convID]; ok {
		return existing, nil
	}

	cleanName := models.SanitizeText(req.ClientName)
	if cleanName == "" {
		cleanName = "Cliente"
	}

	cleanClientID := strings.TrimSpace(req.ClientID)
	if cleanClientID == "" {
		cleanClientID = "client-" + uuid.New().String()[:8]
	}

	now := time.Now().UTC()
	conv := &models.Conversation{
		ID:         convID,
		ClientID:   cleanClientID,
		ClientName: cleanName,
		Department: models.SanitizeText(req.Department),
		Status:     models.ConvWaiting,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	s.conversations[convID] = conv
	s.messages[convID] = make([]*models.Message, 0)

	sysMsg := &models.Message{
		ID:             "sys-" + uuid.New().String()[:8],
		ConversationID: convID,
		SenderID:       "system",
		SenderType:     models.SenderSystem,
		SenderName:     "Sistema SOL",
		Content:        fmt.Sprintf("Olá, %s! Seu atendimento foi iniciado. Em instantes um operador irá lhe atender.", cleanName),
		Timestamp:      now.Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}
	s.messages[convID] = append(s.messages[convID], sysMsg)

	return conv, nil
}

// GetConversation retorna os dados de uma conversa
func (s *ChatService) GetConversation(id string) (*models.Conversation, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	conv, exists := s.conversations[id]
	if !exists {
		return nil, ErrConversationNotFound
	}
	return conv, nil
}

// ListConversations retorna conversas filtradas por status (ex: "waiting" ou todas)
func (s *ChatService) ListConversations(status models.ConversationStatus) []*models.Conversation {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*models.Conversation, 0)
	for _, conv := range s.conversations {
		if status == "" || conv.Status == status {
			result = append(result, conv)
		}
	}
	return result
}

// AssignOperator atribui um operador à conversa
func (s *ChatService) AssignOperator(convID, operatorID, operatorName string) (*models.Conversation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	conv, exists := s.conversations[convID]
	if !exists {
		return nil, ErrConversationNotFound
	}

	conv.Operator = &models.OperatorInfo{
		ID:   operatorID,
		Name: operatorName,
	}
	conv.Status = models.ConvActive
	conv.UpdatedAt = time.Now().UTC()

	// Mensagem de sistema informando entrada do operador
	sysMsg := &models.Message{
		ID:             "sys-" + uuid.New().String()[:8],
		ConversationID: convID,
		SenderID:       "system",
		SenderType:     models.SenderSystem,
		SenderName:     "Sistema SOL",
		Content:        fmt.Sprintf("O operador %s assumiu o atendimento.", operatorName),
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}
	s.messages[convID] = append(s.messages[convID], sysMsg)

	return conv, nil
}

// CloseConversation encerra o atendimento
func (s *ChatService) CloseConversation(convID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	conv, exists := s.conversations[convID]
	if !exists {
		return ErrConversationNotFound
	}

	conv.Status = models.ConvClosed
	conv.UpdatedAt = time.Now().UTC()

	sysMsg := &models.Message{
		ID:             "sys-" + uuid.New().String()[:8],
		ConversationID: convID,
		SenderID:       "system",
		SenderType:     models.SenderSystem,
		SenderName:     "Sistema SOL",
		Content:        "Atendimento finalizado.",
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}
	s.messages[convID] = append(s.messages[convID], sysMsg)

	return nil
}

// ValidateSender verifica autorização de acesso à conversa (Anti-IDOR - Regra 4 de Segurança)
func (s *ChatService) ValidateSender(convID, senderID string, senderType models.SenderType) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	conv, exists := s.conversations[convID]
	if !exists {
		return false
	}

	// Se for cliente, precisa ser o cliente que abriu a conversa
	if senderType == models.SenderClient {
		return conv.ClientID == senderID
	}

	// Operadores têm acesso geral ou quando atribuídos
	if senderType == models.SenderOperator {
		return true
	}

	// Sistema
	return senderType == models.SenderSystem
}

// SaveMessage persiste mensagem e valida conteúdo (Regra 1 e 8 de Segurança)
func (s *ChatService) SaveMessage(msg *models.Message) error {
	cleanContent := models.SanitizeText(msg.Content)
	if cleanContent == "" {
		return fmt.Errorf("%w: conteúdo da mensagem não pode ser vazio", ErrInvalidInput)
	}
	if len(cleanContent) > 2000 {
		return fmt.Errorf("%w: mensagem excede limite máximo de 2000 caracteres", ErrInvalidInput)
	}

	msg.Content = cleanContent
	if msg.ID == "" {
		msg.ID = "msg-" + uuid.New().String()[:12]
	}
	if msg.Timestamp == "" {
		msg.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	msgs, exists := s.messages[msg.ConversationID]
	if !exists {
		return ErrConversationNotFound
	}

	s.messages[msg.ConversationID] = append(msgs, msg)
	return nil
}

// GetMessages retorna mensagens de uma conversa
func (s *ChatService) GetMessages(convID string, limit int) ([]*models.Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	msgs, exists := s.messages[convID]
	if !exists {
		return nil, ErrConversationNotFound
	}

	if limit <= 0 || limit > len(msgs) {
		limit = len(msgs)
	}

	// Retorna as últimas N mensagens
	start := len(msgs) - limit
	result := make([]*models.Message, limit)
	copy(result, msgs[start:])

	return result, nil
}

// ResetAll encerra todas as conversas e limpa completamente todo o histórico e mensagens da memória
func (s *ChatService) ResetAll() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.conversations = make(map[string]*models.Conversation)
	s.messages = make(map[string][]*models.Message)
}

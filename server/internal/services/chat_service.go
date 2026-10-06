package services

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"chat-interno-server/internal/database"
	"chat-interno-server/internal/models"
)

var (
	ErrConversationNotFound = errors.New("conversa não encontrada")
	ErrInvalidInput         = errors.New("dados de entrada inválidos")
	ErrUnauthorizedSender   = errors.New("remetente não autorizado para esta conversa")
)

// ChatService gerencia a lógica de negócio do atendimento
type ChatService struct {
	db            *database.DB
	conversations map[string]*models.Conversation
	messages      map[string][]*models.Message // conversationID -> list of messages
	mu            sync.RWMutex
}

func NewChatService(db *database.DB) *ChatService {
	s := &ChatService{
		db:            db,
		conversations: make(map[string]*models.Conversation),
		messages:      make(map[string][]*models.Message),
	}

	// Carrega atendimentos existentes do PostgreSQL para a memória
	if db != nil {
		if list, err := db.ListConversations("", ""); err == nil {
			for _, conv := range list {
				s.conversations[conv.ID] = conv
			}
		}
	}

	return s
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

	contactName := models.SanitizeText(req.ContactName)
	if contactName == "" {
		contactName = cleanName
	}

	cleanClientID := strings.TrimSpace(req.ClientID)
	if cleanClientID == "" {
		cleanClientID = "client-" + uuid.New().String()[:8]
	}

	docOrCpf := models.SanitizeText(req.CpfCnpj)
	if docOrCpf == "" {
		docOrCpf = models.SanitizeText(req.EmailOrDoc)
	}

	now := time.Now().UTC()
	convID := "conv-" + uuid.New().String()[:12]

	conv := &models.Conversation{
		ID:          convID,
		ClientID:    cleanClientID,
		ClientName:  cleanName,
		ContactName: contactName,
		CpfCnpj:     docOrCpf,
		Department:  models.SanitizeText(req.Department),
		Status:      models.ConvWaiting,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// Se o CPF já possui OLT/PON/CTO cadastrada no banco, associa automaticamente
	if s.db != nil && docOrCpf != "" {
		if olt, pon, cto, err := s.db.GetCustomerNetwork(docOrCpf); err == nil && (olt != "" || cto != "") {
			conv.OLT = olt
			conv.PON = pon
			conv.CTO = cto
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.conversations[convID] = conv
	s.messages[convID] = make([]*models.Message, 0)

	// Cria mensagem inicial de boas-vindas do sistema
	welcomeGreeting := fmt.Sprintf("Olá, %s! Seu atendimento foi iniciado. Em instantes um operador irá lhe atender.", contactName)
	if contactName != cleanName {
		welcomeGreeting = fmt.Sprintf("Olá, %s! Seu atendimento referente ao titular %s foi iniciado. Em instantes um operador irá lhe atender.", contactName, cleanName)
	}

	sysMsg := &models.Message{
		ID:             "sys-" + uuid.New().String()[:8],
		ConversationID: convID,
		SenderID:       "system",
		SenderType:     models.SenderSystem,
		SenderName:     "Sistema SOL",
		Content:        welcomeGreeting,
		Timestamp:      now.Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}
	s.messages[convID] = append(s.messages[convID], sysMsg)

	// Persiste no PostgreSQL
	if s.db != nil {
		_ = s.db.UpsertConversation(conv)
		_ = s.db.SaveMessage(sysMsg)
	}

	return conv, nil
}

// CreateConversationWithID cria ou reutiliza uma conversa com um ID predefinido
func (s *ChatService) CreateConversationWithID(convID string, req models.StartChatRequest) (*models.Conversation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if existing, ok := s.conversations[convID]; ok {
		return existing, nil
	}

	// Tenta carregar do banco de dados antes de criar nova
	if s.db != nil {
		if dbConv, err := s.db.GetConversationByID(convID); err == nil && dbConv != nil {
			s.conversations[convID] = dbConv
			return dbConv, nil
		}
	}

	cleanName := models.SanitizeText(req.ClientName)
	if cleanName == "" {
		cleanName = "Cliente"
	}

	contactName := models.SanitizeText(req.ContactName)
	if contactName == "" {
		contactName = cleanName
	}

	cleanClientID := strings.TrimSpace(req.ClientID)
	if cleanClientID == "" {
		cleanClientID = "client-" + uuid.New().String()[:8]
	}

	docOrCpf := models.SanitizeText(req.CpfCnpj)
	if docOrCpf == "" {
		docOrCpf = models.SanitizeText(req.EmailOrDoc)
	}

	now := time.Now().UTC()
	conv := &models.Conversation{
		ID:          convID,
		ClientID:    cleanClientID,
		ClientName:  cleanName,
		ContactName: contactName,
		CpfCnpj:     docOrCpf,
		Department:  models.SanitizeText(req.Department),
		Status:      models.ConvWaiting,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// Se o CPF já possui OLT/PON/CTO salva no banco, associa automaticamente
	if s.db != nil && docOrCpf != "" {
		if olt, pon, cto, err := s.db.GetCustomerNetwork(docOrCpf); err == nil && (olt != "" || cto != "") {
			conv.OLT = olt
			conv.PON = pon
			conv.CTO = cto
		}
	}

	s.conversations[convID] = conv
	s.messages[convID] = make([]*models.Message, 0)

	welcomeGreeting := fmt.Sprintf("Olá, %s! Seu atendimento foi iniciado. Em instantes um operador irá lhe atender.", contactName)
	if contactName != cleanName {
		welcomeGreeting = fmt.Sprintf("Olá, %s! Seu atendimento referente ao titular %s foi iniciado. Em instantes um operador irá lhe atender.", contactName, cleanName)
	}

	sysMsg := &models.Message{
		ID:             "sys-" + uuid.New().String()[:8],
		ConversationID: convID,
		SenderID:       "system",
		SenderType:     models.SenderSystem,
		SenderName:     "Sistema SOL",
		Content:        welcomeGreeting,
		Timestamp:      now.Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}
	s.messages[convID] = append(s.messages[convID], sysMsg)

	// Persiste no PostgreSQL
	if s.db != nil {
		_ = s.db.UpsertConversation(conv)
		_ = s.db.SaveMessage(sysMsg)
	}

	return conv, nil
}

// GetConversation retorna os dados de uma conversa
func (s *ChatService) GetConversation(id string) (*models.Conversation, error) {
	s.mu.RLock()
	conv, exists := s.conversations[id]
	s.mu.RUnlock()

	if exists {
		return conv, nil
	}

	// Busca no PostgreSQL se não estiver na memória
	if s.db != nil {
		if dbConv, err := s.db.GetConversationByID(id); err == nil && dbConv != nil {
			s.mu.Lock()
			s.conversations[id] = dbConv
			s.mu.Unlock()
			return dbConv, nil
		}
	}

	return nil, ErrConversationNotFound
}

// ListConversations retorna conversas filtradas por status (ex: "waiting", "active", "closed" ou todas)
func (s *ChatService) ListConversations(status models.ConversationStatus) []*models.Conversation {
	return s.ListConversationsWithFilter(status, "")
}

// ListConversationsWithFilter lista conversas aplicando filtros de status e CPF/CNPJ
func (s *ChatService) ListConversationsWithFilter(status models.ConversationStatus, cpfCnpj string) []*models.Conversation {
	// Se o banco estiver disponível, busca histórico completo (inclusive finalizados)
	if s.db != nil {
		if dbList, err := s.db.ListConversations(status, cpfCnpj); err == nil {
			s.mu.Lock()
			for _, conv := range dbList {
				s.conversations[conv.ID] = conv
			}
			s.mu.Unlock()
			return dbList
		}
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*models.Conversation, 0)
	cleanCpf := strings.TrimSpace(cpfCnpj)
	for _, conv := range s.conversations {
		matchesStatus := (status == "" || conv.Status == status)
		matchesCpf := (cleanCpf == "" || conv.CpfCnpj == cleanCpf)
		if matchesStatus && matchesCpf {
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

	// Persiste atualização no banco de dados
	if s.db != nil {
		_ = s.db.UpsertConversation(conv)
		_ = s.db.SaveMessage(sysMsg)
	}

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

	// Persiste o encerramento da conversa no banco de dados
	if s.db != nil {
		_ = s.db.UpsertConversation(conv)
		_ = s.db.SaveMessage(sysMsg)
	}

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

	// Assegura que o mapa de mensagens existe para esta conversa
	if _, exists := s.messages[msg.ConversationID]; !exists {
		s.messages[msg.ConversationID] = make([]*models.Message, 0)
	}

	// Assegura que a conversa existe no histórico (auto-cria se enviada direto do cliente)
	conv, convExists := s.conversations[msg.ConversationID]
	if !convExists {
		now := time.Now().UTC()
		senderName := msg.SenderName
		if senderName == "" {
			senderName = "Cliente"
		}
		conv = &models.Conversation{
			ID:          msg.ConversationID,
			ClientID:    msg.SenderID,
			ClientName:  senderName,
			ContactName: senderName,
			Department:  "Suporte Técnico",
			Status:      models.ConvWaiting,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		s.conversations[msg.ConversationID] = conv
	} else {
		conv.UpdatedAt = time.Now().UTC()
	}

	s.messages[msg.ConversationID] = append(s.messages[msg.ConversationID], msg)

	// Persiste a mensagem e o estado da conversa no PostgreSQL
	if s.db != nil {
		_ = s.db.SaveMessage(msg)
		_ = s.db.UpsertConversation(conv)
	}

	return nil
}

// GetMessages retorna mensagens de uma conversa (da memória ou do banco)
func (s *ChatService) GetMessages(convID string, limit int) ([]*models.Message, error) {
	s.mu.RLock()
	msgs, exists := s.messages[convID]
	s.mu.RUnlock()

	// Se não existirem mensagens na memória, busca no PostgreSQL
	if (!exists || len(msgs) == 0) && s.db != nil {
		if dbMsgs, err := s.db.GetMessagesByConversation(convID, limit); err == nil && len(dbMsgs) > 0 {
			s.mu.Lock()
			s.messages[convID] = dbMsgs
			s.mu.Unlock()
			return dbMsgs, nil
		}
	}

	if !exists {
		return make([]*models.Message, 0), nil
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

// ResetAll encerra todas as conversas e limpa completamente todo o histórico e mensagens da memória e banco
func (s *ChatService) ResetAll() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.conversations = make(map[string]*models.Conversation)
	s.messages = make(map[string][]*models.Message)

	if s.db != nil {
		_ = s.db.ResetConversationsAndMessages()
	}
}

// UpdateNetworkInfo atualiza OLT, PON e CTO vinculados à conversa e associa permanentemente ao CPF no banco
func (s *ChatService) UpdateNetworkInfo(convID, olt, pon, cto string) (*models.Conversation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	conv, exists := s.conversations[convID]
	if !exists {
		return nil, ErrConversationNotFound
	}

	conv.OLT = strings.TrimSpace(olt)
	conv.PON = strings.TrimSpace(pon)
	conv.CTO = strings.TrimSpace(cto)
	conv.UpdatedAt = time.Now().UTC()

	// Persiste na conversa e vincula o CPF do cliente à CTO na tabela customer_network
	if s.db != nil {
		_ = s.db.UpsertConversation(conv)
		if conv.CpfCnpj != "" {
			_ = s.db.SaveCustomerNetwork(conv.CpfCnpj, conv.OLT, conv.PON, conv.CTO)
		}
	}

	return conv, nil
}



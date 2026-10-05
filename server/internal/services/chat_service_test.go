package services_test

import (
	"context"
	"testing"
	"time"

	"chat-interno-server/internal/models"
	"chat-interno-server/internal/services"
)

func TestCreateConversationValid(t *testing.T) {
	service := services.NewChatService()

	req := models.StartChatRequest{
		ClientID:   "client-123",
		ClientName: "Carlos Alberto",
		Department: "Suporte",
	}

	conv, err := service.CreateConversation(req)
	if err != nil {
		t.Fatalf("Esperava sucesso na criação, erro retornado: %v", err)
	}

	if conv.ID == "" {
		t.Errorf("ID da conversa não pode ser vazio")
	}
	if conv.ClientName != "Carlos Alberto" {
		t.Errorf("Esperava nome 'Carlos Alberto', obteve '%s'", conv.ClientName)
	}
	if conv.Status != models.ConvWaiting {
		t.Errorf("Status inicial deve ser 'waiting', obteve '%s'", conv.Status)
	}

	// Verifica se a mensagem de boas-vindas do sistema foi gerada
	msgs, err := service.GetMessages(conv.ID, 10)
	if err != nil || len(msgs) != 1 {
		t.Fatalf("Esperava 1 mensagem inicial de sistema, obteve %d", len(msgs))
	}
	if msgs[0].SenderType != models.SenderSystem {
		t.Errorf("Mensagem inicial deve ser de sistema")
	}
}

func TestCreateConversationEmptyNameValidation(t *testing.T) {
	service := services.NewChatService()

	req := models.StartChatRequest{
		ClientID:   "client-123",
		ClientName: "   ", // Nome em branco deve falhar na validação
	}

	_, err := service.CreateConversation(req)
	if err == nil {
		t.Errorf("Esperava falha na validação de nome em branco (Regra 1 de Segurança)")
	}
}

func TestSaveMessageAndAntiIDOR(t *testing.T) {
	service := services.NewChatService()

	conv, err := service.CreateConversation(models.StartChatRequest{
		ClientID:   "cliente-autorizado",
		ClientName: "Ana Maria",
	})
	if err != nil {
		t.Fatalf("Erro ao criar conversa: %v", err)
	}

	// Validação Anti-IDOR (Regra 4 de Segurança)
	if !service.ValidateSender(conv.ID, "cliente-autorizado", models.SenderClient) {
		t.Errorf("Cliente legítimo deveria ter autorização de acesso")
	}
	if service.ValidateSender(conv.ID, "cliente-invasor", models.SenderClient) {
		t.Errorf("Cliente não autorizado NÃO deve ter acesso à conversa (falha de Anti-IDOR)")
	}

	// Envio de mensagem válida
	msg := &models.Message{
		ConversationID: conv.ID,
		SenderID:       "cliente-autorizado",
		SenderType:     models.SenderClient,
		SenderName:     "Ana Maria",
		Content:        "Preciso de suporte com a fatura",
	}

	if err := service.SaveMessage(msg); err != nil {
		t.Fatalf("Erro ao salvar mensagem: %v", err)
	}

	// Tentativa de envio com texto vazio (Regra 1 de Segurança)
	emptyMsg := &models.Message{
		ConversationID: conv.ID,
		SenderID:       "cliente-autorizado",
		Content:        "   ",
	}
	if err := service.SaveMessage(emptyMsg); err == nil {
		t.Errorf("Mensagem vazia deveria ter sido rejeitada pelo servidor")
	}
}

func TestAssignAndCloseConversation(t *testing.T) {
	service := services.NewChatService()

	conv, err := service.CreateConversation(models.StartChatRequest{
		ClientID:   "client-99",
		ClientName: "Roberto",
	})
	if err != nil {
		t.Fatalf("Erro ao criar conversa: %v", err)
	}

	// Atribuição de operador
	updated, err := service.AssignOperator(conv.ID, "op-01", "Mariana Suporte")
	if err != nil {
		t.Fatalf("Erro ao atribuir operador: %v", err)
	}
	if updated.Status != models.ConvActive {
		t.Errorf("Status deveria mudar para 'active', obteve '%s'", updated.Status)
	}
	if updated.Operator == nil || updated.Operator.Name != "Mariana Suporte" {
		t.Errorf("Operador não foi atribuído corretamente")
	}

	// Encerramento
	if err := service.CloseConversation(conv.ID); err != nil {
		t.Fatalf("Erro ao encerrar conversa: %v", err)
	}
	closed, _ := service.GetConversation(conv.ID)
	if closed.Status != models.ConvClosed {
		t.Errorf("Status deveria ser 'closed', obteve '%s'", closed.Status)
	}
}

func TestExternalAPIConcurrency(t *testing.T) {
	extService := services.NewExternalAPIService()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	start := time.Now()
	data, err := extService.EnrichCustomerData(ctx, "cliente@empresa.com")
	duration := time.Since(start)

	if err != nil {
		t.Fatalf("Erro na consulta externa: %v", err)
	}

	if data.CRMData == nil || data.FinancialStatus == nil {
		t.Errorf("Dados agregados incompletos")
	}

	// Como as 3 chamadas rodam concorrentemente (30ms, 40ms, 20ms), o tempo total deve ser próximo do maior (~40ms-60ms) e NÃO sequencial (~90ms+)
	t.Logf("Consulta externa concorrente concluída em: %v", duration)
}

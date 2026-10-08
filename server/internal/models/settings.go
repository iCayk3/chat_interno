package models

// FlowActionType define o tipo de ação de cada nó no fluxo de atendimento
type FlowActionType string

const (
	FlowActionSubmenu  FlowActionType = "submenu"  // Exibe opções filhas
	FlowActionTransfer FlowActionType = "transfer" // Transfere para atendente humano na fila
	FlowActionClose    FlowActionType = "close"    // Encerra atendimento com mensagem configurada
	FlowActionERP      FlowActionType = "erp"      // Ação automática com sistema externo (2a via, promessa)
	FlowActionAI       FlowActionType = "ai"       // Delega para assistente de Inteligência Artificial
)

// FlowNode representa um nó interativo na árvore do chatbot
type FlowNode struct {
	ID         string         `json:"id"`
	Title      string         `json:"title"`
	Emoji      string         `json:"emoji,omitempty"`
	Message    string         `json:"message"`
	Action     FlowActionType `json:"action"`
	Department string         `json:"department,omitempty"` // Departamento destino se action == "transfer"
	ERPAction  string         `json:"erpAction,omitempty"`  // Identificador da ação no ERP se action == "erp"
	Children   []*FlowNode    `json:"children,omitempty"`
}

// ChatSettings reúne todas as configurações de encerramento, fluxo e IA
type ChatSettings struct {
	CloseMessage         string    `json:"closeMessage"`
	WelcomeMessage       string    `json:"welcomeMessage"`
	QueueTransferMessage string    `json:"queueTransferMessage"`
	OutOfHoursMessage    string    `json:"outOfHoursMessage"`
	EnableBotFlow        bool      `json:"enableBotFlow"`
	ChatbotFlow          *FlowNode `json:"chatbotFlow"`
	AIEnabled            bool      `json:"aiEnabled"`
	AIPrompt             string    `json:"aiPrompt"`

	// Inatividade e Transbordo no Chatbot
	BotTimeoutMinutes int    `json:"botTimeoutMinutes"` // Minutos máximos no bot sem selecionar setor (padrão: 3)
	BotFallbackDept   string `json:"botFallbackDept"`   // Setor destino caso o cliente não selecione (padrão: "Suporte Técnico")
}

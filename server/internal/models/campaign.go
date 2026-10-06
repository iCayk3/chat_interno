package models

import "time"

// DeviceRegistration vincula um aparelho móvel (Android / iOS) ao CPF do cliente
type DeviceRegistration struct {
	DeviceID   string    `json:"deviceId"`             // UUID persistido no app do cliente
	CpfCnpj    string    `json:"cpfCnpj"`              // Apenas dígitos do CPF ou CNPJ
	ClientName string    `json:"clientName"`           // Nome do titular ou contato
	Platform   string    `json:"platform"`             // "android" | "ios" | "web"
	PushToken  string    `json:"pushToken,omitempty"`  // Token para notificações push nativas
	AppVersion string    `json:"appVersion,omitempty"` // Versão do app instalada
	OLT        string    `json:"olt,omitempty"`        // OLT associada (ex: OLT-CENTRAL-01)
	PON        string    `json:"pon,omitempty"`        // Porta PON associada (ex: PON 1/2)
	CTO        string    `json:"cto,omitempty"`        // Caixa de terminação óptica (ex: CTO-14)
	RbxGroup   string    `json:"rbxGroup,omitempty"`   // Código ou nome do grupo RBX
	LastSeenAt time.Time `json:"lastSeenAt"`
	CreatedAt  time.Time `json:"createdAt"`
}

// CampaignTargetType define o critério de público-alvo da campanha
type CampaignTargetType string

const (
	TargetAll      CampaignTargetType = "all"       // Todos os aparelhos cadastrados no app
	TargetSpecific CampaignTargetType = "specific"  // Lista de CPFs específicos (ótimo para testes)
	TargetDept     CampaignTargetType = "dept"      // Segmentado por departamento
	TargetNetwork  CampaignTargetType = "network"   // Segmentado por Infraestrutura de Rede (OLT / PON / CTO)
	TargetRbxGroup CampaignTargetType = "rbx_group" // Segmentado por Grupo de Clientes do RBX
)

// Campaign define uma campanha de comunicação em massa
type Campaign struct {
	ID                 string             `json:"id"`
	Title              string             `json:"title"`
	Message            string             `json:"message"`
	Department         string             `json:"department"`
	TargetType         CampaignTargetType `json:"targetType"`
	TargetCpfs         []string           `json:"targetCpfs,omitempty"`
	TargetOlt          string             `json:"targetOlt,omitempty"`
	TargetPon          string             `json:"targetPon,omitempty"`
	TargetCto          string             `json:"targetCto,omitempty"`
	TargetOlts         []string           `json:"targetOlts,omitempty"`
	TargetPons         []string           `json:"targetPons,omitempty"`
	TargetCtos         []string           `json:"targetCtos,omitempty"`
	TargetRbxGroup     string             `json:"targetRbxGroup,omitempty"`
	TargetRbxGroupName string             `json:"targetRbxGroupName,omitempty"`
	TargetRbxGroups    []string           `json:"targetRbxGroups,omitempty"`
	TargetRbxGroupNames []string          `json:"targetRbxGroupNames,omitempty"`
	TargetDesc         string             `json:"target"`
	ActionType         string             `json:"actionType"` // "chat_and_view" | "view_only"
	ChatInitialMsg     string             `json:"chatInitialMsg,omitempty"`
	Status             string             `json:"status"` // "rascunho" | "ativa" | "concluida"
	SentCount          int                `json:"sentCount"`
	DeliveredRate      string             `json:"deliveredRate"`
	CreatedAt          time.Time          `json:"createdAt"`
	CreatedBy          string             `json:"createdBy,omitempty"`
}

// ClientNotification representa a notificação recebida no celular do cliente
type ClientNotification struct {
	ID             string    `json:"id"`
	CampaignID     string    `json:"campaignId"`
	Title          string    `json:"title"`
	Message        string    `json:"message"`
	Department     string    `json:"department"`
	ActionType     string    `json:"actionType"` // "chat_and_view" | "view_only"
	ChatInitialMsg string    `json:"chatInitialMsg,omitempty"`
	CpfCnpj        string    `json:"cpfCnpj"`
	DeviceID       string    `json:"deviceId,omitempty"`
	Read           bool      `json:"read"`
	CreatedAt      time.Time `json:"createdAt"`
}

// DispatchResult resultado consolidado do disparo de campanha
type DispatchResult struct {
	CampaignID        string `json:"campaignId"`
	TotalTargeted     int    `json:"totalTargeted"`
	DeliveredRealtime int    `json:"deliveredRealtime"`
	Message           string `json:"message"`
}

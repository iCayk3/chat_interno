package models

import "time"

// OperationMode define o modo de trabalho do sistema
type OperationMode string

const (
	OperationModeERP    OperationMode = "erp"    // Modo 1: Integrado com ERP externo (ex: RBX)
	OperationModeNative OperationMode = "native" // Modo 2: Banco de dados nativo de clientes + Mercado Pago
	OperationModeHybrid OperationMode = "hybrid" // Híbrido: Ambos os modos ativos simultaneamente
)

// MercadoPagoConfig armazena as credenciais e configurações de pagamento
type MercadoPagoConfig struct {
	AccessToken   string `json:"accessToken,omitempty"`   // Token de produção ou sandbox (APP_USR-...)
	PublicKey     string `json:"publicKey,omitempty"`     // Chave pública para checkout transparente
	WebhookSecret string `json:"webhookSecret,omitempty"` // Chave secreta para validação de assinatura de webhook
	Sandbox       bool   `json:"sandbox"`                 // Se está em modo testes
	Configured    bool   `json:"configured"`              // Se as credenciais foram preenchidas
}

// SystemSettings reúne todas as configurações operacionais do software
type SystemSettings struct {
	OperationMode   OperationMode     `json:"operationMode"`   // "erp", "native" ou "hybrid"
	SetupCompleted  bool              `json:"setupCompleted"`  // Se o assistente de instalação foi finalizado
	CompanyName     string            `json:"companyName"`     // Nome da empresa / provedor
	CompanyCNPJ     string            `json:"companyCnpj"`     // CNPJ da empresa
	CompanyPhone    string            `json:"companyPhone"`    // Telefone de contato
	CompanyEmail    string            `json:"companyEmail"`    // E-mail de suporte
	MercadoPago     MercadoPagoConfig `json:"mercadopago"`     // Configurações do Mercado Pago
	UpdatedAt       time.Time         `json:"updatedAt"`       // Data da última alteração
}

// SystemSettingsResponse é o DTO seguro para o frontend (sem expor segredos completos)
type SystemSettingsResponse struct {
	OperationMode   OperationMode `json:"operationMode"`
	SetupCompleted  bool          `json:"setupCompleted"`
	CompanyName     string        `json:"companyName"`
	CompanyCNPJ     string        `json:"companyCnpj"`
	CompanyPhone    string        `json:"companyPhone"`
	CompanyEmail    string        `json:"companyEmail"`
	MercadoPago     struct {
		PublicKey     string `json:"publicKey"`
		MaskedToken   string `json:"maskedToken"`
		WebhookSecret string `json:"maskedWebhookSecret"`
		Sandbox       bool   `json:"sandbox"`
		Configured    bool   `json:"configured"`
	} `json:"mercadopago"`
	UpdatedAt time.Time `json:"updatedAt"`
}

package models

import "time"

type LicenseType string

const (
	LicenseTrial    LicenseType = "trial"
	LicenseCortesia LicenseType = "cortesia"
	LicensePaid     LicenseType = "paid"
)

type LicenseStatus string

const (
	StatusActive    LicenseStatus = "active"
	StatusTrial     LicenseStatus = "trial"
	StatusSuspended LicenseStatus = "suspended"
	StatusRevoked   LicenseStatus = "revoked"
)

type Tenant struct {
	ID                  string        `json:"id"`
	LicenseKey          string        `json:"licenseKey"`
	TenantCNPJ          string        `json:"tenantCnpj"`
	TenantName          string        `json:"tenantName"`
	ContactPerson       string        `json:"contactPerson"`
	ContactEmail        string        `json:"contactEmail"`
	ContactPhone        string        `json:"contactPhone"`
	LicenseType         LicenseType   `json:"licenseType"`
	Status              LicenseStatus `json:"status"`
	TrialDaysRemaining  int           `json:"trialDaysRemaining"`
	TrialStartedAt      time.Time     `json:"trialStartedAt"`
	ExpiresAt           time.Time     `json:"expiresAt"`
	GracePeriodUntil    time.Time     `json:"gracePeriodUntil"`
	LastHeartbeatAt     time.Time     `json:"lastHeartbeatAt"`
	ServerHost          string        `json:"serverHost"`
	ClientVersion       string        `json:"clientVersion"`
	ActiveOperators     int           `json:"activeOperators"`
	MaxOperators        int           `json:"maxOperators"`
	AllowedModules      string        `json:"allowedModules"`
	AllowedOperationMode string       `json:"allowedOperationMode"` // "erp", "native", "hybrid"
	SuspensionReason    string        `json:"suspensionReason,omitempty"`
	PaymentPix          string        `json:"paymentPix,omitempty"`
	PaymentQRCodeBase64 string        `json:"paymentQrCodeBase64,omitempty"`
	PaymentAmount       float64       `json:"paymentAmount,omitempty"`
	DiscountDescription string        `json:"discountDescription,omitempty"`
	DiscountAmount      float64       `json:"discountAmount,omitempty"`
	PendingPlanCycle    string        `json:"pendingPlanCycle,omitempty"`
	PendingPaymentID    string        `json:"pendingPaymentId,omitempty"`
	PaymentCheckoutURL  string        `json:"paymentCheckoutUrl,omitempty"`
	Notes               string        `json:"notes,omitempty"`
	CreatedAt           time.Time     `json:"createdAt"`
	UpdatedAt           time.Time     `json:"updatedAt"`
}

type CreateTenantRequest struct {
	TenantName          string      `json:"tenantName"`
	TenantCNPJ          string      `json:"tenantCnpj"`
	ContactPerson       string      `json:"contactPerson"`
	ContactEmail        string      `json:"contactEmail"`
	ContactPhone        string      `json:"contactPhone"`
	LicenseType         LicenseType `json:"licenseType"` // trial, cortesia, paid
	TrialDays           int         `json:"trialDays"`    // e.g. 30, 45, 60
	MaxOperators        int         `json:"maxOperators"`
	AllowedModules      string      `json:"allowedModules"`
	AllowedOperationMode string     `json:"allowedOperationMode"` // "erp", "native", "hybrid"
	MonthlyPrice        float64     `json:"monthlyPrice"`
	DiscountDescription string      `json:"discountDescription"`
	DiscountAmount      float64     `json:"discountAmount"`
	Notes               string      `json:"notes"`
}

type UpdateOperationModeRequest struct {
	AllowedOperationMode string `json:"allowedOperationMode"` // "erp", "native", "hybrid"
}

type UpdateTenantStatusRequest struct {
	Status           LicenseStatus `json:"status"` // active, suspended, trial, cortesia, revoked
	SuspensionReason string        `json:"suspensionReason"`
}

type ExtendTrialRequest struct {
	DaysToAdd int `json:"daysToAdd"` // e.g. 15, 30, 60
}

type UpdateDiscountRequest struct {
	DiscountDescription string  `json:"discountDescription"`
	DiscountAmount      float64 `json:"discountAmount"`
	PaymentAmount       float64 `json:"paymentAmount"`
}

type UpdateBillingRequest struct {
	PaymentPix          string  `json:"paymentPix"`
	PaymentQRCodeBase64 string  `json:"paymentQrCodeBase64"`
	PaymentAmount       float64 `json:"paymentAmount"`
}

type CreateCheckoutRequest struct {
	LicenseKey    string `json:"licenseKey"`
	TenantCNPJ    string `json:"tenantCnpj"`
	TenantName    string `json:"tenantName"`
	Cycle         string `json:"cycle"`         // "monthly" | "annual"
	PaymentMethod string `json:"paymentMethod"` // "pix" | "mercadopago"
}

type CreateCheckoutResponse struct {
	Success        bool    `json:"success"`
	LicenseKey     string  `json:"licenseKey"`
	Cycle          string  `json:"cycle"`
	Amount         float64 `json:"amount"`
	DiscountAmount float64 `json:"discountAmount"`
	PaymentMethod  string  `json:"paymentMethod"`
	PaymentPix     string  `json:"paymentPix,omitempty"`
	PaymentQRCode  string  `json:"paymentQrCode,omitempty"`
	CheckoutURL    string  `json:"checkoutUrl,omitempty"`
	PaymentID      string  `json:"paymentId,omitempty"`
	Status         string  `json:"status"`
	Message        string  `json:"message"`
}

type ConfirmPaymentRequest struct {
	LicenseKey string `json:"licenseKey"`
	Cycle      string `json:"cycle"`
	PaymentID  string `json:"paymentId,omitempty"`
}

type LicensePlanOptionsResponse struct {
	MonthlyPrice        float64 `json:"monthlyPrice"`
	AnnualPrice         float64 `json:"annualPrice"`
	DiscountAmount      float64 `json:"discountAmount"`
	DiscountDescription string  `json:"discountDescription"`
	FinalMonthlyPrice   float64 `json:"finalMonthlyPrice"`
	FinalAnnualPrice    float64 `json:"finalAnnualPrice"`
}

type LicenseHeartbeatRequest struct {
	LicenseKey      string `json:"licenseKey"`
	TenantCNPJ      string `json:"tenantCnpj"`
	TenantName      string `json:"tenantName"`
	ServerHost      string `json:"serverHost"`
	ClientVersion   string `json:"clientVersion"`
	ActiveOperators int    `json:"activeOperators"`
}

type AutoRegisterTenantRequest struct {
	TenantName         string `json:"tenantName"`
	TenantCNPJ         string `json:"tenantCnpj"`
	ServerHost         string `json:"serverHost"`
	MachineFingerprint string `json:"machineFingerprint"`
	SoftwareVersion    string `json:"softwareVersion"`
	OperationMode      string `json:"operationMode"`
}

type LicenseHeartbeatResponse struct {
	LicenseKey          string        `json:"licenseKey,omitempty"`
	TenantName          string        `json:"tenantName,omitempty"`
	Status              LicenseStatus `json:"status"`
	LicenseType         LicenseType   `json:"licenseType"`
	TrialDaysRemaining  int           `json:"trialDaysRemaining"`
	ExpiresAt           string        `json:"expiresAt"`
	GracePeriodUntil    string        `json:"gracePeriodUntil"`
	MaxOperators        int           `json:"maxOperators"`
	AllowedModules      string        `json:"allowedModules"`
	AllowedOperationMode string       `json:"allowedOperationMode"` // "erp", "native", "hybrid"
	SuspensionReason    string        `json:"suspensionReason,omitempty"`
	PaymentPix          string        `json:"paymentPix,omitempty"`
	PaymentQRCodeBase64 string        `json:"paymentQrCodeBase64,omitempty"`
	PaymentAmount       float64       `json:"paymentAmount,omitempty"`
	DiscountDescription string        `json:"discountDescription,omitempty"`
	DiscountAmount      float64       `json:"discountAmount,omitempty"`
	ContactSupportPhone string        `json:"contactSupportPhone,omitempty"`
	ContactSupportEmail string        `json:"contactSupportEmail,omitempty"`
	Signature           string        `json:"signature"`
}

type MasterStatsResponse struct {
	TotalTenants     int     `json:"totalTenants"`
	ActiveTenants    int     `json:"activeTenants"`
	TrialTenants     int     `json:"trialTenants"`
	SuspendedTenants int     `json:"suspendedTenants"`
	CortesiaTenants  int     `json:"cortesiaTenants"`
	TotalMonthlyMRR  float64 `json:"totalMonthlyMrr"`
	PendingPayments  int     `json:"pendingPayments"`
}

// MasterFinanceSettings configurações de recebimento exclusivas do Proprietário do Software
type MasterFinanceSettings struct {
	MasterPixKey           string  `json:"masterPixKey"`           // Chave PIX da sua empresa (CNPJ, celular, email, etc.)
	BeneficiaryName        string  `json:"beneficiaryName"`        // Nome da sua empresa / titular
	BeneficiaryCity        string  `json:"beneficiaryCity"`        // Cidade da sua conta bancária
	MercadoPagoAccessToken string  `json:"mercadoPagoAccessToken"` // Seu Access Token (privado, nunca enviado aos clientes)
	MercadoPagoPublicKey   string  `json:"mercadoPagoPublicKey"`   // Sua Public Key
	MercadoPagoWebhookSec  string  `json:"mercadoPagoWebhookSec"`  // Seu Webhook Secret
	DefaultMonthlyPrice    float64 `json:"defaultMonthlyPrice"`    // Valor padrão de mensalidade por instalação
	DefaultAnnualPrice     float64 `json:"defaultAnnualPrice"`     // Valor padrão anual por instalação
	AutoGeneratePix        bool    `json:"autoGeneratePix"`        // Se ativado, monta o PIX Copia e Cola automaticamente
}

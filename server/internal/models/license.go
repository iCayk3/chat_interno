package models

import "time"

// LicenseType define a categoria de licenciamento da instância
type LicenseType string

const (
	LicenseTypeTrial    LicenseType = "trial"    // Modo de demonstração / testes gratuito
	LicenseTypeCortesia LicenseType = "cortesia" // Gratuito permanente (parceiro / homologação)
	LicenseTypePaid     LicenseType = "paid"     // Assinatura comercial ativa
)

// LicenseStatus define a situação operacional do software
type LicenseStatus string

const (
	LicenseStatusActive       LicenseStatus = "active"       // Regular e liberado
	LicenseStatusTrial        LicenseStatus = "trial"        // Em período de avaliação gratuita
	LicenseStatusSuspended    LicenseStatus = "suspended"    // Suspenso temporariamente por falta de pagamento ou teste esgotado
	LicenseStatusRevoked      LicenseStatus = "revoked"      // Cancelado permanentemente
	LicenseStatusUnregistered LicenseStatus = "unregistered" // Nenhuma licença vinculada
)

// SystemLicense representa a licença local armazenada e verificada pelo agente
type SystemLicense struct {
	LicenseKey          string        `json:"licenseKey"`
	TenantCNPJ          string        `json:"tenantCnpj"`
	TenantName          string        `json:"tenantName"`
	LicenseType         LicenseType   `json:"licenseType"`
	Status              LicenseStatus `json:"status"`
	TrialDaysRemaining  int           `json:"trialDaysRemaining"`
	ExpiresAt           time.Time     `json:"expiresAt"`
	GracePeriodUntil    time.Time     `json:"gracePeriodUntil"`
	LastHeartbeatAt     time.Time     `json:"lastHeartbeatAt"`
	MaxOperators        int           `json:"maxOperators"`
	AllowedModules      string        `json:"allowedModules"` // "erp,native,omnichannel"
	AllowedOperationMode string       `json:"allowedOperationMode"` // "erp", "native" ou "hybrid"
	SuspensionReason    string        `json:"suspensionReason,omitempty"`
	PaymentPix          string        `json:"paymentPix,omitempty"`
	PaymentQRCodeBase64 string        `json:"paymentQrCodeBase64,omitempty"`
	PaymentAmount       float64       `json:"paymentAmount,omitempty"`
	DiscountDescription string        `json:"discountDescription,omitempty"`
	DiscountAmount      float64       `json:"discountAmount,omitempty"`
	ContactSupportPhone string        `json:"contactSupportPhone,omitempty"`
	ContactSupportEmail string        `json:"contactSupportEmail,omitempty"`
	Signature           string        `json:"-"` // Assinatura digital recebida do Master Server
	UpdatedAt           time.Time     `json:"updatedAt"`
}

// LicenseHeartbeatRequest é o payload enviado pelo software cliente ao Super Sistema Master
type LicenseHeartbeatRequest struct {
	LicenseKey         string `json:"licenseKey"`
	TenantCNPJ         string `json:"tenantCnpj"`
	SoftwareVersion    string `json:"softwareVersion"`
	MachineFingerprint string `json:"machineFingerprint"`
	ActiveOperators    int    `json:"activeOperators"`
}

// LicenseHeartbeatResponse é a resposta assinada pelo Super Sistema Master
type LicenseHeartbeatResponse struct {
	LicenseKey          string        `json:"licenseKey,omitempty"`
	TenantName          string        `json:"tenantName,omitempty"`
	Status              LicenseStatus `json:"status"`
	LicenseType         LicenseType   `json:"licenseType"`
	ExpiresAt           string        `json:"expiresAt"`
	GracePeriodHours    int           `json:"gracePeriodHours"`
	MaxOperators        int           `json:"maxOperators"`
	AllowedModules      string        `json:"allowedModules"`
	AllowedOperationMode string       `json:"allowedOperationMode"`
	SuspensionReason    string        `json:"suspensionReason,omitempty"`
	PaymentPix          string        `json:"paymentPix,omitempty"`
	PaymentQRCodeBase64 string        `json:"paymentQrCodeBase64,omitempty"`
	PaymentAmount       float64       `json:"paymentAmount,omitempty"`
	DiscountDescription string        `json:"discountDescription,omitempty"`
	DiscountAmount      float64       `json:"discountAmount,omitempty"`
	ContactSupportPhone string        `json:"contactSupportPhone,omitempty"`
	ContactSupportEmail string        `json:"contactSupportEmail,omitempty"`
	Signature           string        `json:"signature"`
	ServerTimestamp     string        `json:"serverTimestamp"`
}

type AutoRegisterTenantRequest struct {
	TenantName         string `json:"tenantName"`
	TenantCNPJ         string `json:"tenantCnpj"`
	ServerHost         string `json:"serverHost"`
	MachineFingerprint string `json:"machineFingerprint"`
	SoftwareVersion    string `json:"softwareVersion"`
	OperationMode      string `json:"operationMode"`
}

// ActivateLicenseRequest DTO de ativação manual no software
type ActivateLicenseRequest struct {
	LicenseKey string `json:"licenseKey"`
}

type CreateLicenseCheckoutRequest struct {
	Cycle         string `json:"cycle"`         // "monthly" | "annual"
	PaymentMethod string `json:"paymentMethod"` // "pix" | "mercadopago"
}

type LicenseCheckoutResponse struct {
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

type LicensePlanOptionsResponse struct {
	MonthlyPrice        float64 `json:"monthlyPrice"`
	AnnualPrice         float64 `json:"annualPrice"`
	DiscountAmount      float64 `json:"discountAmount"`
	DiscountDescription string  `json:"discountDescription"`
	FinalMonthlyPrice   float64 `json:"finalMonthlyPrice"`
	FinalAnnualPrice    float64 `json:"finalAnnualPrice"`
}

package models

import "time"

// NativePlan representa um plano, produto ou serviço oferecido pela empresa
type NativePlan struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`          // Ex: "Fibra 600 Mega"
	Description   string    `json:"description"`   // Ex: "Internet fibra ótica de alta velocidade com suporte 24h"
	Price         float64   `json:"price"`         // Valor mensal (ex: 99.90)
	BillingCycle  string    `json:"billingCycle"`  // "mensal", "trimestral", "semestral", "anual"
	SpeedDownload string    `json:"speedDownload"` // Ex: "600 Mbps"
	SpeedUpload   string    `json:"speedUpload"`   // Ex: "300 Mbps"
	Active        bool      `json:"active"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// NativeCustomerStatus define a situação contratual do cliente
type NativeCustomerStatus string

const (
	CustomerStatusActive   NativeCustomerStatus = "active"   // Ativo / Conexão normal
	CustomerStatusBlocked  NativeCustomerStatus = "blocked"  // Bloqueado / Suspenso por atraso
	CustomerStatusCanceled NativeCustomerStatus = "canceled" // Cancelado / Inativo
)

// NativeCustomer representa o cadastro de cliente no banco de dados nativo
type NativeCustomer struct {
	ID           string               `json:"id"`
	Name         string               `json:"name"`
	CPFCnpj      string               `json:"cpfCnpj"`
	Email        string               `json:"email"`
	Phone        string               `json:"phone"`
	Address      string               `json:"address"`
	Number       string               `json:"number"`
	Complement   string               `json:"complement"`
	Neighborhood string               `json:"neighborhood"`
	City         string               `json:"city"`
	State        string               `json:"state"`
	PostalCode   string               `json:"postalCode"`
	PlanID       string               `json:"planId"`
	PlanName     string               `json:"planName,omitempty"`     // Nome do plano snapshot
	MonthlyPrice float64              `json:"monthlyPrice"`           // Valor mensal contratado
	DueDay       int                  `json:"dueDay"`                 // Dia de vencimento da fatura (1 a 31)
	Status       NativeCustomerStatus `json:"status"`                 // "active", "blocked", "canceled"
	Notes        string               `json:"notes,omitempty"`
	CreatedAt    time.Time            `json:"createdAt"`
	UpdatedAt    time.Time            `json:"updatedAt"`
}

// InvoiceStatus define a situação do título / cobrança
type InvoiceStatus string

const (
	InvoiceStatusPending  InvoiceStatus = "pending"  // Aguardando pagamento
	InvoiceStatusPaid     InvoiceStatus = "paid"     // Pago com sucesso
	InvoiceStatusOverdue  InvoiceStatus = "overdue"  // Vencido
	InvoiceStatusCanceled InvoiceStatus = "canceled" // Cancelado
)

// NativeInvoice representa uma fatura / cobrança no sistema
type NativeInvoice struct {
	ID              string        `json:"id"`
	CustomerID      string        `json:"customerId"`
	CustomerName    string        `json:"customerName,omitempty"`
	CPFCnpj         string        `json:"cpfCnpj"`
	Amount          float64       `json:"amount"`          // Valor total (ex: 99.90)
	DueDate         string        `json:"dueDate"`         // Formato YYYY-MM-DD
	Status          InvoiceStatus `json:"status"`          // "pending", "paid", "overdue", "canceled"
	Description     string        `json:"description"`     // Ex: "Mensalidade Fibra 600M - Ref 10/2026"
	PaymentMethod   string        `json:"paymentMethod"`   // "pix", "boleto", "card", "manual"
	MPPaymentID     string        `json:"mpPaymentId,omitempty"` // ID no Mercado Pago
	PixQRCode       string        `json:"pixQrCode,omitempty"`   // Código Copia e Cola Pix
	PixQRCodeBase64 string        `json:"pixQrCodeBase64,omitempty"` // Imagem em Base64 do QR Code
	BoletoURL       string        `json:"boletoUrl,omitempty"`   // Link para download do boleto em PDF
	BoletoBarcode   string        `json:"boletoBarcode,omitempty"` // Linha digitável do boleto
	PaidAt          *time.Time    `json:"paidAt,omitempty"`
	CreatedAt       time.Time     `json:"createdAt"`
	UpdatedAt       time.Time     `json:"updatedAt"`
}

// CreateCustomerRequest representa a validação de entrada de criação de cliente
type CreateCustomerRequest struct {
	Name         string  `json:"name"`
	CPFCnpj      string  `json:"cpfCnpj"`
	Email        string  `json:"email"`
	Phone        string  `json:"phone"`
	Address      string  `json:"address"`
	Number       string  `json:"number"`
	Complement   string  `json:"complement"`
	Neighborhood string  `json:"neighborhood"`
	City         string  `json:"city"`
	State        string  `json:"state"`
	PostalCode   string  `json:"postalCode"`
	PlanID       string  `json:"planId"`
	MonthlyPrice float64 `json:"monthlyPrice"`
	DueDay       int     `json:"dueDay"`
	Notes        string  `json:"notes"`
}

// CreateInvoiceRequest representa a requisição para emitir uma nova cobrança
type CreateInvoiceRequest struct {
	CustomerID    string  `json:"customerId"`
	Amount        float64 `json:"amount"`
	DueDate       string  `json:"dueDate"` // YYYY-MM-DD
	Description   string  `json:"description"`
	PaymentMethod string  `json:"paymentMethod"` // "pix", "boleto", "manual"
}

package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"chat-interno-server/internal/database"
	"chat-interno-server/internal/models"
)

type NativeBillingService struct {
	db        *database.DB
	mpService *MercadoPagoService
}

func NewNativeBillingService(db *database.DB, mpService *MercadoPagoService) *NativeBillingService {
	return &NativeBillingService{
		db:        db,
		mpService: mpService,
	}
}

// ============================================================================
// SYSTEM SETTINGS & SETUP WIZARD
// ============================================================================

func (s *NativeBillingService) GetSystemSettings() (*models.SystemSettings, error) {
	if s.db == nil {
		return nil, errors.New("banco de dados indisponível")
	}
	return s.db.GetSystemSettings()
}

func (s *NativeBillingService) SaveSystemSettings(settings *models.SystemSettings) error {
	if s.db == nil {
		return errors.New("banco de dados indisponível")
	}
	if settings.OperationMode == "" {
		settings.OperationMode = models.OperationModeERP
	}
	return s.db.SaveSystemSettings(settings)
}

// GetSystemSettingsResponse retorna dados para a interface mascarando chaves sensíveis (Regra 7)
func (s *NativeBillingService) GetSystemSettingsResponse() (*models.SystemSettingsResponse, error) {
	settings, err := s.GetSystemSettings()
	if err != nil {
		return nil, err
	}

	maskedToken := ""
	if settings.MercadoPago.AccessToken != "" {
		t := settings.MercadoPago.AccessToken
		if len(t) > 10 {
			maskedToken = t[:6] + "..." + t[len(t)-4:]
		} else {
			maskedToken = "***"
		}
	}

	maskedSecret := ""
	if settings.MercadoPago.WebhookSecret != "" {
		maskedSecret = "••••••••••••••••"
	}

	res := &models.SystemSettingsResponse{
		OperationMode:  settings.OperationMode,
		SetupCompleted: settings.SetupCompleted,
		CompanyName:    settings.CompanyName,
		CompanyCNPJ:    settings.CompanyCNPJ,
		CompanyPhone:   settings.CompanyPhone,
		CompanyEmail:   settings.CompanyEmail,
		UpdatedAt:      settings.UpdatedAt,
	}
	res.MercadoPago.PublicKey = settings.MercadoPago.PublicKey
	res.MercadoPago.MaskedToken = maskedToken
	res.MercadoPago.WebhookSecret = maskedSecret
	res.MercadoPago.Sandbox = settings.MercadoPago.Sandbox
	res.MercadoPago.Configured = settings.MercadoPago.AccessToken != ""

	return res, nil
}

func (s *NativeBillingService) TestMercadoPago(ctx context.Context, token string) (bool, string, error) {
	t := strings.TrimSpace(token)
	if t == "" {
		// Se não foi fornecido token no teste, busca o token atualmente salvo no banco
		settings, err := s.GetSystemSettings()
		if err != nil || settings.MercadoPago.AccessToken == "" {
			return false, "", errors.New("nenhum token do Mercado Pago informado ou configurado")
		}
		t = settings.MercadoPago.AccessToken
	}
	return s.mpService.TestCredentials(ctx, t)
}

// ============================================================================
// NATIVE PLANS (PRODUTOS / SERVIÇOS)
// ============================================================================

func (s *NativeBillingService) ListPlans() ([]models.NativePlan, error) {
	return s.db.ListNativePlans()
}

func (s *NativeBillingService) GetPlan(id string) (*models.NativePlan, error) {
	return s.db.GetNativePlan(id)
}

func (s *NativeBillingService) CreatePlan(p *models.NativePlan) (*models.NativePlan, error) {
	if strings.TrimSpace(p.Name) == "" {
		return nil, errors.New("nome do plano é obrigatório")
	}
	if err := ValidateAmount(p.Price); err != nil {
		return nil, err
	}
	if p.BillingCycle == "" {
		p.BillingCycle = "mensal"
	}
	p.ID = "plan-" + uuid.New().String()[:8]
	p.Active = true
	p.Name = SanitizeString(p.Name)
	p.Description = SanitizeString(p.Description)

	if err := s.db.CreateNativePlan(p); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *NativeBillingService) UpdatePlan(id string, p *models.NativePlan) (*models.NativePlan, error) {
	if strings.TrimSpace(p.Name) == "" {
		return nil, errors.New("nome do plano é obrigatório")
	}
	if err := ValidateAmount(p.Price); err != nil {
		return nil, err
	}
	p.ID = id
	p.Name = SanitizeString(p.Name)
	p.Description = SanitizeString(p.Description)

	if err := s.db.UpdateNativePlan(p); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *NativeBillingService) DeletePlan(id string) error {
	return s.db.DeleteNativePlan(id)
}

// ============================================================================
// NATIVE CUSTOMERS
// ============================================================================

func (s *NativeBillingService) ListCustomers(search, status, planId string) ([]models.NativeCustomer, error) {
	return s.db.ListNativeCustomers(search, status, planId)
}

func (s *NativeBillingService) GetCustomer(id string) (*models.NativeCustomer, error) {
	return s.db.GetNativeCustomer(id)
}

func (s *NativeBillingService) GetCustomerByCPF(cpf string) (*models.NativeCustomer, error) {
	clean := CleanNumberDoc(cpf)
	if clean == "" {
		return nil, errors.New("documento não informado")
	}
	return s.db.GetNativeCustomerByCPF(clean)
}

func (s *NativeBillingService) CreateCustomer(req models.CreateCustomerRequest) (*models.NativeCustomer, error) {
	// Validação de segurança estrita de CPF/CNPJ (Regra 1)
	if err := ValidateCPFOrCNPJ(req.CPFCnpj); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Name) == "" {
		return nil, errors.New("nome do cliente é obrigatório")
	}
	if req.Email != "" {
		if err := ValidateEmail(req.Email); err != nil {
			return nil, err
		}
	}
	if req.Phone != "" {
		if err := ValidatePhone(req.Phone); err != nil {
			return nil, err
		}
	}

	cleanDoc := CleanNumberDoc(req.CPFCnpj)
	// Checa se cliente com mesmo CPF já existe
	existing, _ := s.db.GetNativeCustomerByCPF(cleanDoc)
	if existing != nil {
		return nil, fmt.Errorf("já existe um cliente cadastrado com o CPF/CNPJ %s (%s)", cleanDoc, existing.Name)
	}

	dueDay := req.DueDay
	if dueDay < 1 || dueDay > 31 {
		dueDay = 10
	}

	monthlyPrice := req.MonthlyPrice
	planName := ""
	if req.PlanID != "" {
		if plan, err := s.db.GetNativePlan(req.PlanID); err == nil && plan != nil {
			planName = plan.Name
			if monthlyPrice <= 0 {
				monthlyPrice = plan.Price
			}
		}
	}

	c := &models.NativeCustomer{
		ID:           "cust-" + uuid.New().String()[:8],
		Name:         SanitizeString(req.Name),
		CPFCnpj:      cleanDoc,
		Email:        strings.ToLower(strings.TrimSpace(req.Email)),
		Phone:        CleanNumberDoc(req.Phone),
		Address:      SanitizeString(req.Address),
		Number:       SanitizeString(req.Number),
		Complement:   SanitizeString(req.Complement),
		Neighborhood: SanitizeString(req.Neighborhood),
		City:         SanitizeString(req.City),
		State:        strings.ToUpper(strings.TrimSpace(req.State)),
		PostalCode:   CleanNumberDoc(req.PostalCode),
		PlanID:       req.PlanID,
		PlanName:     planName,
		MonthlyPrice: monthlyPrice,
		DueDay:       dueDay,
		Status:       models.CustomerStatusActive,
		Notes:        SanitizeString(req.Notes),
	}

	if err := s.db.CreateNativeCustomer(c); err != nil {
		return nil, err
	}
	return c, nil
}

func (s *NativeBillingService) UpdateCustomer(id string, req models.CreateCustomerRequest) (*models.NativeCustomer, error) {
	if err := ValidateCPFOrCNPJ(req.CPFCnpj); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Name) == "" {
		return nil, errors.New("nome do cliente é obrigatório")
	}

	current, err := s.db.GetNativeCustomer(id)
	if err != nil {
		return nil, errors.New("cliente não encontrado")
	}

	dueDay := req.DueDay
	if dueDay < 1 || dueDay > 31 {
		dueDay = current.DueDay
	}

	monthlyPrice := req.MonthlyPrice
	planName := current.PlanName
	if req.PlanID != "" && req.PlanID != current.PlanID {
		if plan, err := s.db.GetNativePlan(req.PlanID); err == nil && plan != nil {
			planName = plan.Name
			if monthlyPrice <= 0 {
				monthlyPrice = plan.Price
			}
		}
	}

	current.Name = SanitizeString(req.Name)
	current.CPFCnpj = CleanNumberDoc(req.CPFCnpj)
	current.Email = strings.ToLower(strings.TrimSpace(req.Email))
	current.Phone = CleanNumberDoc(req.Phone)
	current.Address = SanitizeString(req.Address)
	current.Number = SanitizeString(req.Number)
	current.Complement = SanitizeString(req.Complement)
	current.Neighborhood = SanitizeString(req.Neighborhood)
	current.City = SanitizeString(req.City)
	current.State = strings.ToUpper(strings.TrimSpace(req.State))
	current.PostalCode = CleanNumberDoc(req.PostalCode)
	current.PlanID = req.PlanID
	current.PlanName = planName
	current.MonthlyPrice = monthlyPrice
	current.DueDay = dueDay
	current.Notes = SanitizeString(req.Notes)

	if err := s.db.UpdateNativeCustomer(current); err != nil {
		return nil, err
	}
	return current, nil
}

func (s *NativeBillingService) DeleteCustomer(id string) error {
	return s.db.DeleteNativeCustomer(id)
}

// ============================================================================
// NATIVE INVOICES & MERCADO PAGO INTEGRATION
// ============================================================================

func (s *NativeBillingService) ListInvoices(customerID, cpf, status string) ([]models.NativeInvoice, error) {
	return s.db.ListNativeInvoices(customerID, cpf, status)
}

func (s *NativeBillingService) GetInvoice(id string) (*models.NativeInvoice, error) {
	return s.db.GetNativeInvoice(id)
}

func (s *NativeBillingService) CreateInvoice(req models.CreateInvoiceRequest) (*models.NativeInvoice, error) {
	customer, err := s.db.GetNativeCustomer(req.CustomerID)
	if err != nil || customer == nil {
		return nil, errors.New("cliente associado à fatura não foi encontrado")
	}
	if err := ValidateAmount(req.Amount); err != nil {
		return nil, err
	}

	dueDate := strings.TrimSpace(req.DueDate)
	if dueDate == "" {
		dueDate = time.Now().AddDate(0, 0, 5).Format("2006-01-02")
	}

	method := req.PaymentMethod
	if method == "" {
		method = "pix"
	}

	desc := req.Description
	if desc == "" {
		desc = fmt.Sprintf("Mensalidade %s - Ref %s", customer.PlanName, time.Now().Format("01/2006"))
	}

	inv := &models.NativeInvoice{
		ID:            "inv-" + uuid.New().String()[:8],
		CustomerID:    customer.ID,
		CustomerName:  customer.Name,
		CPFCnpj:       customer.CPFCnpj,
		Amount:        req.Amount,
		DueDate:       dueDate,
		Status:        models.InvoiceStatusPending,
		Description:   desc,
		PaymentMethod: method,
	}

	if err := s.db.CreateNativeInvoice(inv); err != nil {
		return nil, err
	}
	return inv, nil
}

// GeneratePixForInvoice gera o Pix dinâmico no Mercado Pago e armazena os códigos no banco
func (s *NativeBillingService) GeneratePixForInvoice(ctx context.Context, invoiceID string) (*models.NativeInvoice, error) {
	inv, err := s.db.GetNativeInvoice(invoiceID)
	if err != nil || inv == nil {
		return nil, errors.New("fatura não encontrada")
	}

	if inv.Status == models.InvoiceStatusPaid {
		return inv, nil
	}

	// Se já possui QR Code gerado, retorna o cache existente
	if inv.PixQRCode != "" && inv.PixQRCodeBase64 != "" {
		return inv, nil
	}

	settings, err := s.GetSystemSettings()
	if err != nil || settings.MercadoPago.AccessToken == "" {
		return nil, errors.New("Mercado Pago não configurado. Acesse Configurações para preencher o Access Token")
	}

	customer, err := s.db.GetNativeCustomer(inv.CustomerID)
	if err != nil || customer == nil {
		return nil, errors.New("cliente da fatura não encontrado")
	}

	mpRes, err := s.mpService.CreatePixPayment(ctx, settings.MercadoPago.AccessToken, customer, inv.Amount, inv.Description)
	if err != nil {
		return nil, fmt.Errorf("falha ao emitir Pix no Mercado Pago: %w", err)
	}

	inv.MPPaymentID = strconv.FormatInt(mpRes.ID, 10)
	inv.PixQRCode = mpRes.PointOfInteraction.TransactionData.QRCode
	inv.PixQRCodeBase64 = mpRes.PointOfInteraction.TransactionData.QRCodeBase64
	inv.PaymentMethod = "pix"

	if err := s.db.UpdateNativeInvoice(inv); err != nil {
		log.Printf("[INVOICE UPDATE ERROR] %v", err)
	}

	return inv, nil
}

// GenerateBoletoForInvoice gera o boleto oficial no Mercado Pago com link em PDF e código de barras
func (s *NativeBillingService) GenerateBoletoForInvoice(ctx context.Context, invoiceID string) (*models.NativeInvoice, error) {
	inv, err := s.db.GetNativeInvoice(invoiceID)
	if err != nil || inv == nil {
		return nil, errors.New("fatura não encontrada")
	}

	if inv.Status == models.InvoiceStatusPaid {
		return inv, nil
	}

	if inv.BoletoURL != "" {
		return inv, nil
	}

	settings, err := s.GetSystemSettings()
	if err != nil || settings.MercadoPago.AccessToken == "" {
		return nil, errors.New("Mercado Pago não configurado")
	}

	customer, err := s.db.GetNativeCustomer(inv.CustomerID)
	if err != nil || customer == nil {
		return nil, errors.New("cliente da fatura não encontrado")
	}

	mpRes, err := s.mpService.CreateBoletoPayment(ctx, settings.MercadoPago.AccessToken, customer, inv.Amount, inv.DueDate, inv.Description)
	if err != nil {
		return nil, fmt.Errorf("falha ao emitir Boleto no Mercado Pago: %w", err)
	}

	inv.MPPaymentID = strconv.FormatInt(mpRes.ID, 10)
	inv.BoletoURL = mpRes.TransactionDetails.ExternalResourceURL
	inv.BoletoBarcode = mpRes.Barcode.Content
	inv.PaymentMethod = "boleto"

	if err := s.db.UpdateNativeInvoice(inv); err != nil {
		log.Printf("[INVOICE UPDATE ERROR] %v", err)
	}

	return inv, nil
}

// MarkInvoiceAsPaidManual registra a baixa de pagamento realizada manualmente pelo operador
func (s *NativeBillingService) MarkInvoiceAsPaidManual(invoiceID string) (*models.NativeInvoice, error) {
	inv, err := s.db.GetNativeInvoice(invoiceID)
	if err != nil || inv == nil {
		return nil, errors.New("fatura não encontrada")
	}
	now := time.Now().UTC()
	if err := s.db.MarkInvoiceAsPaid(invoiceID, "manual-"+uuid.New().String()[:8], now); err != nil {
		return nil, err
	}
	inv.Status = models.InvoiceStatusPaid
	inv.PaidAt = &now
	return inv, nil
}

// ProcessMercadoPagoWebhook processa notificação de pagamento recebida do Mercado Pago
func (s *NativeBillingService) ProcessMercadoPagoWebhook(ctx context.Context, dataID string) error {
	cleanID := strings.TrimSpace(dataID)
	if cleanID == "" {
		return errors.New("payment id vazio")
	}

	settings, err := s.GetSystemSettings()
	if err != nil || settings.MercadoPago.AccessToken == "" {
		return errors.New("Mercado Pago não configurado")
	}

	// Consulta o pagamento na API oficial do Mercado Pago para verificação segura (Zero-Trust)
	statusRes, err := s.mpService.GetPaymentStatus(ctx, settings.MercadoPago.AccessToken, cleanID)
	if err != nil {
		return fmt.Errorf("falha ao verificar pagamento no Mercado Pago: %w", err)
	}

	if statusRes.Status == "approved" {
		inv, err := s.db.GetNativeInvoiceByMPPaymentID(cleanID)
		if err != nil || inv == nil {
			log.Printf("[MERCADO PAGO WEBHOOK] Pagamento %s aprovado, mas nenhuma fatura interna correspondente localizada.", cleanID)
			return nil
		}

		if inv.Status != models.InvoiceStatusPaid {
			now := time.Now().UTC()
			if err := s.db.MarkInvoiceAsPaid(inv.ID, cleanID, now); err != nil {
				return err
			}
			log.Printf("💰 [MERCADO PAGO WEBHOOK] Fatura %s (Cliente: %s) confirmada como PAGA via Pix/Boleto MP!", inv.ID, inv.CustomerName)
		}
	}

	return nil
}

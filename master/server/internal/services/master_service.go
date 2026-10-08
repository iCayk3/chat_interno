package services

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"master-license-server/internal/database"
	"master-license-server/internal/models"
)

type MasterService struct {
	store               *database.Store
	masterSecret        string
	supportContactPhone string
	supportContactEmail string
}

func NewMasterService(store *database.Store, secret, supportPhone, supportEmail string) *MasterService {
	if secret == "" {
		secret = "master-secret-signing-key-sol-telecom-2026"
	}
	if supportPhone == "" {
		supportPhone = "(11) 98765-4321"
	}
	if supportEmail == "" {
		supportEmail = "suporte@soltelecom.com.br"
	}
	return &MasterService{
		store:               store,
		masterSecret:        secret,
		supportContactPhone: supportPhone,
		supportContactEmail: supportEmail,
	}
}

// GenerateSignature assina digitalmente a resposta para validação criptográfica inviolável
func (s *MasterService) GenerateSignature(key, status, expiresAt string) string {
	mac := hmac.New(sha256.New, []byte(s.masterSecret))
	data := fmt.Sprintf("%s:%s:%s", key, status, expiresAt)
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

// GenerateLicenseKey gera uma chave de licença formatada
func (s *MasterService) GenerateLicenseKey(prefix string) string {
	raw := strings.ToUpper(strings.ReplaceAll(uuid.New().String(), "-", ""))
	if prefix == "" {
		prefix = "PRO"
	}
	return fmt.Sprintf("%s-%s-%s-%s", prefix, raw[:4], raw[4:8], raw[8:12])
}

// ProcessHeartbeat processa o ping do cliente, atualiza métricas e responde o status
func (s *MasterService) ProcessHeartbeat(req models.LicenseHeartbeatRequest) (*models.LicenseHeartbeatResponse, error) {
	tenant, err := s.store.GetTenantByKey(req.LicenseKey)
	if err != nil {
		// Se não encontrou a chave, retorna status suspenso com motivo
		return &models.LicenseHeartbeatResponse{
			Status:              models.StatusSuspended,
			LicenseType:         models.LicenseTrial,
			TrialDaysRemaining:  0,
			SuspensionReason:    "Chave de licença não reconhecida pelo Servidor Central Mestre.",
			ContactSupportPhone: s.supportContactPhone,
			ContactSupportEmail: s.supportContactEmail,
			Signature:           s.GenerateSignature(req.LicenseKey, string(models.StatusSuspended), ""),
		}, nil
	}

	now := time.Now().UTC()
	tenant.LastHeartbeatAt = now
	if req.ServerHost != "" {
		tenant.ServerHost = req.ServerHost
	}
	if req.ClientVersion != "" {
		tenant.ClientVersion = req.ClientVersion
	}
	if req.ActiveOperators > 0 {
		tenant.ActiveOperators = req.ActiveOperators
	}
	if tenant.TenantCNPJ == "" && req.TenantCNPJ != "" {
		tenant.TenantCNPJ = req.TenantCNPJ
	}
	if tenant.TenantName == "Empresa em Avaliação (Padrão)" && req.TenantName != "" {
		tenant.TenantName = req.TenantName
	}

	// Se estiver em modo Trial, calcula dias restantes
	if tenant.Status == models.StatusTrial || tenant.LicenseType == models.LicenseTrial {
		diff := tenant.ExpiresAt.Sub(now)
		days := int(diff.Hours() / 24)
		if days < 0 {
			days = 0
		}
		tenant.TrialDaysRemaining = days

		// Se o trial expirou e ultrapassou o período de carência (72h), suspende automaticamente
		if now.After(tenant.GracePeriodUntil) && tenant.Status != models.StatusSuspended && tenant.Status != models.StatusRevoked {
			tenant.Status = models.StatusSuspended
			if tenant.SuspensionReason == "" {
				tenant.SuspensionReason = "O período de testes gratuitos (Trial) de 30 dias expirou."
			}
		}
	}

	// Se o tenant estiver suspenso e não tiver PIX configurado manualmente, gera automaticamente com a chave do Master
	if tenant.Status == models.StatusSuspended && tenant.PaymentPix == "" {
		fin := s.store.GetFinanceSettings()
		if fin.MasterPixKey != "" && fin.AutoGeneratePix {
			amt := tenant.PaymentAmount
			if amt <= 0 {
				amt = fin.DefaultMonthlyPrice
			}
			tenant.PaymentPix = GeneratePixPayload(fin.MasterPixKey, fin.BeneficiaryName, fin.BeneficiaryCity, tenant.ID, amt)
			if tenant.PaymentAmount <= 0 {
				tenant.PaymentAmount = amt
			}
		}
	}

	_ = s.store.SaveTenant(tenant)

	sig := s.GenerateSignature(tenant.LicenseKey, string(tenant.Status), tenant.ExpiresAt.Format(time.RFC3339))

	allowedOpMode := tenant.AllowedOperationMode
	if allowedOpMode == "" {
		allowedOpMode = "hybrid"
	}

	return &models.LicenseHeartbeatResponse{
		LicenseKey:           tenant.LicenseKey,
		TenantName:           tenant.TenantName,
		Status:               tenant.Status,
		LicenseType:          tenant.LicenseType,
		TrialDaysRemaining:   tenant.TrialDaysRemaining,
		ExpiresAt:            tenant.ExpiresAt.Format(time.RFC3339),
		GracePeriodUntil:     tenant.GracePeriodUntil.Format(time.RFC3339),
		MaxOperators:         tenant.MaxOperators,
		AllowedModules:       tenant.AllowedModules,
		AllowedOperationMode: allowedOpMode,
		SuspensionReason:     tenant.SuspensionReason,
		PaymentPix:           tenant.PaymentPix,
		PaymentQRCodeBase64:  tenant.PaymentQRCodeBase64,
		PaymentAmount:        tenant.PaymentAmount,
		DiscountDescription:  tenant.DiscountDescription,
		DiscountAmount:       tenant.DiscountAmount,
		ContactSupportPhone:  s.supportContactPhone,
		ContactSupportEmail:  s.supportContactEmail,
		Signature:            sig,
	}, nil
}

// AutoRegisterTenant cadastra ou identifica automaticamente uma nova instalação do software cliente
func (s *MasterService) AutoRegisterTenant(req models.AutoRegisterTenantRequest) (*models.LicenseHeartbeatResponse, error) {
	now := time.Now().UTC()

	// 1. Verifica se já existe um tenant para este host, CNPJ ou fingerprint
	existing := s.store.GetTenantByHostOrCNPJ(req.ServerHost, req.TenantCNPJ, req.MachineFingerprint)
	if existing != nil {
		existing.LastHeartbeatAt = now
		if req.ServerHost != "" {
			existing.ServerHost = req.ServerHost
		}
		if req.SoftwareVersion != "" {
			existing.ClientVersion = req.SoftwareVersion
		}
		if req.TenantName != "" && (existing.TenantName == "" || strings.HasPrefix(existing.TenantName, "Nova Instalação") || strings.HasPrefix(existing.TenantName, "Instalação ")) {
			existing.TenantName = req.TenantName
		}
		if req.TenantCNPJ != "" && existing.TenantCNPJ == "" {
			existing.TenantCNPJ = req.TenantCNPJ
		}
		_ = s.store.SaveTenant(existing)

		sig := s.GenerateSignature(existing.LicenseKey, string(existing.Status), existing.ExpiresAt.Format(time.RFC3339))
		opMode := existing.AllowedOperationMode
		if opMode == "" {
			opMode = "erp"
		}

		log.Printf("🔄 [Master] Instalação reconectada: '%s' (%s) | Chave: %s | Host: %s", existing.TenantName, existing.TenantCNPJ, existing.LicenseKey, existing.ServerHost)
		return &models.LicenseHeartbeatResponse{
			LicenseKey:           existing.LicenseKey,
			TenantName:           existing.TenantName,
			Status:               existing.Status,
			LicenseType:          existing.LicenseType,
			TrialDaysRemaining:   existing.TrialDaysRemaining,
			ExpiresAt:            existing.ExpiresAt.Format(time.RFC3339),
			GracePeriodUntil:     existing.GracePeriodUntil.Format(time.RFC3339),
			MaxOperators:         existing.MaxOperators,
			AllowedModules:       existing.AllowedModules,
			AllowedOperationMode: opMode,
			SuspensionReason:     existing.SuspensionReason,
			PaymentPix:           existing.PaymentPix,
			PaymentQRCodeBase64:  existing.PaymentQRCodeBase64,
			PaymentAmount:        existing.PaymentAmount,
			DiscountDescription:  existing.DiscountDescription,
			DiscountAmount:       existing.DiscountAmount,
			ContactSupportPhone:  s.supportContactPhone,
			ContactSupportEmail:  s.supportContactEmail,
			Signature:            sig,
		}, nil
	}

	// 2. Se for uma nova instalação, registra o novo Tenant automaticamente no Master!
	tenantID := "tenant-" + uuid.New().String()[:8]
	licenseKey := s.GenerateLicenseKey("LIC")

	name := strings.TrimSpace(req.TenantName)
	if name == "" {
		if req.ServerHost != "" {
			name = "Instalação " + req.ServerHost
		} else {
			name = "Nova Instalação " + tenantID
		}
	}

	opMode := strings.TrimSpace(req.OperationMode)
	if opMode == "" {
		opMode = "erp"
	}

	fin := s.store.GetFinanceSettings()
	monthlyPrice := fin.DefaultMonthlyPrice
	if monthlyPrice <= 0 {
		monthlyPrice = 299.90
	}

	notes := fmt.Sprintf("Auto-registrado via instalação. fingerprint:%s", strings.TrimSpace(req.MachineFingerprint))

	newTenant := &models.Tenant{
		ID:                   tenantID,
		LicenseKey:           licenseKey,
		TenantCNPJ:           strings.TrimSpace(req.TenantCNPJ),
		TenantName:           name,
		ContactPerson:        "Administrador do Servidor",
		ContactEmail:         "",
		ContactPhone:         "",
		LicenseType:          models.LicenseTrial,
		Status:               models.StatusTrial,
		TrialDaysRemaining:   30,
		TrialStartedAt:       now,
		ExpiresAt:            now.Add(30 * 24 * time.Hour),
		GracePeriodUntil:     now.Add(33 * 24 * time.Hour),
		LastHeartbeatAt:      now,
		ServerHost:           strings.TrimRight(strings.TrimSpace(req.ServerHost), "/"),
		ClientVersion:        req.SoftwareVersion,
		ActiveOperators:      0,
		MaxOperators:         0, // Ilimitado
		AllowedModules:       "erp,native,omnichannel,reports,network,campaigns",
		AllowedOperationMode: opMode,
		PaymentAmount:        monthlyPrice,
		Notes:                notes,
		CreatedAt:            now,
		UpdatedAt:            now,
	}

	if err := s.store.SaveTenant(newTenant); err != nil {
		return nil, fmt.Errorf("falha ao salvar nova instalação no master: %w", err)
	}

	log.Printf("🎉 [Master] NOVA MÁQUINA/CLIENTE REGISTRADO COM SUCESSO! Empresa: '%s' | Chave: '%s' | Host: '%s'", newTenant.TenantName, newTenant.LicenseKey, newTenant.ServerHost)

	sig := s.GenerateSignature(newTenant.LicenseKey, string(newTenant.Status), newTenant.ExpiresAt.Format(time.RFC3339))
	return &models.LicenseHeartbeatResponse{
		LicenseKey:           newTenant.LicenseKey,
		TenantName:           newTenant.TenantName,
		Status:               newTenant.Status,
		LicenseType:          newTenant.LicenseType,
		TrialDaysRemaining:   newTenant.TrialDaysRemaining,
		ExpiresAt:            newTenant.ExpiresAt.Format(time.RFC3339),
		GracePeriodUntil:     newTenant.GracePeriodUntil.Format(time.RFC3339),
		MaxOperators:         newTenant.MaxOperators,
		AllowedModules:       newTenant.AllowedModules,
		AllowedOperationMode: newTenant.AllowedOperationMode,
		PaymentAmount:        newTenant.PaymentAmount,
		ContactSupportPhone:  s.supportContactPhone,
		ContactSupportEmail:  s.supportContactEmail,
		Signature:            sig,
	}, nil
}

// ProcessActivation ativa uma chave no cliente
func (s *MasterService) ProcessActivation(req models.LicenseHeartbeatRequest) (*models.LicenseHeartbeatResponse, error) {
	tenant, err := s.store.GetTenantByKey(req.LicenseKey)
	if err != nil {
		return nil, fmt.Errorf("chave de licença '%s' inexistente no Servidor Central", req.LicenseKey)
	}

	if tenant.Status == models.StatusRevoked {
		return nil, fmt.Errorf("esta chave de licença foi revogada pelo administrador")
	}

	now := time.Now().UTC()
	tenant.LastHeartbeatAt = now
	if req.ServerHost != "" {
		tenant.ServerHost = req.ServerHost
	}
	if req.TenantCNPJ != "" {
		tenant.TenantCNPJ = req.TenantCNPJ
	}
	if req.TenantName != "" {
		tenant.TenantName = req.TenantName
	}

	// Se a chave for comercial ou cortesia e estava suspensa, reativa
	if (tenant.LicenseType == models.LicensePaid || tenant.LicenseType == models.LicenseCortesia) && tenant.Status == models.StatusSuspended {
		tenant.Status = models.StatusActive
		tenant.SuspensionReason = ""
	}

	_ = s.store.SaveTenant(tenant)

	sig := s.GenerateSignature(tenant.LicenseKey, string(tenant.Status), tenant.ExpiresAt.Format(time.RFC3339))

	allowedOpMode := tenant.AllowedOperationMode
	if allowedOpMode == "" {
		allowedOpMode = "hybrid"
	}

	return &models.LicenseHeartbeatResponse{
		Status:               tenant.Status,
		LicenseType:          tenant.LicenseType,
		TrialDaysRemaining:   tenant.TrialDaysRemaining,
		ExpiresAt:            tenant.ExpiresAt.Format(time.RFC3339),
		GracePeriodUntil:     tenant.GracePeriodUntil.Format(time.RFC3339),
		MaxOperators:         tenant.MaxOperators,
		AllowedModules:       tenant.AllowedModules,
		AllowedOperationMode: allowedOpMode,
		SuspensionReason:     tenant.SuspensionReason,
		PaymentPix:           tenant.PaymentPix,
		PaymentQRCodeBase64:  tenant.PaymentQRCodeBase64,
		PaymentAmount:        tenant.PaymentAmount,
		DiscountDescription:  tenant.DiscountDescription,
		DiscountAmount:       tenant.DiscountAmount,
		ContactSupportPhone:  s.supportContactPhone,
		ContactSupportEmail:  s.supportContactEmail,
		Signature:            sig,
	}, nil
}

// CreateTenant cadastra um novo cliente e gera sua chave de licença
func (s *MasterService) CreateTenant(req models.CreateTenantRequest) (*models.Tenant, error) {
	now := time.Now().UTC()
	trialDays := req.TrialDays
	if trialDays <= 0 {
		trialDays = 30
	}

	prefix := "PRO"
	status := models.StatusActive
	if req.LicenseType == models.LicenseTrial {
		prefix = "TRIAL"
		status = models.StatusTrial
	} else if req.LicenseType == models.LicenseCortesia {
		prefix = "CORTESIA"
		status = models.StatusActive
	}

	key := s.GenerateLicenseKey(prefix)
	expiresAt := now.Add(time.Duration(trialDays) * 24 * time.Hour)
	if req.LicenseType == models.LicensePaid {
		expiresAt = now.Add(365 * 24 * time.Hour) // 1 ano por padrão
	}

	allowedOpMode := strings.ToLower(strings.TrimSpace(req.AllowedOperationMode))
	if allowedOpMode == "" {
		allowedOpMode = "hybrid"
	}

	tenant := &models.Tenant{
		ID:                   "tenant-" + uuid.New().String()[:8],
		LicenseKey:           key,
		TenantCNPJ:           req.TenantCNPJ,
		TenantName:           req.TenantName,
		ContactPerson:        req.ContactPerson,
		ContactEmail:         req.ContactEmail,
		ContactPhone:         req.ContactPhone,
		LicenseType:          req.LicenseType,
		Status:               status,
		TrialDaysRemaining:   trialDays,
		TrialStartedAt:       now,
		ExpiresAt:            expiresAt,
		GracePeriodUntil:     expiresAt.Add(72 * time.Hour),
		MaxOperators:         req.MaxOperators,
		AllowedModules:       req.AllowedModules,
		AllowedOperationMode: allowedOpMode,
		PaymentAmount:        req.MonthlyPrice,
		DiscountDescription:  req.DiscountDescription,
		DiscountAmount:       req.DiscountAmount,
		Notes:                req.Notes,
		CreatedAt:            now,
		UpdatedAt:            now,
	}

	if err := s.store.SaveTenant(tenant); err != nil {
		return nil, err
	}
	return tenant, nil
}

// UpdateOperationMode altera o modelo de operação liberado para a instalação (erp, native, hybrid)
func (s *MasterService) UpdateOperationMode(id string, mode string) (*models.Tenant, error) {
	tenant, err := s.store.GetTenantByID(id)
	if err != nil {
		return nil, err
	}
	cleanMode := strings.ToLower(strings.TrimSpace(mode))
	if cleanMode != "erp" && cleanMode != "native" && cleanMode != "hybrid" {
		cleanMode = "hybrid"
	}
	tenant.AllowedOperationMode = cleanMode
	if err := s.store.SaveTenant(tenant); err != nil {
		return nil, err
	}
	s.notifyTenantServer(tenant)
	return tenant, nil
}

// UpdateTenantStatus altera instantaneamente o status do cliente (Ativar / Suspender / Revogar)
func (s *MasterService) UpdateTenantStatus(id string, req models.UpdateTenantStatusRequest) (*models.Tenant, error) {
	tenant, err := s.store.GetTenantByID(id)
	if err != nil {
		return nil, err
	}

	tenant.Status = req.Status
	tenant.SuspensionReason = req.SuspensionReason
	if req.Status == models.StatusActive {
		tenant.SuspensionReason = ""
	}

	if err := s.store.SaveTenant(tenant); err != nil {
		return nil, err
	}
	s.notifyTenantServer(tenant)
	return tenant, nil
}

// ExtendTrial adiciona dias ao período de avaliação gratuita (+15, +30, etc.)
func (s *MasterService) ExtendTrial(id string, daysToAdd int) (*models.Tenant, error) {
	tenant, err := s.store.GetTenantByID(id)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	if tenant.ExpiresAt.Before(now) {
		tenant.ExpiresAt = now.Add(time.Duration(daysToAdd) * 24 * time.Hour)
	} else {
		tenant.ExpiresAt = tenant.ExpiresAt.Add(time.Duration(daysToAdd) * 24 * time.Hour)
	}

	tenant.GracePeriodUntil = tenant.ExpiresAt.Add(72 * time.Hour)
	tenant.TrialDaysRemaining += daysToAdd
	if tenant.Status == models.StatusSuspended {
		tenant.Status = models.StatusTrial
		tenant.SuspensionReason = ""
	}

	if err := s.store.SaveTenant(tenant); err != nil {
		return nil, err
	}
	s.notifyTenantServer(tenant)
	return tenant, nil
}

// notifyTenantServer envia ping de notificação instantânea para o servidor cliente atualizar o status
func (s *MasterService) notifyTenantServer(tenant *models.Tenant) {
	if tenant == nil {
		return
	}
	go func() {
		hosts := make([]string, 0, 2)
		if tenant.ServerHost != "" {
			hosts = append(hosts, tenant.ServerHost)
		}
		// Fallback para localhost em desenvolvimento/teste local
		hosts = append(hosts, "http://localhost:8080")

		client := &http.Client{Timeout: 2 * time.Second}
		for _, host := range hosts {
			u := strings.TrimRight(host, "/") + "/api/system/license/refresh"
			if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
				u = "http://" + u
			}
			req, err := http.NewRequest("POST", u, nil)
			if err != nil {
				continue
			}
			resp, err := client.Do(req)
			if err == nil {
				resp.Body.Close()
				log.Printf("⚡ [Master] Ping de sincronização instantânea enviado para %s", u)
				return
			}
		}
	}()
}

// UpdateDiscount aplica desconto promocional no cliente
func (s *MasterService) UpdateDiscount(id string, req models.UpdateDiscountRequest) (*models.Tenant, error) {
	tenant, err := s.store.GetTenantByID(id)
	if err != nil {
		return nil, err
	}

	tenant.DiscountDescription = req.DiscountDescription
	tenant.DiscountAmount = req.DiscountAmount
	if req.PaymentAmount > 0 {
		tenant.PaymentAmount = req.PaymentAmount
	}

	if err := s.store.SaveTenant(tenant); err != nil {
		return nil, err
	}
	return tenant, nil
}

// UpdateBilling atualiza dados de PIX e valor para regularização
func (s *MasterService) UpdateBilling(id string, req models.UpdateBillingRequest) (*models.Tenant, error) {
	tenant, err := s.store.GetTenantByID(id)
	if err != nil {
		return nil, err
	}

	tenant.PaymentPix = req.PaymentPix
	tenant.PaymentQRCodeBase64 = req.PaymentQRCodeBase64
	if req.PaymentAmount > 0 {
		tenant.PaymentAmount = req.PaymentAmount
	}

	if err := s.store.SaveTenant(tenant); err != nil {
		return nil, err
	}
	return tenant, nil
}

// ListTenants retorna a listagem completa
func (s *MasterService) ListTenants() []*models.Tenant {
	return s.store.ListTenants()
}

// GetTenant busca por ID
func (s *MasterService) GetTenant(id string) (*models.Tenant, error) {
	return s.store.GetTenantByID(id)
}

// DeleteTenant remove um tenant
func (s *MasterService) DeleteTenant(id string) error {
	return s.store.DeleteTenant(id)
}

// GetStats consolida os números para o painel mestre
func (s *MasterService) GetStats() *models.MasterStatsResponse {
	tenants := s.store.ListTenants()
	stats := &models.MasterStatsResponse{
		TotalTenants: len(tenants),
	}

	for _, t := range tenants {
		switch t.Status {
		case models.StatusActive:
			stats.ActiveTenants++
		case models.StatusTrial:
			stats.TrialTenants++
		case models.StatusSuspended:
			stats.SuspendedTenants++
		}
		if t.LicenseType == models.LicenseCortesia {
			stats.CortesiaTenants++
		}
		if t.Status == models.StatusActive {
			stats.TotalMonthlyMRR += t.PaymentAmount
		}
		if t.Status == models.StatusSuspended && t.PaymentAmount > 0 {
			stats.PendingPayments++
		}
	}

	return stats
}

// GetFinanceSettings retorna as configurações de recebimento exclusivas do Proprietário
func (s *MasterService) GetFinanceSettings() models.MasterFinanceSettings {
	return s.store.GetFinanceSettings()
}

// UpdateFinanceSettings atualiza a chave PIX e credenciais de cobrança do Proprietário
func (s *MasterService) UpdateFinanceSettings(settings models.MasterFinanceSettings) error {
	return s.store.SaveFinanceSettings(settings)
}

// GetPlanOptions retorna os valores de assinatura mensal e anual para o tenant
func (s *MasterService) GetPlanOptions(licenseKey string) (*models.LicensePlanOptionsResponse, error) {
	fin := s.store.GetFinanceSettings()
	monthly := fin.DefaultMonthlyPrice
	if monthly <= 0 {
		monthly = 299.90
	}
	annual := fin.DefaultAnnualPrice
	if annual <= 0 {
		// Padrão anual: 10x mensal (2 meses grátis)
		annual = monthly * 10
	}

	var discountAmount float64
	var discountDesc string

	if licenseKey != "" {
		tenant, err := s.store.GetTenantByKey(licenseKey)
		if err == nil && tenant != nil {
			discountAmount = tenant.DiscountAmount
			discountDesc = tenant.DiscountDescription
		}
	}

	finalMonthly := monthly - discountAmount
	if finalMonthly < 0 {
		finalMonthly = 0
	}

	// Desconto no anual: proporcional (10x o valor com desconto)
	finalAnnual := annual - (discountAmount * 10)
	if finalAnnual < 0 {
		finalAnnual = 0
	}

	return &models.LicensePlanOptionsResponse{
		MonthlyPrice:        monthly,
		AnnualPrice:         annual,
		DiscountAmount:      discountAmount,
		DiscountDescription: discountDesc,
		FinalMonthlyPrice:   finalMonthly,
		FinalAnnualPrice:    finalAnnual,
	}, nil
}

// CreateCheckout gera a cobrança por PIX ou Mercado Pago para o período escolhido (mensal ou anual)
func (s *MasterService) CreateCheckout(req models.CreateCheckoutRequest) (*models.CreateCheckoutResponse, error) {
	tenant, err := s.store.GetTenantByKey(req.LicenseKey)
	if err != nil {
		// Se o tenant ainda não existe com essa chave, cria um tenant automaticamente
		newTenant, createErr := s.CreateTenant(models.CreateTenantRequest{
			TenantName:     req.TenantName,
			TenantCNPJ:     req.TenantCNPJ,
			LicenseType:    models.LicenseTrial,
			TrialDays:      30,
			MaxOperators:   0, // Atendentes ilimitados
			AllowedModules: "erp,native,omnichannel",
		})
		if createErr != nil {
			return nil, fmt.Errorf("não foi possível registrar instalação: %w", createErr)
		}
		newTenant.LicenseKey = req.LicenseKey
		_ = s.store.SaveTenant(newTenant)
		tenant = newTenant
	}

	fin := s.store.GetFinanceSettings()
	monthly := fin.DefaultMonthlyPrice
	if monthly <= 0 {
		monthly = 299.90
	}
	annual := fin.DefaultAnnualPrice
	if annual <= 0 {
		annual = monthly * 10
	}

	cycle := strings.ToLower(strings.TrimSpace(req.Cycle))
	if cycle != "annual" {
		cycle = "monthly"
	}

	var amount float64
	if cycle == "annual" {
		amount = annual - (tenant.DiscountAmount * 10)
	} else {
		amount = monthly - tenant.DiscountAmount
	}
	if amount < 0 {
		amount = 0
	}

	paymentMethod := strings.ToLower(strings.TrimSpace(req.PaymentMethod))
	if paymentMethod == "" {
		paymentMethod = "pix"
	}

	txid := fmt.Sprintf("SUB%s%d", tenant.ID, time.Now().Unix()%100000)
	if len(txid) > 25 {
		txid = txid[:25]
	}

	pixPayload := ""
	checkoutURL := ""
	paymentID := txid

	// 1. Gera PIX oficial com dados do Master
	if fin.MasterPixKey != "" {
		pixPayload = GeneratePixPayload(fin.MasterPixKey, fin.BeneficiaryName, fin.BeneficiaryCity, txid, amount)
	}

	// 2. Se o método for Mercado Pago e o Master tiver access token configurado
	if paymentMethod == "mercadopago" && fin.MercadoPagoAccessToken != "" {
		prefURL, mpID, err := s.createMercadoPagoPreference(fin.MercadoPagoAccessToken, tenant, cycle, amount)
		if err == nil && prefURL != "" {
			checkoutURL = prefURL
			paymentID = mpID
		}
	}

	// Atualiza dados pendentes no tenant
	tenant.PendingPlanCycle = cycle
	tenant.PendingPaymentID = paymentID
	tenant.PaymentPix = pixPayload
	tenant.PaymentAmount = amount
	tenant.PaymentCheckoutURL = checkoutURL
	_ = s.store.SaveTenant(tenant)

	return &models.CreateCheckoutResponse{
		Success:        true,
		LicenseKey:     tenant.LicenseKey,
		Cycle:          cycle,
		Amount:         amount,
		DiscountAmount: tenant.DiscountAmount,
		PaymentMethod:  paymentMethod,
		PaymentPix:     pixPayload,
		CheckoutURL:    checkoutURL,
		PaymentID:      paymentID,
		Status:         "pending",
		Message:        "Cobrança gerada com sucesso. O Master liberará automaticamente assim que o pagamento for detectado.",
	}, nil
}

// ConfirmPayment libera a instalação imediatamente ao confirmar o pagamento
func (s *MasterService) ConfirmPayment(req models.ConfirmPaymentRequest) (*models.Tenant, error) {
	tenant, err := s.store.GetTenantByKey(req.LicenseKey)
	if err != nil {
		return nil, fmt.Errorf("instalação com chave '%s' não localizada", req.LicenseKey)
	}

	cycle := req.Cycle
	if cycle == "" {
		cycle = tenant.PendingPlanCycle
	}
	if cycle == "" {
		cycle = "monthly"
	}

	now := time.Now().UTC()
	var newExpires time.Time

	// Se a data de expiração já for futura (renovação antecipada), soma a partir dela
	baseDate := now
	if tenant.ExpiresAt.After(now) {
		baseDate = tenant.ExpiresAt
	}

	if cycle == "annual" {
		newExpires = baseDate.AddDate(1, 0, 0) // +1 ano
	} else {
		newExpires = baseDate.AddDate(0, 1, 0) // +1 mês (30 dias)
	}

	tenant.Status = models.StatusActive
	tenant.LicenseType = models.LicensePaid
	tenant.ExpiresAt = newExpires
	tenant.GracePeriodUntil = newExpires.Add(72 * time.Hour)
	tenant.SuspensionReason = ""
	tenant.PaymentPix = ""
	tenant.PaymentCheckoutURL = ""
	tenant.PendingPaymentID = ""
	tenant.PendingPlanCycle = ""
	tenant.MaxOperators = 0 // Atendentes ilimitados!

	if err := s.store.SaveTenant(tenant); err != nil {
		return nil, err
	}

	return tenant, nil
}

// ProcessMercadoPagoWebhook processa a notificação do Mercado Pago e libera o cliente
func (s *MasterService) ProcessMercadoPagoWebhook(paymentID string) error {
	fin := s.store.GetFinanceSettings()
	if fin.MercadoPagoAccessToken == "" {
		return fmt.Errorf("Mercado Pago Access Token não configurado no Master")
	}

	url := fmt.Sprintf("https://api.mercadopago.com/v1/payments/%s", paymentID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+fin.MercadoPagoAccessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("erro consulta pagamento MP: status %d", resp.StatusCode)
	}

	var mpPayment struct {
		Status            string  `json:"status"`
		ExternalReference string  `json:"external_reference"`
		TransactionAmount float64 `json:"transaction_amount"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&mpPayment); err != nil {
		return err
	}

	if mpPayment.Status == "approved" && mpPayment.ExternalReference != "" {
		_, err := s.ConfirmPayment(models.ConfirmPaymentRequest{
			LicenseKey: mpPayment.ExternalReference,
			PaymentID:  paymentID,
		})
		return err
	}

	return nil
}

func (s *MasterService) createMercadoPagoPreference(token string, tenant *models.Tenant, cycle string, amount float64) (string, string, error) {
	cycleTitle := "Mensal"
	if cycle == "annual" {
		cycleTitle = "Anual"
	}
	title := fmt.Sprintf("Licença Software SOL Telecom — Plano %s", cycleTitle)

	payload := map[string]interface{}{
		"items": []map[string]interface{}{
			{
				"title":       title,
				"quantity":    1,
				"unit_price":  amount,
				"currency_id": "BRL",
			},
		},
		"external_reference":   tenant.LicenseKey,
		"statement_descriptor": "SOL TELECOM",
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequest("POST", "https://api.mercadopago.com/checkout/preferences", bytes.NewBuffer(body))
	if err != nil {
		return "", "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return "", "", fmt.Errorf("erro ao gerar preferência no Mercado Pago: HTTP %d", resp.StatusCode)
	}

	var result struct {
		ID        string `json:"id"`
		InitPoint string `json:"init_point"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", err
	}

	return result.InitPoint, result.ID, nil
}

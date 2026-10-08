package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"chat-interno-server/internal/database"
	"chat-interno-server/internal/models"
)

type LicenseService struct {
	db             *database.DB
	masterURL      string
	httpClient     *http.Client
	mu             sync.RWMutex
	cachedLicense  *models.SystemLicense
	OnLicenseChange func(lic *models.SystemLicense)
}

func NewLicenseService(db *database.DB) *LicenseService {
	masterURL := os.Getenv("MASTER_LICENSE_SERVER_URL")
	if strings.TrimSpace(masterURL) == "" {
		masterURL = "http://localhost:8090" // URL padrão do Super Sistema Master em desenvolvimento
	}
	masterURL = strings.TrimRight(masterURL, "/")

	s := &LicenseService{
		db:        db,
		masterURL: masterURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}

	// Carrega cache inicial da licença
	if db != nil {
		if lic, err := db.GetSystemLicense(); err == nil && lic != nil {
			s.cachedLicense = lic
		}
	}

	return s
}

// GetLicenseStatus devolve o estado atual da licença
func (s *LicenseService) GetLicenseStatus() (*models.SystemLicense, error) {
	s.mu.RLock()
	cached := s.cachedLicense
	s.mu.RUnlock()

	if cached != nil {
		// Se for trial, recalcula os dias restantes
		if cached.LicenseType == models.LicenseTypeTrial && cached.Status == models.LicenseStatusTrial {
			diff := time.Until(cached.ExpiresAt)
			days := int(diff.Hours() / 24)
			if days < 0 {
				days = 0
			}
			cached.TrialDaysRemaining = days
			if diff <= 0 {
				cached.Status = models.LicenseStatusSuspended
				cached.SuspensionReason = "Período de avaliação gratuita encerrado. Ative sua licença para continuar."
			}
		}
		return cached, nil
	}

	if s.db == nil {
		return &models.SystemLicense{
			Status:             models.LicenseStatusTrial,
			LicenseType:        models.LicenseTypeTrial,
			TrialDaysRemaining: 30,
			ExpiresAt:          time.Now().Add(30 * 24 * time.Hour),
		}, nil
	}

	lic, err := s.db.GetSystemLicense()
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.cachedLicense = lic
	s.mu.Unlock()

	return lic, nil
}

// IsLicenseActive verifica se a instância está autorizada a operar chamadas de atendimento
func (s *LicenseService) IsLicenseActive() bool {
	lic, err := s.GetLicenseStatus()
	if err != nil || lic == nil {
		return false
	}

	// Se a data de validade passou
	if time.Now().After(lic.ExpiresAt) {
		// Tolerância do período de carência (Grace Period)
		if time.Now().Before(lic.GracePeriodUntil) {
			return true
		}
		return false
	}

	return lic.Status == models.LicenseStatusActive || lic.Status == models.LicenseStatusTrial
}

// ActivateLicense envia a chave de ativação ao Super Sistema Master
func (s *LicenseService) ActivateLicense(ctx context.Context, licenseKey string) (*models.SystemLicense, error) {
	cleanKey := strings.TrimSpace(licenseKey)
	if cleanKey == "" {
		return nil, errors.New("a chave de licença é obrigatória")
	}

	// Busca informações da empresa local para vincular no Master
	companyCNPJ := ""
	companyName := ""
	if s.db != nil {
		if settings, err := s.db.GetSystemSettings(); err == nil && settings != nil {
			companyCNPJ = settings.CompanyCNPJ
			companyName = settings.CompanyName
		}
	}

	payload := map[string]interface{}{
		"licenseKey":      cleanKey,
		"tenantCnpj":      companyCNPJ,
		"tenantName":      companyName,
		"softwareVersion": "1.0.0-PROD",
	}

	jsonBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", s.masterURL+"/api/v1/licenses/activate", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("não foi possível conectar ao Servidor Mestre de Licenças (%s): %w", s.masterURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errResp struct {
			Message string `json:"message"`
			Error   string `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		msg := errResp.Message
		if msg == "" {
			msg = errResp.Error
		}
		if msg == "" {
			msg = fmt.Sprintf("servidor mestre rejeitou a chave com status %d", resp.StatusCode)
		}
		return nil, errors.New(msg)
	}

	var res models.LicenseHeartbeatResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, fmt.Errorf("resposta inválida do Servidor Mestre: %w", err)
	}

	expiresAt, _ := time.Parse(time.RFC3339, res.ExpiresAt)
	if expiresAt.IsZero() {
		expiresAt = time.Now().Add(30 * 24 * time.Hour)
	}

	graceHours := res.GracePeriodHours
	if graceHours <= 0 {
		graceHours = 72
	}
	graceUntil := expiresAt.Add(time.Duration(graceHours) * time.Hour)

	updatedLic := &models.SystemLicense{
		LicenseKey:          cleanKey,
		TenantCNPJ:          companyCNPJ,
		TenantName:          res.TenantName,
		LicenseType:         res.LicenseType,
		Status:              res.Status,
		ExpiresAt:           expiresAt,
		GracePeriodUntil:    graceUntil,
		LastHeartbeatAt:     time.Now().UTC(),
		MaxOperators:         res.MaxOperators,
		AllowedModules:       res.AllowedModules,
		AllowedOperationMode: res.AllowedOperationMode,
		SuspensionReason:     res.SuspensionReason,
		PaymentPix:          res.PaymentPix,
		PaymentQRCodeBase64: res.PaymentQRCodeBase64,
		PaymentAmount:       res.PaymentAmount,
		DiscountDescription: res.DiscountDescription,
		DiscountAmount:      res.DiscountAmount,
		ContactSupportPhone: res.ContactSupportPhone,
		ContactSupportEmail: res.ContactSupportEmail,
		Signature:           res.Signature,
		UpdatedAt:           time.Now().UTC(),
	}

	if updatedLic.LicenseType == models.LicenseTypeTrial {
		diff := time.Until(updatedLic.ExpiresAt)
		days := int(diff.Hours() / 24)
		if days < 0 {
			days = 0
		}
		updatedLic.TrialDaysRemaining = days
	}

	if s.db != nil {
		_ = s.db.SaveSystemLicense(updatedLic)
	}

	s.mu.Lock()
	s.cachedLicense = updatedLic
	s.mu.Unlock()

	log.Printf("🔑 [Licenciamento] Licença '%s' ativada com sucesso! Status: %s | Expira em: %s", cleanKey, updatedLic.Status, updatedLic.ExpiresAt.Format("02/01/2006"))
	return updatedLic, nil
}

// getMachineFingerprint identifica de forma única este servidor/máquina
func (s *LicenseService) getMachineFingerprint() string {
	if data, err := os.ReadFile("/etc/machine-id"); err == nil {
		trimmed := strings.TrimSpace(string(data))
		if trimmed != "" {
			return "linux-" + trimmed
		}
	}
	if host, err := os.Hostname(); err == nil && host != "" {
		return "host-" + host
	}
	return "srv-node-main"
}

// AutoRegisterWithMaster registra esta instalação automaticamente no Super Sistema Master
func (s *LicenseService) AutoRegisterWithMaster(ctx context.Context) (*models.SystemLicense, error) {
	tenantName := os.Getenv("TENANT_NAME")
	tenantCnpj := os.Getenv("TENANT_CNPJ")
	serverHost := os.Getenv("SERVER_PUBLIC_URL")
	opMode := "erp"

	if s.db != nil {
		if settings, err := s.db.GetSystemSettings(); err == nil && settings != nil {
			if tenantName == "" && settings.CompanyName != "" {
				tenantName = settings.CompanyName
			}
			if tenantCnpj == "" && settings.CompanyCNPJ != "" {
				tenantCnpj = settings.CompanyCNPJ
			}
			if settings.OperationMode != "" {
				opMode = string(settings.OperationMode)
			}
		}
	}

	if tenantName == "" {
		if host, err := os.Hostname(); err == nil && host != "" {
			tenantName = "Instalação " + host
		} else {
			tenantName = "Nova Instalação"
		}
	}

	payload := models.AutoRegisterTenantRequest{
		TenantName:         tenantName,
		TenantCNPJ:         tenantCnpj,
		ServerHost:         serverHost,
		MachineFingerprint: s.getMachineFingerprint(),
		SoftwareVersion:    "1.0.0-PROD",
		OperationMode:      opMode,
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", s.masterURL+"/api/v1/licenses/auto-register", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Printf("⚠️ [Licenciamento] Não foi possível contatar o Master (%s) para auto-registro: %v", s.masterURL, err)
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errResp map[string]string
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		return nil, fmt.Errorf("master recusou auto-registro com código %d: %s", resp.StatusCode, errResp["error"])
	}

	var res models.LicenseHeartbeatResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, fmt.Errorf("resposta inválida do master: %w", err)
	}

	expiresAt, _ := time.Parse(time.RFC3339, res.ExpiresAt)
	if expiresAt.IsZero() {
		expiresAt = time.Now().Add(30 * 24 * time.Hour)
	}

	graceUntil := expiresAt.Add(72 * time.Hour)

	now := time.Now().UTC()
	diff := expiresAt.Sub(now)
	trialDays := int(diff.Hours() / 24)
	if trialDays < 0 {
		trialDays = 0
	}

	allowedMode := res.AllowedOperationMode
	if allowedMode == "" {
		allowedMode = opMode
	}

	newLic := &models.SystemLicense{
		LicenseKey:           res.LicenseKey,
		TenantCNPJ:           tenantCnpj,
		TenantName:           res.TenantName,
		LicenseType:          res.LicenseType,
		Status:               res.Status,
		TrialDaysRemaining:   trialDays,
		ExpiresAt:            expiresAt,
		GracePeriodUntil:     graceUntil,
		LastHeartbeatAt:      now,
		MaxOperators:         res.MaxOperators,
		AllowedModules:       res.AllowedModules,
		AllowedOperationMode: allowedMode,
		SuspensionReason:     res.SuspensionReason,
		PaymentPix:           res.PaymentPix,
		PaymentQRCodeBase64:  res.PaymentQRCodeBase64,
		PaymentAmount:        res.PaymentAmount,
		DiscountDescription:  res.DiscountDescription,
		DiscountAmount:       res.DiscountAmount,
		ContactSupportPhone:  res.ContactSupportPhone,
		ContactSupportEmail:  res.ContactSupportEmail,
		Signature:            res.Signature,
		UpdatedAt:            now,
	}

	if s.db != nil {
		_ = s.db.SaveSystemLicense(newLic)

		// Alinha modo de operação com o master
		if newLic.AllowedOperationMode == "erp" || newLic.AllowedOperationMode == "native" {
			if sysSettings, err := s.db.GetSystemSettings(); err == nil && sysSettings != nil {
				targetMode := models.OperationMode(newLic.AllowedOperationMode)
				if sysSettings.OperationMode != targetMode {
					sysSettings.OperationMode = targetMode
					_ = s.db.SaveSystemSettings(sysSettings)
				}
			}
		}
	}
	s.mu.Lock()
	s.cachedLicense = newLic
	s.mu.Unlock()

	log.Printf("🎉 [Licenciamento] SERVIDOR REGISTRADO NO MASTER COM SUCESSO! Chave: '%s' | Status: '%s' | Modo: '%s' | Expira: %s",
		newLic.LicenseKey, newLic.Status, newLic.AllowedOperationMode, newLic.ExpiresAt.Format("02/01/2006"))

	if s.OnLicenseChange != nil {
		s.OnLicenseChange(newLic)
	}

	return newLic, nil
}

// PerformHeartbeat faz a sincronização de checagem com o Super Sistema Master
func (s *LicenseService) PerformHeartbeat(ctx context.Context) error {
	lic, err := s.GetLicenseStatus()
	if err != nil || lic == nil {
		return errors.New("licença não localizada")
	}

	// Se não tem chave configurada, ou é chave genérica local, auto-registra no Master!
	if strings.TrimSpace(lic.LicenseKey) == "" || strings.HasPrefix(lic.LicenseKey, "TRIAL-30DAYS") {
		_, err := s.AutoRegisterWithMaster(ctx)
		return err
	}

	payload := models.LicenseHeartbeatRequest{
		LicenseKey:         lic.LicenseKey,
		TenantCNPJ:         lic.TenantCNPJ,
		SoftwareVersion:    "1.0.0-PROD",
		MachineFingerprint: s.getMachineFingerprint(),
	}

	jsonBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", s.masterURL+"/api/v1/licenses/heartbeat", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Printf("⚠️ [Licenciamento] Falha ao contatar Servidor Mestre (%s): %v. Operando em período de tolerância.", s.masterURL, err)
		return nil // Não trava o cliente em falha momentânea de rede (Grace period)
	}
	defer resp.Body.Close()

	previousStatus := lic.Status
	previousMode := lic.AllowedOperationMode
	previousReason := lic.SuspensionReason

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusPaymentRequired || resp.StatusCode == http.StatusForbidden {
		var res models.LicenseHeartbeatResponse
		_ = json.NewDecoder(resp.Body).Decode(&res)

		// Se a chave não for reconhecida pelo Master, dispara auto-registro para obter registro válido
		if strings.Contains(res.SuspensionReason, "não reconhecida") {
			log.Printf("⚠️ [Licenciamento] Chave '%s' não reconhecida no Master. Solicitando novo registro...", lic.LicenseKey)
			go func() {
				_, _ = s.AutoRegisterWithMaster(context.Background())
			}()
			return nil
		}

		lic.Status = res.Status
		if lic.Status == "" {
			lic.Status = models.LicenseStatusSuspended
		}
		lic.SuspensionReason = res.SuspensionReason
		lic.PaymentPix = res.PaymentPix
		lic.PaymentQRCodeBase64 = res.PaymentQRCodeBase64
		lic.PaymentAmount = res.PaymentAmount
		lic.ContactSupportPhone = res.ContactSupportPhone
		lic.LastHeartbeatAt = time.Now().UTC()

		if s.db != nil {
			_ = s.db.SaveSystemLicense(lic)
		}
		s.mu.Lock()
		s.cachedLicense = lic
		s.mu.Unlock()
		log.Printf("🔒 [Licenciamento] Notificação recebida do Master: Licença suspensa (%s)", lic.SuspensionReason)

		if lic.Status != previousStatus || lic.SuspensionReason != previousReason {
			if s.OnLicenseChange != nil {
				s.OnLicenseChange(lic)
			}
		}
		return nil
	}

	if resp.StatusCode == http.StatusOK {
		var res models.LicenseHeartbeatResponse
		if err := json.NewDecoder(resp.Body).Decode(&res); err == nil {
			lic.Status = res.Status
			lic.LicenseType = res.LicenseType
			if exp, err := time.Parse(time.RFC3339, res.ExpiresAt); err == nil {
				lic.ExpiresAt = exp
				graceHours := res.GracePeriodHours
				if graceHours <= 0 {
					graceHours = 72
				}
				lic.GracePeriodUntil = exp.Add(time.Duration(graceHours) * time.Hour)
			}
			lic.MaxOperators = res.MaxOperators
			lic.AllowedModules = res.AllowedModules
			if res.AllowedOperationMode != "" {
				lic.AllowedOperationMode = res.AllowedOperationMode
			} else {
				lic.AllowedOperationMode = "hybrid"
			}
			lic.SuspensionReason = res.SuspensionReason
			lic.PaymentPix = res.PaymentPix
			lic.PaymentQRCodeBase64 = res.PaymentQRCodeBase64
			lic.PaymentAmount = res.PaymentAmount
			lic.DiscountDescription = res.DiscountDescription
			lic.DiscountAmount = res.DiscountAmount
			lic.ContactSupportPhone = res.ContactSupportPhone
			lic.ContactSupportEmail = res.ContactSupportEmail
			lic.Signature = res.Signature
			lic.LastHeartbeatAt = time.Now().UTC()

			if s.db != nil {
				_ = s.db.SaveSystemLicense(lic)

				// Se o Master restringir o modelo de operação para apenas "erp" ou apenas "native", alinha automaticamente
				if lic.AllowedOperationMode == "erp" || lic.AllowedOperationMode == "native" {
					if sysSettings, err := s.db.GetSystemSettings(); err == nil && sysSettings != nil {
						targetMode := models.OperationMode(lic.AllowedOperationMode)
						if sysSettings.OperationMode != targetMode {
							sysSettings.OperationMode = targetMode
							_ = s.db.SaveSystemSettings(sysSettings)
							log.Printf("⚙️ [Licenciamento] Modo operacional ajustado conforme liberação do Master: %s", targetMode)
						}
					}
				}
			}
			s.mu.Lock()
			s.cachedLicense = lic
			s.mu.Unlock()

			if lic.Status != previousStatus || lic.AllowedOperationMode != previousMode || lic.SuspensionReason != previousReason {
				log.Printf("⚡ [Licenciamento] Alteração detectada pelo Master! Status: %s -> %s | Modo: %s -> %s", previousStatus, lic.Status, previousMode, lic.AllowedOperationMode)
				if s.OnLicenseChange != nil {
					s.OnLicenseChange(lic)
				}
			}
		}
	}

	return nil
}

// StartLicenseSyncWorker executa o ciclo de auto-registro e heartbeat periódico de alta frequência (5s) em background
func (s *LicenseService) StartLicenseSyncWorker(ctx context.Context) {
	// Executa uma sincronização inicial imediata após 1 segundo
	go func() {
		time.Sleep(1 * time.Second)
		lic, _ := s.GetLicenseStatus()
		if lic == nil || strings.TrimSpace(lic.LicenseKey) == "" || strings.HasPrefix(lic.LicenseKey, "TRIAL-30DAYS") {
			_, _ = s.AutoRegisterWithMaster(context.Background())
		} else {
			_ = s.PerformHeartbeat(context.Background())
		}
	}()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			lic, _ := s.GetLicenseStatus()
			if lic == nil || strings.TrimSpace(lic.LicenseKey) == "" || strings.HasPrefix(lic.LicenseKey, "TRIAL-30DAYS") {
				_, _ = s.AutoRegisterWithMaster(context.Background())
			} else {
				_ = s.PerformHeartbeat(context.Background())
			}
		}
	}
}

// GetPlanOptions consulta os preços calculados de assinatura (mensal e anual) no Super Sistema Master
func (s *LicenseService) GetPlanOptions(ctx context.Context) (*models.LicensePlanOptionsResponse, error) {
	lic, _ := s.GetLicenseStatus()
	key := ""
	if lic != nil {
		key = lic.LicenseKey
	}

	url := fmt.Sprintf("%s/api/v1/licenses/plans?license_key=%s", s.masterURL, key)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return &models.LicensePlanOptionsResponse{
			MonthlyPrice:      299.90,
			AnnualPrice:       2990.00,
			FinalMonthlyPrice: 299.90,
			FinalAnnualPrice:  2990.00,
		}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("erro ao consultar planos no Master: status %d", resp.StatusCode)
	}

	var options models.LicensePlanOptionsResponse
	if err := json.NewDecoder(resp.Body).Decode(&options); err != nil {
		return nil, err
	}
	return &options, nil
}

// CreateCheckout solicita a geração da cobrança por PIX ou Cartão ao Super Sistema Master
func (s *LicenseService) CreateCheckout(ctx context.Context, cycle string, paymentMethod string) (*models.LicenseCheckoutResponse, error) {
	lic, err := s.GetLicenseStatus()
	if err != nil || lic == nil {
		return nil, errors.New("licença não localizada")
	}

	companyCNPJ := ""
	companyName := ""
	if s.db != nil {
		if settings, err := s.db.GetSystemSettings(); err == nil && settings != nil {
			companyCNPJ = settings.CompanyCNPJ
			companyName = settings.CompanyName
		}
	}

	payload := map[string]interface{}{
		"licenseKey":    lic.LicenseKey,
		"tenantCnpj":    companyCNPJ,
		"tenantName":    companyName,
		"cycle":         cycle,
		"paymentMethod": paymentMethod,
	}

	jsonBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", s.masterURL+"/api/v1/licenses/checkout", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("falha ao contatar Servidor Master: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errResp struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		return nil, fmt.Errorf("master: %s", errResp.Error)
	}

	var checkoutResp models.LicenseCheckoutResponse
	if err := json.NewDecoder(resp.Body).Decode(&checkoutResp); err != nil {
		return nil, err
	}

	// Atualiza o PIX localmente se gerado
	if checkoutResp.PaymentPix != "" {
		lic.PaymentPix = checkoutResp.PaymentPix
		lic.PaymentAmount = checkoutResp.Amount
		if s.db != nil {
			_ = s.db.SaveSystemLicense(lic)
		}
		s.mu.Lock()
		s.cachedLicense = lic
		s.mu.Unlock()
	}

	return &checkoutResp, nil
}

// CheckPaymentStatus força uma sincronização imediata com o Master para verificar se o pagamento foi identificado e liberar
func (s *LicenseService) CheckPaymentStatus(ctx context.Context) (*models.SystemLicense, error) {
	if err := s.PerformHeartbeat(ctx); err != nil {
		return nil, err
	}
	return s.GetLicenseStatus()
}

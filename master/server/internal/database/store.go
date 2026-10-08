package database

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"master-license-server/internal/models"
)

type MasterDataFile struct {
	Tenants         []*models.Tenant             `json:"tenants"`
	FinanceSettings models.MasterFinanceSettings `json:"financeSettings"`
}

type Store struct {
	mu              sync.RWMutex
	filePath        string
	tenants         map[string]*models.Tenant // keyed by tenant.ID
	financeSettings models.MasterFinanceSettings
}

func NewStore(filePath string) (*Store, error) {
	s := &Store{
		filePath: filePath,
		tenants:  make(map[string]*models.Tenant),
		financeSettings: models.MasterFinanceSettings{
			MasterPixKey:        "contato@soltelecom.com.br",
			BeneficiaryName:     "SOL Telecom Licenciamento",
			BeneficiaryCity:     "SAO PAULO",
			DefaultMonthlyPrice: 299.90,
			AutoGeneratePix:     true,
		},
	}

	if err := s.load(); err != nil {
		log.Printf("ℹ️ Criando novo armazenamento de licenças em %s", filePath)
		s.seedDefaults()
		_ = s.save()
	}

	return s, nil
}

func (s *Store) load() error {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	// Tenta carregar no formato novo com configurações financeiras
	var container MasterDataFile
	if err := json.Unmarshal(data, &container); err == nil && (len(container.Tenants) > 0 || container.FinanceSettings.MasterPixKey != "") {
		s.mu.Lock()
		defer s.mu.Unlock()
		for _, t := range container.Tenants {
			s.tenants[t.ID] = t
		}
		if container.FinanceSettings.BeneficiaryName != "" {
			s.financeSettings = container.FinanceSettings
		}
		return nil
	}

	// Fallback para lista legada
	var list []*models.Tenant
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	for _, t := range list {
		s.tenants[t.ID] = t
	}
	return nil
}

func (s *Store) save() error {
	s.mu.RLock()
	list := make([]*models.Tenant, 0, len(s.tenants))
	for _, t := range s.tenants {
		list = append(list, t)
	}
	container := MasterDataFile{
		Tenants:         list,
		FinanceSettings: s.financeSettings,
	}
	s.mu.RUnlock()

	data, err := json.MarshalIndent(container, "", "  ")
	if err != nil {
		return err
	}

	tmpFile := s.filePath + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpFile, s.filePath)
}

func (s *Store) seedDefaults() {
	now := time.Now().UTC()
	defaultTenant := &models.Tenant{
		ID:                  "tenant-initial-trial-01",
		LicenseKey:          "TRIAL-30DAYS-INITIAL",
		TenantCNPJ:          "",
		TenantName:          "Empresa em Avaliação (Padrão)",
		ContactPerson:       "Responsável Técnico",
		ContactEmail:        "contato@provedor.com.br",
		ContactPhone:        "11999998888",
		LicenseType:         models.LicenseTrial,
		Status:              models.StatusActive,
		TrialDaysRemaining:  30,
		TrialStartedAt:      now,
		ExpiresAt:           now.Add(30 * 24 * time.Hour),
		GracePeriodUntil:    now.Add(33 * 24 * time.Hour),
		LastHeartbeatAt:     time.Time{},
		MaxOperators:        10,
		AllowedModules:      "erp,native,omnichannel",
		PaymentAmount:       299.90,
		DiscountDescription: "Desconto Pioneiro de Lançamento 20%",
		DiscountAmount:      60.00,
		CreatedAt:           now,
		UpdatedAt:           now,
	}
	s.tenants[defaultTenant.ID] = defaultTenant
}

func (s *Store) ListTenants() []*models.Tenant {
	s.mu.RLock()
	defer s.mu.RUnlock()
	list := make([]*models.Tenant, 0, len(s.tenants))
	for _, t := range s.tenants {
		copy := *t
		list = append(list, &copy)
	}
	return list
}

func (s *Store) GetTenantByID(id string) (*models.Tenant, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.tenants[id]
	if !ok {
		return nil, fmt.Errorf("tenant com ID %s não encontrado", id)
	}
	copy := *t
	return &copy, nil
}

func (s *Store) GetTenantByKey(key string) (*models.Tenant, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, t := range s.tenants {
		if t.LicenseKey == key {
			copy := *t
			return &copy, nil
		}
	}
	return nil, fmt.Errorf("licença %s não cadastrada no servidor mestre", key)
}

func (s *Store) GetTenantByHostOrCNPJ(host, cnpj, fingerprint string) *models.Tenant {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cleanHost := strings.TrimRight(strings.TrimSpace(host), "/")
	cleanCNPJ := strings.TrimSpace(cnpj)
	cleanFP := strings.TrimSpace(fingerprint)

	for _, t := range s.tenants {
		if cleanCNPJ != "" && t.TenantCNPJ == cleanCNPJ {
			copy := *t
			return &copy
		}
		if cleanHost != "" && strings.TrimRight(t.ServerHost, "/") == cleanHost {
			copy := *t
			return &copy
		}
		if cleanFP != "" && t.Notes != "" && strings.Contains(t.Notes, "fingerprint:"+cleanFP) {
			copy := *t
			return &copy
		}
	}
	return nil
}

func (s *Store) SaveTenant(t *models.Tenant) error {
	s.mu.Lock()
	t.UpdatedAt = time.Now().UTC()
	s.tenants[t.ID] = t
	s.mu.Unlock()
	return s.save()
}

func (s *Store) DeleteTenant(id string) error {
	s.mu.Lock()
	delete(s.tenants, id)
	s.mu.Unlock()
	return s.save()
}

func (s *Store) GetFinanceSettings() models.MasterFinanceSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.financeSettings
}

func (s *Store) SaveFinanceSettings(settings models.MasterFinanceSettings) error {
	s.mu.Lock()
	s.financeSettings = settings
	s.mu.Unlock()
	return s.save()
}

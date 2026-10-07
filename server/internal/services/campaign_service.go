package services

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"chat-interno-server/internal/database"
	"chat-interno-server/internal/models"
)

var (
	ErrCampaignNotFound = errors.New("campanha não encontrada")
)

// CampaignService gerencia dispositivos cadastrados, campanhas e notificações em massa
type CampaignService struct {
	db            *database.DB
	rbxService    *RBXService
	devices       map[string]*models.DeviceRegistration // deviceId -> registration
	campaigns     map[string]*models.Campaign           // campaignId -> campaign
	notifications map[string]*models.ClientNotification // notificationId -> notification
	mu            sync.RWMutex
}

func NewCampaignService(db *database.DB, rbxService *RBXService) *CampaignService {
	s := &CampaignService{
		db:            db,
		rbxService:    rbxService,
		devices:       make(map[string]*models.DeviceRegistration),
		campaigns:     make(map[string]*models.Campaign),
		notifications: make(map[string]*models.ClientNotification),
	}

	// Restaura dispositivos persistidos no PostgreSQL
	if db != nil {
		if savedDevs, err := db.ListDevices(); err == nil {
			for _, dev := range savedDevs {
				s.devices[dev.DeviceID] = dev
			}
		}
	}

	s.seedDefaultCampaigns()
	return s
}

func (s *CampaignService) seedDefaultCampaigns() {
	c1 := &models.Campaign{
		ID:             "camp-01",
		Title:          "Aviso de Manutenção Preventiva na Região Central",
		Message:        "Informamos que faremos melhorias preventivas na rede de fibra óptica hoje das 02h às 04h para aumentar a velocidade e estabilidade da sua conexão. Pedimos desculpas pelo transtorno temporário.",
		Department:     "Suporte Técnico",
		TargetType:     models.TargetAll,
		TargetDesc:     "Todos os assinantes com o aplicativo instalado",
		ActionType:     "chat_and_view",
		ChatInitialMsg: "Olá! Recebi o aviso de manutenção da rede central e gostaria de tirar uma dúvida sobre a minha conexão.",
		Status:         "concluida",
		SentCount:      420,
		DeliveredRate:  "99.2%",
		CreatedAt:      time.Now().Add(-48 * time.Hour),
	}

	c2 := &models.Campaign{
		ID:             "camp-02",
		Title:          "Upgrade Fibra 600 Mega liberado para seu endereço!",
		Message:        "Excelente notícia! A sua região agora conta com tecnologia Wi-Fi 6 e portas de 600 Mega pelo mesmo valor que você já paga atualmente. Clique abaixo para falar com um consultor e ativar sem custo de instalação.",
		Department:     "Comercial",
		TargetType:     models.TargetSpecific,
		TargetCpfs:     []string{"12345678900", "11122233344"},
		TargetDesc:     "Clientes selecionados para oferta de upgrade de plano",
		ActionType:     "chat_and_view",
		ChatInitialMsg: "Olá! Vi a notificação de upgrade para 600 Mega e quero ativar no meu plano.",
		Status:         "ativa",
		SentCount:      610,
		DeliveredRate:  "98.5%",
		CreatedAt:      time.Now().Add(-24 * time.Hour),
	}

	c3 := &models.Campaign{
		ID:             "camp-03",
		Title:          "Lembrete Preventivo: Fatura vence em 3 dias",
		Message:        "Sua mensalidade de internet vence em breve. Você pode emitir a 2ª via ou pagar via PIX com baixa imediata diretamente pelo aplicativo na aba Segunda Via.",
		Department:     "Financeiro",
		TargetType:     models.TargetAll,
		TargetDesc:     "Assinantes com fatura em aberto",
		ActionType:     "chat_and_view",
		ChatInitialMsg: "Olá! Recebi o lembrete de fatura e preciso de auxílio com a 2ª via.",
		Status:         "ativa",
		SentCount:      310,
		DeliveredRate:  "99.8%",
		CreatedAt:      time.Now().Add(-12 * time.Hour),
	}

	s.campaigns[c1.ID] = c1
	s.campaigns[c2.ID] = c2
	s.campaigns[c3.ID] = c3
}

// CleanDigits remove caracteres não-numéricos
func cleanDigits(s string) string {
	reg := regexp.MustCompile(`\D`)
	return reg.ReplaceAllString(s, "")
}

// RegisterDevice vincula ou atualiza o aparelho móvel ao CPF do cliente
func (s *CampaignService) RegisterDevice(reg models.DeviceRegistration) (*models.DeviceRegistration, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleanID := strings.TrimSpace(reg.DeviceID)
	if cleanID == "" {
		cleanID = "dev-" + uuid.New().String()
	}

	cpfClean := cleanDigits(reg.CpfCnpj)
	now := time.Now().UTC()

	existing, exists := s.devices[cleanID]
	if exists {
		if cpfClean != "" {
			existing.CpfCnpj = cpfClean
		}
		if reg.ClientName != "" {
			existing.ClientName = strings.TrimSpace(reg.ClientName)
		}
		if reg.Platform != "" {
			existing.Platform = reg.Platform
		}
		if reg.PushToken != "" {
			existing.PushToken = reg.PushToken
		}
		if reg.AppVersion != "" {
			existing.AppVersion = reg.AppVersion
		}
		if reg.OLT != "" {
			existing.OLT = strings.TrimSpace(reg.OLT)
		}
		if reg.PON != "" {
			existing.PON = strings.TrimSpace(reg.PON)
		}
		if reg.CTO != "" {
			existing.CTO = strings.TrimSpace(reg.CTO)
		}
		if reg.RbxGroup != "" {
			existing.RbxGroup = strings.TrimSpace(reg.RbxGroup)
		}

		// Se o dispositivo não tem OLT/PON/CTO mas o banco tem salvo para o CPF, carrega!
		if s.db != nil && (existing.OLT == "" || existing.CTO == "") && existing.CpfCnpj != "" {
			if olt, pon, cto, err := s.db.GetCustomerNetwork(existing.CpfCnpj); err == nil && olt != "" {
				if existing.OLT == "" {
					existing.OLT = olt
				}
				if existing.PON == "" {
					existing.PON = pon
				}
				if existing.CTO == "" {
					existing.CTO = cto
				}
			}
		}

		existing.LastSeenAt = now
		if s.db != nil {
			_ = s.db.UpsertDevice(existing)
		}
		return existing, nil
	}

	newDevice := &models.DeviceRegistration{
		DeviceID:   cleanID,
		CpfCnpj:    cpfClean,
		ClientName: strings.TrimSpace(reg.ClientName),
		Platform:   reg.Platform,
		PushToken:  reg.PushToken,
		AppVersion: reg.AppVersion,
		OLT:        strings.TrimSpace(reg.OLT),
		PON:        strings.TrimSpace(reg.PON),
		CTO:        strings.TrimSpace(reg.CTO),
		RbxGroup:   strings.TrimSpace(reg.RbxGroup),
		LastSeenAt: now,
		CreatedAt:  now,
	}

	// Carrega dados de rede salvos no banco para este CPF caso já existam
	if s.db != nil && (newDevice.OLT == "" || newDevice.CTO == "") && newDevice.CpfCnpj != "" {
		if olt, pon, cto, err := s.db.GetCustomerNetwork(newDevice.CpfCnpj); err == nil && olt != "" {
			if newDevice.OLT == "" {
				newDevice.OLT = olt
			}
			if newDevice.PON == "" {
				newDevice.PON = pon
			}
			if newDevice.CTO == "" {
				newDevice.CTO = cto
			}
		}
	}

	s.devices[cleanID] = newDevice
	if s.db != nil {
		_ = s.db.UpsertDevice(newDevice)
	}
	return newDevice, nil
}

// UpdateDeviceNetwork atualiza OLT, PON e CTO para os dispositivos vinculados ao CPF
func (s *CampaignService) UpdateDeviceNetwork(cpfCnpj, olt, pon, cto string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	clean := cleanDigits(cpfCnpj)
	cleanOlt := strings.TrimSpace(olt)
	cleanPon := strings.TrimSpace(pon)
	cleanCto := strings.TrimSpace(cto)

	for _, dev := range s.devices {
		if dev.CpfCnpj == clean || (clean == "" && dev.CpfCnpj != "") {
			dev.OLT = cleanOlt
			dev.PON = cleanPon
			dev.CTO = cleanCto
			if s.db != nil {
				_ = s.db.UpsertDevice(dev)
			}
		}
	}

	if s.db != nil && clean != "" {
		_ = s.db.SaveCustomerNetwork(clean, cleanOlt, cleanPon, cleanCto)
	}

	return nil
}

// ListDevices retorna todos os dispositivos cadastrados no banco
func (s *CampaignService) ListDevices() []models.DeviceRegistration {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]models.DeviceRegistration, 0, len(s.devices))
	for _, dev := range s.devices {
		list = append(list, *dev)
	}
	return list
}

// ListCampaigns retorna todas as campanhas cadastradas
func (s *CampaignService) ListCampaigns() []*models.Campaign {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]*models.Campaign, 0, len(s.campaigns))
	for _, camp := range s.campaigns {
		list = append(list, camp)
	}
	return list
}

// GetCampaign busca uma campanha por ID
func (s *CampaignService) GetCampaign(id string) (*models.Campaign, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	camp, exists := s.campaigns[id]
	if !exists {
		return nil, ErrCampaignNotFound
	}
	return camp, nil
}

// SaveCampaign cria ou atualiza uma campanha
func (s *CampaignService) SaveCampaign(camp *models.Campaign) (*models.Campaign, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if camp.Title == "" {
		return nil, fmt.Errorf("título da campanha é obrigatório")
	}
	if camp.Message == "" {
		return nil, fmt.Errorf("mensagem da campanha é obrigatória")
	}

	if camp.ID == "" {
		camp.ID = "camp-" + uuid.New().String()[:8]
		camp.CreatedAt = time.Now().UTC()
		if camp.Status == "" {
			camp.Status = "rascunho"
		}
		if camp.DeliveredRate == "" {
			camp.DeliveredRate = "100%"
		}
	}

	// Normaliza lista de CPFs caso seja do tipo TargetSpecific
	if len(camp.TargetCpfs) > 0 {
		normalized := make([]string, 0, len(camp.TargetCpfs))
		for _, c := range camp.TargetCpfs {
			cleaned := cleanDigits(c)
			if cleaned != "" {
				normalized = append(normalized, cleaned)
			}
		}
		camp.TargetCpfs = normalized
	}

	s.campaigns[camp.ID] = camp
	return camp, nil
}

// DispatchCampaign processa o envio em massa da campanha para os clientes-alvo
func (s *CampaignService) DispatchCampaign(campID string) (*models.DispatchResult, []*models.ClientNotification, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	camp, exists := s.campaigns[campID]
	if !exists {
		return nil, nil, ErrCampaignNotFound
	}

	now := time.Now().UTC()
	createdNotifs := make([]*models.ClientNotification, 0)
	targetCpfSet := make(map[string]bool)

	for _, cpf := range camp.TargetCpfs {
		cleaned := cleanDigits(cpf)
		if cleaned != "" {
			targetCpfSet[cleaned] = true
		}
	}

	// Agrupa todos os códigos de grupos RBX selecionados (suporte a 1 ou mais)
	rbxGroupCodes := splitAndTrimTokens(camp.TargetRbxGroup, camp.TargetRbxGroups)

	// Se for target por grupo do RBX, consulta os clientes de cada grupo selecionado no RBX
	if camp.TargetType == models.TargetRbxGroup && s.rbxService != nil && len(rbxGroupCodes) > 0 {
		for _, grpCode := range rbxGroupCodes {
			if clients, err := s.rbxService.GetClientsByGroup(context.Background(), grpCode); err == nil {
				for _, cli := range clients {
					cleaned := cleanDigits(cli.CpfCnpj)
					if cleaned != "" {
						targetCpfSet[cleaned] = true
					}
				}
			}
		}
	}

	// Prepara listas de OLTs, PONs e CTOs permitidas (suporte a 1 ou mais separadas por vírgula ou lista)
	targetOlts := splitAndTrimTokens(camp.TargetOlt, camp.TargetOlts)
	targetPons := splitAndTrimTokens(camp.TargetPon, camp.TargetPons)
	targetCtos := splitAndTrimTokens(camp.TargetCto, camp.TargetCtos)

	// 1. Itera dispositivos registrados
	for _, dev := range s.devices {
		matches := false
		if camp.TargetType == models.TargetAll {
			matches = true
		} else if camp.TargetType == models.TargetSpecific {
			if dev.CpfCnpj != "" && targetCpfSet[dev.CpfCnpj] {
				matches = true
			}
		} else if camp.TargetType == models.TargetNetwork {
			// Filtro por Infraestrutura de Rede (OLT / PON / CTO com 1 ou mais opções)
			oltMatch := len(targetOlts) == 0 || matchAny(dev.OLT, targetOlts)
			ponMatch := len(targetPons) == 0 || matchAny(dev.PON, targetPons)
			ctoMatch := len(targetCtos) == 0 || matchAny(dev.CTO, targetCtos)

			// Pelo menos um filtro de rede deve ter sido preenchido
			if (len(targetOlts) > 0 || len(targetPons) > 0 || len(targetCtos) > 0) && oltMatch && ponMatch && ctoMatch {
				matches = true
			}
		} else if camp.TargetType == models.TargetRbxGroup {
			// Filtro por Grupo de Clientes do RBX (1 ou mais grupos)
			if len(rbxGroupCodes) > 0 {
				devGrpUpper := strings.ToUpper(strings.TrimSpace(dev.RbxGroup))
				isInGroup := false
				for _, g := range rbxGroupCodes {
					if devGrpUpper == g {
						isInGroup = true
						break
					}
				}
				if isInGroup || (dev.CpfCnpj != "" && targetCpfSet[dev.CpfCnpj]) {
					matches = true
				}
			}
		} else {
			matches = true
		}

		if matches {
			notif := &models.ClientNotification{
				ID:             "notif-" + uuid.New().String()[:12],
				CampaignID:     camp.ID,
				Title:          camp.Title,
				Message:        camp.Message,
				Department:     camp.Department,
				ActionType:     camp.ActionType,
				ChatInitialMsg: camp.ChatInitialMsg,
				CpfCnpj:        dev.CpfCnpj,
				DeviceID:       dev.DeviceID,
				Read:           false,
				CreatedAt:      now,
			}
			s.notifications[notif.ID] = notif
			createdNotifs = append(createdNotifs, notif)
		}
	}

	// 2. Se for TargetSpecific ou TargetRbxGroup e algum CPF não possui aparelho vinculado ainda,
	// gera notificação genérica para aquele CPF para quando ele abrir o aplicativo!
	if camp.TargetType == models.TargetSpecific || camp.TargetType == models.TargetRbxGroup {
		for targetCpf := range targetCpfSet {
			hasDevice := false
			for _, notif := range createdNotifs {
				if notif.CpfCnpj == targetCpf {
					hasDevice = true
					break
				}
			}
			if !hasDevice {
				notif := &models.ClientNotification{
					ID:             "notif-" + uuid.New().String()[:12],
					CampaignID:     camp.ID,
					Title:          camp.Title,
					Message:        camp.Message,
					Department:     camp.Department,
					ActionType:     camp.ActionType,
					ChatInitialMsg: camp.ChatInitialMsg,
					CpfCnpj:        targetCpf,
					DeviceID:       "",
					Read:           false,
					CreatedAt:      now,
				}
				s.notifications[notif.ID] = notif
				createdNotifs = append(createdNotifs, notif)
			}
		}
	}

	// 3. Atualiza métricas da campanha
	camp.SentCount += len(createdNotifs)
	camp.Status = "ativa"
	camp.DeliveredRate = "100%"

	result := &models.DispatchResult{
		CampaignID:        camp.ID,
		TotalTargeted:     len(createdNotifs),
		DeliveredRealtime: len(createdNotifs),
		Message:           fmt.Sprintf("Campanha disparada com sucesso para %d cliente(s)!", len(createdNotifs)),
	}

	return result, createdNotifs, nil
}

// GetClientNotifications retorna notificações pendentes para o cliente
func (s *CampaignService) GetClientNotifications(cpf string, deviceID string) []*models.ClientNotification {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cpfClean := cleanDigits(cpf)
	deviceIDClean := strings.TrimSpace(deviceID)

	list := make([]*models.ClientNotification, 0)
	for _, notif := range s.notifications {
		// Se já foi lida, pode ignorar ou listar
		if notif.Read {
			continue
		}

		matches := false
		if cpfClean != "" && notif.CpfCnpj == cpfClean {
			matches = true
		} else if deviceIDClean != "" && notif.DeviceID == deviceIDClean {
			matches = true
		} else if notif.CpfCnpj == "" && notif.DeviceID == "" {
			matches = true
		}

		if matches {
			list = append(list, notif)
		}
	}

	return list
}

// MarkNotificationRead marca uma notificação como visualizada
func (s *CampaignService) MarkNotificationRead(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	notif, exists := s.notifications[id]
	if !exists {
		return errors.New("notificação não encontrada")
	}
	notif.Read = true
	return nil
}

// splitAndTrimTokens divide strings por vírgula, ponto-e-vírgula ou nova linha e remove espaços em branco
func splitAndTrimTokens(raw string, list []string) []string {
	var result []string
	seen := make(map[string]bool)

	addToken := func(t string) {
		trimmed := strings.TrimSpace(t)
		if trimmed != "" {
			upper := strings.ToUpper(trimmed)
			if !seen[upper] {
				seen[upper] = true
				result = append(result, upper)
			}
		}
	}

	for _, item := range list {
		for _, part := range strings.FieldsFunc(item, func(r rune) bool {
			return r == ',' || r == ';' || r == '\n'
		}) {
			addToken(part)
		}
	}

	if raw != "" {
		for _, part := range strings.FieldsFunc(raw, func(r rune) bool {
			return r == ',' || r == ';' || r == '\n'
		}) {
			addToken(part)
		}
	}

	return result
}

// matchAny verifica se a string value dá match com algum token da lista (case-insensitive)
func matchAny(value string, tokens []string) bool {
	if len(tokens) == 0 {
		return true
	}
	valUpper := strings.ToUpper(strings.TrimSpace(value))
	if valUpper == "" {
		return false
	}
	for _, tok := range tokens {
		if valUpper == tok || strings.Contains(valUpper, tok) || strings.Contains(tok, valUpper) {
			return true
		}
	}
	return false
}

// GetPushTokensForNotifications retorna todos os tokens de push Expo associados aos destinatários das notificações
func (s *CampaignService) GetPushTokensForNotifications(notifs []*models.ClientNotification) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	tokenSet := make(map[string]bool)
	for _, n := range notifs {
		if n.DeviceID != "" {
			if dev, ok := s.devices[n.DeviceID]; ok && dev.PushToken != "" {
				tokenSet[dev.PushToken] = true
			}
		}
		if n.CpfCnpj != "" {
			for _, dev := range s.devices {
				if dev.CpfCnpj == n.CpfCnpj && dev.PushToken != "" {
					tokenSet[dev.PushToken] = true
				}
			}
		}
	}

	result := make([]string, 0, len(tokenSet))
	for t := range tokenSet {
		result = append(result, t)
	}
	return result
}

// GetPushTokenByCpfOrDevice busca o token de push do cliente por CPF ou DeviceID
func (s *CampaignService) GetPushTokenByCpfOrDevice(cpf, deviceID string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if deviceID != "" {
		if dev, ok := s.devices[deviceID]; ok && dev.PushToken != "" {
			return dev.PushToken
		}
	}

	cleanCpf := cleanDigits(cpf)
	if cleanCpf != "" {
		for _, dev := range s.devices {
			if dev.CpfCnpj == cleanCpf && dev.PushToken != "" {
				return dev.PushToken
			}
		}
	}

	return ""
}

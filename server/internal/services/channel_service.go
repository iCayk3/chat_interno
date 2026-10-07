package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"chat-interno-server/internal/database"
	"chat-interno-server/internal/models"
)

type HubBroadcaster interface {
	BroadcastToOperators(action *models.WSAction, excludeConversationID ...string)
	BroadcastToConversation(conversationID string, action *models.WSAction)
}

type ChannelService struct {
	db          *database.DB
	chatService *ChatService
	hub         HubBroadcaster
	httpClient  *http.Client
	mu          sync.RWMutex
}

func NewChannelService(db *database.DB, chatService *ChatService) *ChannelService {
	return &ChannelService{
		db:          db,
		chatService: chatService,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (s *ChannelService) SetHub(hub HubBroadcaster) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.hub = hub
}

// ==========================================
// CONFIGURAÇÕES GERAIS DE CANAIS
// ==========================================

func (s *ChannelService) GetChannelsConfig() (*models.ChannelsConfig, error) {
	if s.db == nil {
		return &models.ChannelsConfig{
			WhatsAppEvolution: models.WhatsAppEvolutionConfig{
				Enabled:      true,
				ServerURL:    "http://45.166.31.237:8080",
				ApiKey:       "rr66oi90rr66oi90",
				InstanceName: "solprovedorgroup",
				Status:       "connected",
			},
		}, nil
	}
	return s.db.GetChannelsConfig()
}

// ==========================================
// TELEGRAM BOT API
// ==========================================

type TelegramBotInfo struct {
	ID        int64  `json:"id"`
	IsBot     bool   `json:"is_bot"`
	FirstName string `json:"first_name"`
	Username  string `json:"username"`
}

func (s *ChannelService) SaveTelegramConfig(cfg *models.TelegramConfig) error {
	if s.db == nil {
		return nil
	}
	return s.db.SaveChannelConfig("telegram", cfg)
}

func (s *ChannelService) TestTelegram(token string) (*TelegramBotInfo, error) {
	cleanToken := strings.TrimSpace(token)
	if cleanToken == "" {
		return nil, errors.New("token do bot do Telegram não informado")
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/getMe", cleanToken)
	resp, err := s.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("falha ao conectar na API do Telegram: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Ok          bool             `json:"ok"`
		Result      *TelegramBotInfo `json:"result"`
		Description string           `json:"description"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if !result.Ok || result.Result == nil {
		return nil, fmt.Errorf("telegram rejeitou o token: %s", result.Description)
	}

	return result.Result, nil
}

func (s *ChannelService) SetupTelegramWebhook(token, webhookURL string) error {
	cleanToken := strings.TrimSpace(token)
	cleanURL := strings.TrimSpace(webhookURL)
	if cleanToken == "" || cleanURL == "" {
		return errors.New("token e webhookURL são obrigatórios")
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/setWebhook?url=%s", cleanToken, cleanURL)
	resp, err := s.httpClient.Post(apiURL, "application/json", nil)
	if err != nil {
		return fmt.Errorf("falha ao registrar webhook no Telegram: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Ok          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}
	if !result.Ok {
		return fmt.Errorf("erro ao configurar webhook no Telegram: %s", result.Description)
	}

	return nil
}

func (s *ChannelService) SendTelegramMessage(token, chatID, text string) error {
	cleanToken := strings.TrimSpace(token)
	if cleanToken == "" {
		// Tenta carregar da configuração salva
		cfg, _ := s.GetChannelsConfig()
		if cfg != nil && cfg.Telegram.BotToken != "" {
			cleanToken = cfg.Telegram.BotToken
		}
	}
	if cleanToken == "" {
		return errors.New("bot token do Telegram não configurado")
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", cleanToken)
	payload := map[string]string{
		"chat_id": chatID,
		"text":    text,
	}
	jsonBytes, _ := json.Marshal(payload)

	resp, err := s.httpClient.Post(apiURL, "application/json", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return fmt.Errorf("falha ao enviar mensagem para Telegram: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("telegram retornou erro %d: %s", resp.StatusCode, string(b))
	}

	return nil
}

// ==========================================
// WHATSAPP OFICIAL (META CLOUD API)
// ==========================================

func (s *ChannelService) SaveWhatsAppOfficialConfig(cfg *models.WhatsAppOfficialConfig) error {
	if s.db == nil {
		return nil
	}
	return s.db.SaveChannelConfig("whatsapp_official", cfg)
}

func (s *ChannelService) TestWhatsAppOfficial(phoneNumberID, token string) error {
	url := fmt.Sprintf("https://graph.facebook.com/v21.0/%s", strings.TrimSpace(phoneNumberID))
	req, err := http.NewRequestWithContext(context.Background(), "GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(token))

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("falha ao conectar na Meta Cloud API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("meta retornou status %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func (s *ChannelService) SendWhatsAppOfficialMessage(phoneID, token, toPhone, text string) error {
	cleanPhoneID := strings.TrimSpace(phoneID)
	cleanToken := strings.TrimSpace(token)
	if cleanPhoneID == "" || cleanToken == "" {
		cfg, _ := s.GetChannelsConfig()
		if cfg != nil {
			cleanPhoneID = cfg.WhatsAppOfficial.PhoneNumberID
			cleanToken = cfg.WhatsAppOfficial.AccessToken
		}
	}
	if cleanPhoneID == "" || cleanToken == "" {
		return errors.New("credenciais do WhatsApp Oficial não configuradas")
	}

	url := fmt.Sprintf("https://graph.facebook.com/v21.0/%s/messages", cleanPhoneID)
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"recipient_type":    "individual",
		"to":                toPhone,
		"type":              "text",
		"text": map[string]string{
			"body": text,
		},
	}
	jsonBytes, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(context.Background(), "POST", url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+cleanToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("falha ao enviar via Meta Cloud API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("meta retornou erro %d: %s", resp.StatusCode, string(b))
	}

	return nil
}

// GetWhatsAppOfficialTemplates retorna a lista de templates aprovados (da Meta Cloud API ou do catálogo autorizado)
func (s *ChannelService) GetWhatsAppOfficialTemplates() ([]models.WhatsAppOfficialTemplate, error) {
	// Catálogo de templates padrão aprovados no Meta Business Manager para Provedor de Internet SOL
	defaultTemplates := []models.WhatsAppOfficialTemplate{
		{
			Name:        "inicio_atendimento_sol",
			Language:    "pt_BR",
			Category:    "UTILITY",
			Status:      "APPROVED",
			BodyText:    "Olá {{1}}, seu atendimento sobre {{2}} foi iniciado na SOL pelo atendente {{3}}. Como podemos ajudar você hoje?",
			ParamLabels: []string{"Nome do Cliente", "Setor / Motivo", "Nome do Atendente"},
		},
		{
			Name:        "suporte_tecnico_sol",
			Language:    "pt_BR",
			Category:    "UTILITY",
			Status:      "APPROVED",
			BodyText:    "Olá {{1}}, recebemos sua solicitação de suporte técnico para sua conexão de internet. Estamos com seu chamado aberto e prontos para atender você.",
			ParamLabels: []string{"Nome do Cliente"},
		},
		{
			Name:        "aviso_fatura_sol",
			Language:    "pt_BR",
			Category:    "UTILITY",
			Status:      "APPROVED",
			BodyText:    "Olá {{1}}, sua fatura SOL com vencimento em {{2}} no valor de {{3}} já está disponível. Responda esta mensagem se precisar da 2ª via ou código PIX.",
			ParamLabels: []string{"Nome do Cliente", "Data de Vencimento", "Valor da Fatura"},
		},
		{
			Name:        "confirmacao_visita_sol",
			Language:    "pt_BR",
			Category:    "UTILITY",
			Status:      "APPROVED",
			BodyText:    "Olá {{1}}, confirmamos o agendamento da visita técnica da SOL para o dia {{2}} no período da {{3}}. Por favor, confirme se haverá alguém maior de idade no local.",
			ParamLabels: []string{"Nome do Cliente", "Data da Visita", "Período (Manhã/Tarde)"},
		},
		{
			Name:        "retorno_contato_sol",
			Language:    "pt_BR",
			Category:    "UTILITY",
			Status:      "APPROVED",
			BodyText:    "Olá {{1}}, este é o retorno do seu contato com a equipe SOL a respeito de {{2}}. Estamos prontos para dar continuidade ao seu caso.",
			ParamLabels: []string{"Nome do Cliente", "Assunto / Solicitação"},
		},
	}

	cfg, _ := s.GetChannelsConfig()
	if cfg == nil || strings.TrimSpace(cfg.WhatsAppOfficial.WabaID) == "" || strings.TrimSpace(cfg.WhatsAppOfficial.AccessToken) == "" {
		return defaultTemplates, nil
	}

	// Se houver WABA ID e Token configurados, consulta templates adicionais na Meta Graph API
	url := fmt.Sprintf("https://graph.facebook.com/v21.0/%s/message_templates?status=APPROVED&limit=100", strings.TrimSpace(cfg.WhatsAppOfficial.WabaID))
	req, err := http.NewRequestWithContext(context.Background(), "GET", url, nil)
	if err != nil {
		return defaultTemplates, nil
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(cfg.WhatsAppOfficial.AccessToken))

	resp, err := s.httpClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			_ = resp.Body.Close()
		}
		return defaultTemplates, nil
	}
	defer resp.Body.Close()

	var metaResp struct {
		Data []struct {
			Name       string `json:"name"`
			Language   string `json:"language"`
			Category   string `json:"category"`
			Status     string `json:"status"`
			Components []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"components"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&metaResp); err == nil && len(metaResp.Data) > 0 {
		var liveTemplates []models.WhatsAppOfficialTemplate
		for _, item := range metaResp.Data {
			bodyText := ""
			for _, c := range item.Components {
				if strings.EqualFold(c.Type, "BODY") {
					bodyText = c.Text
					break
				}
			}
			re := regexp.MustCompile(`\{\{(\d+)\}\}`)
			matches := re.FindAllString(bodyText, -1)
			labels := make([]string, len(matches))
			for i := range labels {
				labels[i] = fmt.Sprintf("Parâmetro {{%d}}", i+1)
			}
			liveTemplates = append(liveTemplates, models.WhatsAppOfficialTemplate{
				Name:        item.Name,
				Language:    item.Language,
				Category:    item.Category,
				Status:      item.Status,
				BodyText:    bodyText,
				ParamLabels: labels,
			})
		}
		if len(liveTemplates) > 0 {
			return liveTemplates, nil
		}
	}

	return defaultTemplates, nil
}

// SendWhatsAppOfficialTemplate envia um template pré-aprovado pela Meta e retorna o texto renderizado
func (s *ChannelService) SendWhatsAppOfficialTemplate(phoneID, token, toPhone, templateName, language string, params []string) (string, error) {
	cleanPhoneID := strings.TrimSpace(phoneID)
	cleanToken := strings.TrimSpace(token)
	if cleanPhoneID == "" || cleanToken == "" {
		cfg, _ := s.GetChannelsConfig()
		if cfg != nil {
			cleanPhoneID = cfg.WhatsAppOfficial.PhoneNumberID
			cleanToken = cfg.WhatsAppOfficial.AccessToken
		}
	}

	cleanTo := strings.TrimSpace(toPhone)
	cleanTo = strings.ReplaceAll(cleanTo, "+", "")
	cleanTo = strings.ReplaceAll(cleanTo, " ", "")
	cleanTo = strings.ReplaceAll(cleanTo, "-", "")
	cleanTo = strings.ReplaceAll(cleanTo, "(", "")
	cleanTo = strings.ReplaceAll(cleanTo, ")", "")

	cleanLang := strings.TrimSpace(language)
	if cleanLang == "" {
		cleanLang = "pt_BR"
	}

	// Busca o corpo do template para renderizar o texto
	templates, _ := s.GetWhatsAppOfficialTemplates()
	bodyPattern := ""
	for _, t := range templates {
		if strings.EqualFold(t.Name, templateName) {
			bodyPattern = t.BodyText
			break
		}
	}
	if bodyPattern == "" {
		bodyPattern = fmt.Sprintf("[Template: %s]", templateName)
	}

	// Renderiza texto substituindo {{1}}, {{2}}...
	renderedText := bodyPattern
	for i, paramVal := range params {
		placeholder := fmt.Sprintf("{{%d}}", i+1)
		renderedText = strings.ReplaceAll(renderedText, placeholder, paramVal)
	}

	// Monta componentes da API da Meta
	var components []map[string]interface{}
	if len(params) > 0 {
		var paramList []map[string]string
		for _, val := range params {
			paramList = append(paramList, map[string]string{
				"type": "text",
				"text": val,
			})
		}
		components = append(components, map[string]interface{}{
			"type":       "body",
			"parameters": paramList,
		})
	}

	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"recipient_type":    "individual",
		"to":                cleanTo,
		"type":              "template",
		"template": map[string]interface{}{
			"name": templateName,
			"language": map[string]string{
				"code": cleanLang,
			},
		},
	}
	if len(components) > 0 {
		payload["template"].(map[string]interface{})["components"] = components
	}

	// Se não houver credenciais configuradas na Meta, registra log e devolve o texto renderizado
	if cleanPhoneID == "" || cleanToken == "" {
		log.Printf("⚠️ [WHATSAPP OFICIAL TEMPLATE LOCAL] Envio para %s: %s (Credenciais Meta não configuradas)", cleanTo, renderedText)
		return renderedText, nil
	}

	url := fmt.Sprintf("https://graph.facebook.com/v21.0/%s/messages", cleanPhoneID)
	jsonBytes, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(context.Background(), "POST", url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return renderedText, err
	}
	req.Header.Set("Authorization", "Bearer "+cleanToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return renderedText, fmt.Errorf("falha ao enviar template via Meta Cloud API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return renderedText, fmt.Errorf("meta retornou erro %d ao enviar template: %s", resp.StatusCode, string(b))
	}

	log.Printf("🟢 [WHATSAPP OFICIAL] Template '%s' enviado com sucesso para %s", templateName, cleanTo)
	return renderedText, nil
}

// ==========================================
// WHATSAPP EVOLUTION API (NÃO OFICIAL)
// ==========================================

func (s *ChannelService) SaveEvolutionConfig(cfg *models.WhatsAppEvolutionConfig) error {
	if s.db == nil {
		return nil
	}
	return s.db.SaveChannelConfig("whatsapp_evolution", cfg)
}

func (s *ChannelService) FetchEvolutionInstances(serverURL, apiKey string) ([]models.EvolutionInstance, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(serverURL), "/")
	if baseURL == "" {
		baseURL = "http://45.166.31.237:8080"
	}
	key := strings.TrimSpace(apiKey)
	if key == "" {
		key = "rr66oi90rr66oi90"
	}

	url := fmt.Sprintf("%s/instance/fetchInstances", baseURL)
	req, err := http.NewRequestWithContext(context.Background(), "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", key)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("falha ao conectar no Evolution API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("evolution retornou status %d: %s", resp.StatusCode, string(b))
	}

	var instances []models.EvolutionInstance
	if err := json.NewDecoder(resp.Body).Decode(&instances); err != nil {
		return nil, err
	}
	return instances, nil
}

func (s *ChannelService) CreateEvolutionInstance(serverURL, apiKey, instanceName string) (*models.EvolutionInstance, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(serverURL), "/")
	if baseURL == "" {
		baseURL = "http://45.166.31.237:8080"
	}
	key := strings.TrimSpace(apiKey)
	if key == "" {
		key = "rr66oi90rr66oi90"
	}
	instName := strings.TrimSpace(instanceName)
	if instName == "" {
		return nil, errors.New("nome da instância é obrigatório")
	}

	url := fmt.Sprintf("%s/instance/create", baseURL)
	payload := map[string]interface{}{
		"instanceName": instName,
		"token":        uuid.New().String(),
		"qrcode":       true,
		"integration":  "WHATSAPP-BAILEYS",
	}
	jsonBytes, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(context.Background(), "POST", url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", key)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Instance *models.EvolutionInstance `json:"instance"`
		Hash     map[string]interface{}    `json:"hash"`
		Qrcode   map[string]interface{}    `json:"qrcode"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if result.Instance != nil {
		return result.Instance, nil
	}
	return &models.EvolutionInstance{Name: instName, ConnectionStatus: "connecting"}, nil
}

func (s *ChannelService) GetEvolutionQRCode(serverURL, apiKey, instanceName string) (map[string]interface{}, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(serverURL), "/")
	if baseURL == "" {
		baseURL = "http://45.166.31.237:8080"
	}
	key := strings.TrimSpace(apiKey)
	if key == "" {
		key = "rr66oi90rr66oi90"
	}

	url := fmt.Sprintf("%s/instance/connect/%s", baseURL, strings.TrimSpace(instanceName))
	req, err := http.NewRequestWithContext(context.Background(), "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", key)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

// LogoutEvolutionInstance desconecta a sessão ativa do WhatsApp na instância (permitindo novo QR Code)
func (s *ChannelService) LogoutEvolutionInstance(serverURL, apiKey, instanceName string) error {
	baseURL := strings.TrimRight(strings.TrimSpace(serverURL), "/")
	if baseURL == "" {
		baseURL = "http://45.166.31.237:8080"
	}
	key := strings.TrimSpace(apiKey)
	if key == "" {
		key = "rr66oi90rr66oi90"
	}

	url := fmt.Sprintf("%s/instance/logout/%s", baseURL, strings.TrimSpace(instanceName))
	req, err := http.NewRequestWithContext(context.Background(), "DELETE", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", key)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("evolution retornou erro %d ao desconectar: %s", resp.StatusCode, string(b))
	}
	return nil
}

// DeleteEvolutionInstance remove a instância do servidor Evolution
func (s *ChannelService) DeleteEvolutionInstance(serverURL, apiKey, instanceName string) error {
	baseURL := strings.TrimRight(strings.TrimSpace(serverURL), "/")
	if baseURL == "" {
		baseURL = "http://45.166.31.237:8080"
	}
	key := strings.TrimSpace(apiKey)
	if key == "" {
		key = "rr66oi90rr66oi90"
	}

	url := fmt.Sprintf("%s/instance/delete/%s", baseURL, strings.TrimSpace(instanceName))
	req, err := http.NewRequestWithContext(context.Background(), "DELETE", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", key)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("evolution retornou erro %d ao excluir instância: %s", resp.StatusCode, string(b))
	}
	return nil
}

func (s *ChannelService) SetupEvolutionWebhook(serverURL, apiKey, instanceName, webhookURL string) error {
	baseURL := strings.TrimRight(strings.TrimSpace(serverURL), "/")
	if baseURL == "" {
		baseURL = "http://45.166.31.237:8080"
	}
	key := strings.TrimSpace(apiKey)
	if key == "" {
		key = "rr66oi90rr66oi90"
	}
	cleanURL := strings.TrimSpace(webhookURL)
	if cleanURL == "" {
		return errors.New("URL do webhook é obrigatória")
	}

	url := fmt.Sprintf("%s/webhook/set/%s", baseURL, strings.TrimSpace(instanceName))
	payload := map[string]interface{}{
		"webhook": map[string]interface{}{
			"enabled":  true,
			"url":      cleanURL,
			"byEvents": false,
			"base64":   false,
			"events": []string{
				"MESSAGES_UPSERT",
				"SEND_MESSAGE",
				"CONNECTION_UPDATE",
			},
		},
	}
	jsonBytes, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(context.Background(), "POST", url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("apikey", key)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("falha ao enviar configuração de webhook para Evolution API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("evolution retornou erro %d ao definir webhook: %s", resp.StatusCode, string(b))
	}
	return nil
}

func (s *ChannelService) SendEvolutionMessage(serverURL, apiKey, instanceName, number, text string) error {
	baseURL := strings.TrimRight(strings.TrimSpace(serverURL), "/")
	if baseURL == "" {
		baseURL = "http://45.166.31.237:8080"
	}
	key := strings.TrimSpace(apiKey)
	if key == "" {
		key = "rr66oi90rr66oi90"
	}
	inst := strings.TrimSpace(instanceName)
	if inst == "" {
		inst = "solprovedorgroup"
	}

	cleanNumber := strings.TrimSpace(number)
	cleanNumber = strings.ReplaceAll(cleanNumber, "@s.whatsapp.net", "")
	cleanNumber = strings.ReplaceAll(cleanNumber, "@c.us", "")

	url := fmt.Sprintf("%s/message/sendText/%s", baseURL, inst)
	payload := map[string]string{
		"number": cleanNumber,
		"text":   text,
	}
	jsonBytes, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(context.Background(), "POST", url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("apikey", key)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("falha ao conectar no Evolution API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("evolution retornou erro %d ao enviar mensagem: %s", resp.StatusCode, string(b))
	}

	return nil
}

// SendEvolutionMedia envia um arquivo ou documento (PDF, imagem, etc.) diretamente pelo Evolution API
func (s *ChannelService) SendEvolutionMedia(serverURL, apiKey, instanceName, number, mediaURL, mimeType, fileName, caption string) error {
	baseURL := strings.TrimRight(strings.TrimSpace(serverURL), "/")
	if baseURL == "" {
		baseURL = "http://45.166.31.237:8080"
	}
	key := strings.TrimSpace(apiKey)
	if key == "" {
		key = "rr66oi90rr66oi90"
	}
	inst := strings.TrimSpace(instanceName)
	if inst == "" {
		inst = "solprovedorgroup"
	}

	cleanNumber := strings.TrimSpace(number)
	cleanNumber = strings.ReplaceAll(cleanNumber, "@s.whatsapp.net", "")
	cleanNumber = strings.ReplaceAll(cleanNumber, "@c.us", "")

	url := fmt.Sprintf("%s/message/sendMedia/%s", baseURL, inst)
	payload := map[string]interface{}{
		"number":    cleanNumber,
		"mediatype": "document",
		"mimetype":  mimeType,
		"caption":   caption,
		"media":     mediaURL,
		"fileName":  fileName,
	}
	jsonBytes, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(context.Background(), "POST", url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("apikey", key)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("falha ao conectar no Evolution API para envio de mídia: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("evolution retornou erro %d ao enviar mídia: %s", resp.StatusCode, string(b))
	}

	log.Printf("🟢 [EVOLUTION] Documento/Mídia enviada com sucesso para WhatsApp %s", cleanNumber)
	return nil
}

// ==========================================
// DESPACHO UNIFICADO PARA O CANAL DE ORIGEM
// ==========================================

// SendMessageToChannel envia a mensagem de resposta do operador para o canal correspondente do cliente
func (s *ChannelService) SendMessageToChannel(conv *models.Conversation, text string) {
	if conv == nil || conv.Channel == "" || conv.Channel == "mobile" || conv.Channel == "web" {
		return // Canais nativos recebem via WebSocket normalmente
	}

	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[CHANNEL DISPATCH PANIC RECOVER]: %v", r)
			}
		}()

		switch conv.Channel {
		case "telegram":
			cfg, err := s.GetChannelsConfig()
			if err != nil || cfg == nil || !cfg.Telegram.Enabled {
				log.Printf("[TELEGRAM] Canal desativado ou sem configuração")
				return
			}
			if err := s.SendTelegramMessage(cfg.Telegram.BotToken, conv.ChannelID, text); err != nil {
				log.Printf("[TELEGRAM SEND ERROR] %v", err)
			} else {
				log.Printf("💬 [TELEGRAM] Mensagem enviada com sucesso para chat_id %s", conv.ChannelID)
			}

		case "whatsapp_evolution":
			cfg, err := s.GetChannelsConfig()
			if err != nil || cfg == nil || !cfg.WhatsAppEvolution.Enabled {
				log.Printf("[EVOLUTION] Canal desativado ou sem configuração")
				return
			}
			inst := cfg.WhatsAppEvolution.InstanceName
			if inst == "" {
				inst = "solprovedorgroup"
			}
			if err := s.SendEvolutionMessage(cfg.WhatsAppEvolution.ServerURL, cfg.WhatsAppEvolution.ApiKey, inst, conv.ChannelID, text); err != nil {
				log.Printf("[EVOLUTION SEND ERROR] %v", err)
			} else {
				log.Printf("🟢 [EVOLUTION] Mensagem enviada com sucesso para WhatsApp %s", conv.ChannelID)
			}

		case "whatsapp_official":
			cfg, err := s.GetChannelsConfig()
			if err != nil || cfg == nil || !cfg.WhatsAppOfficial.Enabled {
				log.Printf("[WHATSAPP OFICIAL] Canal desativado ou sem configuração")
				return
			}
			if err := s.SendWhatsAppOfficialMessage(cfg.WhatsAppOfficial.PhoneNumberID, cfg.WhatsAppOfficial.AccessToken, conv.ChannelID, text); err != nil {
				log.Printf("[WHATSAPP OFICIAL SEND ERROR] %v", err)
			} else {
				log.Printf("🟢 [WHATSAPP OFICIAL] Mensagem enviada com sucesso para %s", conv.ChannelID)
			}
		}
	}()
}

// ==========================================
// PROCESSAMENTO DE WEBHOOKS RECEBIDOS
// ==========================================

// ParseRatingNumber extrai uma nota de 1 a 5 da mensagem enviada pelo cliente,
// suportando números, emojis numéricos (1️⃣..5️⃣), estrelas (⭐⭐⭐⭐⭐),
// reações de aprovação (👍, ❤️) e palavras de feedback (excelente, bom, regular, etc.).
func ParseRatingNumber(text string) int {
	clean := strings.TrimSpace(text)
	if clean == "" {
		return 0
	}

	// 1. Números diretos 1 a 5
	if len(clean) == 1 && clean[0] >= '1' && clean[0] <= '5' {
		return int(clean[0] - '0')
	}

	// 2. Emojis numéricos: 1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣
	if strings.Contains(clean, "1️⃣") {
		return 1
	}
	if strings.Contains(clean, "2️⃣") {
		return 2
	}
	if strings.Contains(clean, "3️⃣") {
		return 3
	}
	if strings.Contains(clean, "4️⃣") {
		return 4
	}
	if strings.Contains(clean, "5️⃣") {
		return 5
	}

	// 3. Contagem de estrelas (ex: ⭐⭐⭐⭐⭐ = 5, ★★★★ = 4)
	starCount := strings.Count(clean, "⭐") + strings.Count(clean, "★")
	if starCount >= 1 && starCount <= 5 {
		return starCount
	}

	// 4. Reações ou emojis comuns de aprovação / reprovação
	if strings.Contains(clean, "👍") || strings.Contains(clean, "❤️") || strings.Contains(clean, "👏") || strings.Contains(clean, "🙌") || strings.Contains(clean, "🥰") {
		return 5
	}
	if strings.Contains(clean, "👎") {
		return 1
	}

	// 5. Palavras textuais de avaliação
	lower := strings.ToLower(clean)
	if strings.Contains(lower, "excelente") || strings.Contains(lower, "ótimo") || strings.Contains(lower, "otimo") ||
		strings.Contains(lower, "perfeito") || strings.Contains(lower, "maravilh") || strings.Contains(lower, "muito bom") ||
		strings.Contains(lower, "nota 10") || strings.Contains(lower, "10") || strings.Contains(lower, "top") {
		return 5
	}
	if strings.Contains(lower, "muito ruim") || strings.Contains(lower, "péssimo") || strings.Contains(lower, "pessimo") ||
		strings.Contains(lower, "horrível") || strings.Contains(lower, "horrivel") {
		return 1
	}
	if strings.Contains(lower, "bom") || strings.Contains(lower, "boa") || strings.Contains(lower, "gostei") || strings.Contains(lower, "satisfeito") {
		return 4
	}
	if strings.Contains(lower, "regular") || strings.Contains(lower, "médio") || strings.Contains(lower, "medio") || strings.Contains(lower, "mais ou menos") {
		return 3
	}
	if strings.Contains(lower, "ruim") {
		return 2
	}

	// 6. Regex para capturar dígito 1 a 5 isolado no texto (ex: "nota 5", "5 estrelas", "opção 5")
	re := regexp.MustCompile(`\b([1-5])\b`)
	match := re.FindStringSubmatch(clean)
	if len(match) > 1 {
		return int(match[1][0] - '0')
	}

	return 0
}

// extractEvolutionMessageContent extrai com precisão o conteúdo de texto, emoji, reação ou mídia do Evolution API
func extractEvolutionMessageContent(msgData map[string]interface{}) string {
	if msgData == nil {
		return ""
	}

	// 1. Mensagens temporárias ou visualização única
	if eph, ok := msgData["ephemeralMessage"].(map[string]interface{}); ok {
		if inner, ok := eph["message"].(map[string]interface{}); ok {
			return extractEvolutionMessageContent(inner)
		}
	}
	if vo, ok := msgData["viewOnceMessage"].(map[string]interface{}); ok {
		if inner, ok := vo["message"].(map[string]interface{}); ok {
			return extractEvolutionMessageContent(inner)
		}
	}
	if vo2, ok := msgData["viewOnceMessageV2"].(map[string]interface{}); ok {
		if inner, ok := vo2["message"].(map[string]interface{}); ok {
			return extractEvolutionMessageContent(inner)
		}
	}
	if docWithCap, ok := msgData["documentWithCaptionMessage"].(map[string]interface{}); ok {
		if inner, ok := docWithCap["message"].(map[string]interface{}); ok {
			return extractEvolutionMessageContent(inner)
		}
	}

	// 2. Mensagem de texto simples
	if text, ok := msgData["conversation"].(string); ok && text != "" {
		return text
	}

	// 3. Mensagem de texto estendida
	if ext, ok := msgData["extendedTextMessage"].(map[string]interface{}); ok {
		if text, ok := ext["text"].(string); ok && text != "" {
			return text
		}
	}

	// 4. Reação / Emotion (reactionMessage)
	if reaction, ok := msgData["reactionMessage"].(map[string]interface{}); ok {
		if text, ok := reaction["text"].(string); ok && text != "" {
			return fmt.Sprintf("Reagiu com %s", text)
		}
	}

	// 5. Imagem
	if img, ok := msgData["imageMessage"].(map[string]interface{}); ok {
		if cap, ok := img["caption"].(string); ok && cap != "" {
			return fmt.Sprintf("📷 [Imagem]: %s", cap)
		}
		return "📷 [Imagem recebida]"
	}

	// 6. Figurinha / Sticker
	if _, ok := msgData["stickerMessage"].(map[string]interface{}); ok {
		return "🖼️ [Figurinha recebida]"
	}

	// 7. Documento
	if doc, ok := msgData["documentMessage"].(map[string]interface{}); ok {
		docName, _ := doc["fileName"].(string)
		if docName == "" {
			docName, _ = doc["title"].(string)
		}
		if cap, ok := doc["caption"].(string); ok && cap != "" {
			if docName != "" {
				return fmt.Sprintf("📄 [Documento - %s]: %s", docName, cap)
			}
			return fmt.Sprintf("📄 [Documento]: %s", cap)
		}
		if docName != "" {
			return fmt.Sprintf("📄 [Documento: %s]", docName)
		}
		return "📄 [Documento recebido]"
	}

	// 8. Áudio
	if _, ok := msgData["audioMessage"].(map[string]interface{}); ok {
		return "🎤 [Mensagem de áudio recebida]"
	}

	// 9. Vídeo
	if vid, ok := msgData["videoMessage"].(map[string]interface{}); ok {
		if cap, ok := vid["caption"].(string); ok && cap != "" {
			return fmt.Sprintf("🎥 [Vídeo]: %s", cap)
		}
		return "🎥 [Vídeo recebido]"
	}

	// 10. Contato
	if _, ok := msgData["contactMessage"].(map[string]interface{}); ok {
		return "👤 [Contato compartilhado]"
	}
	if _, ok := msgData["contactsArrayMessage"].(map[string]interface{}); ok {
		return "👥 [Contatos compartilhados]"
	}

	// 11. Localização
	if _, ok := msgData["locationMessage"].(map[string]interface{}); ok {
		return "📍 [Localização compartilhada]"
	}

	return ""
}

// ProcessTelegramWebhook processa mensagens recebidas do Telegram
func (s *ChannelService) ProcessTelegramWebhook(body []byte) error {
	var update struct {
		UpdateID int64 `json:"update_id"`
		Message  *struct {
			MessageID int64 `json:"message_id"`
			From      struct {
				ID        int64  `json:"id"`
				FirstName string `json:"first_name"`
				LastName  string `json:"last_name"`
				Username  string `json:"username"`
			} `json:"from"`
			Chat struct {
				ID        int64  `json:"id"`
				FirstName string `json:"first_name"`
				Title     string `json:"title"`
				Type      string `json:"type"`
			} `json:"chat"`
			Date int64  `json:"date"`
			Text string `json:"text"`
		} `json:"message"`
	}

	if err := json.Unmarshal(body, &update); err != nil {
		return err
	}

	if update.Message == nil || strings.TrimSpace(update.Message.Text) == "" {
		return nil
	}

	chatIDStr := fmt.Sprintf("%d", update.Message.Chat.ID)
	senderName := strings.TrimSpace(update.Message.From.FirstName + " " + update.Message.From.LastName)
	if senderName == "" {
		senderName = update.Message.From.Username
	}
	if senderName == "" {
		senderName = "Usuário Telegram"
	}

	// 1. Procura conversa ativa deste cliente no canal telegram
	var conv *models.Conversation
	if s.db != nil {
		conv, _ = s.db.GetActiveConversationByChannel("telegram", chatIDStr)
	}

	now := time.Now().UTC()

	// 2. Se não existir conversa em andamento, abre novo atendimento
	isNew := false
	if conv == nil {
		isNew = true
		convID := "conv-tg-" + uuid.New().String()[:8]
		conv = &models.Conversation{
			ID:          convID,
			ClientID:    "tg-" + chatIDStr,
			ClientName:  senderName,
			ContactName: senderName,
			Department:  "Suporte Técnico",
			Status:      models.ConvWaiting,
			Channel:     "telegram",
			ChannelID:   chatIDStr,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if s.db != nil {
			_ = s.db.UpsertConversation(conv)
		}
	} else {
		conv.UpdatedAt = now
		if s.db != nil {
			_ = s.db.UpsertConversation(conv)
		}
	}

	if s.chatService != nil {
		s.chatService.UpsertMemoryConversation(conv)
	}

	// 3. Salva a mensagem recebida
	msg := &models.Message{
		ID:             fmt.Sprintf("msg-tg-%d", update.Message.MessageID),
		ConversationID: conv.ID,
		SenderID:       "tg-" + chatIDStr,
		SenderType:     models.SenderClient,
		SenderName:     senderName,
		Content:        update.Message.Text,
		Timestamp:      now.Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}

	if err := s.chatService.SaveMessage(msg); err != nil {
		log.Printf("[TELEGRAM] Erro ao salvar mensagem: %v", err)
		return err
	}

	// 4. Notifica operadores via WebSocket em tempo real
	s.mu.RLock()
	hub := s.hub
	s.mu.RUnlock()

	if hub != nil {
		if isNew {
			hub.BroadcastToOperators(&models.WSAction{
				Type:    "new_chat_waiting",
				Payload: conv,
			})
		}
		hub.BroadcastToOperators(&models.WSAction{
			Type:    "message",
			Payload: msg,
		})
		hub.BroadcastToConversation(conv.ID, &models.WSAction{
			Type:    "message",
			Payload: msg,
		})
	}

	log.Printf("📩 [TELEGRAM] Mensagem recebida de %s (%s): %s", senderName, chatIDStr, update.Message.Text)
	return nil
}

// ProcessEvolutionWebhook processa mensagens recebidas do Evolution API (WhatsApp Não Oficial)
func (s *ChannelService) ProcessEvolutionWebhook(body []byte) error {
	var payload struct {
		Event    string          `json:"event"`
		Instance string          `json:"instance"`
		Data     json.RawMessage `json:"data"`
	}

	if err := json.Unmarshal(body, &payload); err != nil {
		return err
	}

	eventNormalized := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(payload.Event, "-", "."), "_", "."))
	if eventNormalized != "messages.upsert" && payload.Event != "" {
		return nil
	}

	var dataMap map[string]interface{}
	if len(payload.Data) > 0 {
		if payload.Data[0] == '[' {
			var list []map[string]interface{}
			if err := json.Unmarshal(payload.Data, &list); err == nil && len(list) > 0 {
				dataMap = list[0]
			}
		} else if payload.Data[0] == '{' {
			_ = json.Unmarshal(payload.Data, &dataMap)
		}
	}
	if dataMap == nil {
		return nil
	}

	key, _ := dataMap["key"].(map[string]interface{})
	if key == nil {
		return nil
	}

	// Ignora mensagens que o próprio bot enviou para não gerar eco
	fromMe, _ := key["fromMe"].(bool)
	if fromMe {
		return nil
	}

	remoteJid, _ := key["remoteJid"].(string)
	if remoteJid == "" || strings.HasSuffix(remoteJid, "@g.us") {
		return nil // Ignora mensagens de grupos por enquanto
	}

	// Extrai texto, emoji, reação ou mídia da mensagem de forma rica e compatível
	content := ""
	if msgData, ok := dataMap["message"].(map[string]interface{}); ok {
		content = extractEvolutionMessageContent(msgData)
	}

	if strings.TrimSpace(content) == "" {
		return nil
	}

	number := strings.ReplaceAll(remoteJid, "@s.whatsapp.net", "")
	number = strings.ReplaceAll(number, "@c.us", "")

	pushName, _ := dataMap["pushName"].(string)
	if pushName == "" {
		pushName = "WhatsApp " + number
	}

	// 1. Procura conversa ativa deste número no canal whatsapp_evolution
	var conv *models.Conversation
	if s.db != nil {
		conv, _ = s.db.GetActiveConversationByChannel("whatsapp_evolution", number)
	}

	now := time.Now().UTC()

	// 1.1 Se a conversa estiver aguardando avaliação (CSAT), processa a nota de 1 a 5
	if conv != nil && conv.Status == models.ConvWaitingRating {
		rating := ParseRatingNumber(content)
		if rating >= 1 && rating <= 5 {
			log.Printf("⭐ [CSAT EVOLUTION] Cliente %s (%s) avaliou atendimento %s com nota %d", pushName, number, conv.ID, rating)

			clientRatingMsg := &models.Message{
				ID:             "msg-wapp-rate-" + uuid.New().String()[:8],
				ConversationID: conv.ID,
				SenderID:       "wapp-" + number,
				SenderType:     models.SenderClient,
				SenderName:     pushName,
				Content:        content,
				Timestamp:      now.Format(time.RFC3339),
				Status:         models.StatusDelivered,
			}
			_ = s.chatService.SaveMessage(clientRatingMsg)

			_, _ = s.chatService.RateConversation(conv.ID, rating, content)

			thankYouText := fmt.Sprintf("Agradecemos pela sua avaliação (Nota %d)! ⭐\nSua opinião nos ajuda a melhorar cada vez mais.\n\nAtendimento finalizado com sucesso. Tenha um excelente dia!", rating)
			s.SendMessageToChannel(conv, thankYouText)

			sysThankMsg := &models.Message{
				ID:             "sys-thank-" + uuid.New().String()[:8],
				ConversationID: conv.ID,
				SenderID:       "system",
				SenderType:     models.SenderSystem,
				SenderName:     "Sistema SOL",
				Content:        thankYouText,
				Timestamp:      now.Format(time.RFC3339),
				Status:         models.StatusDelivered,
			}
			_ = s.chatService.SaveMessage(sysThankMsg)

			s.mu.RLock()
			hub := s.hub
			s.mu.RUnlock()
			if hub != nil {
				hub.BroadcastToOperators(&models.WSAction{
					Type:    "conversation_updated",
					Payload: conv,
				})
				hub.BroadcastToOperators(&models.WSAction{
					Type:    "message",
					Payload: clientRatingMsg,
				})
				hub.BroadcastToOperators(&models.WSAction{
					Type:    "message",
					Payload: sysThankMsg,
				})
			}
			return nil
		} else {
			reminderText := "O atendimento já foi encerrado pelo atendente.\n\nPara registrar sua avaliação, por favor responda apenas com uma nota de 1 a 5 (onde 1 é Muito Ruim e 5 é Excelente)."
			s.SendMessageToChannel(conv, reminderText)
			return nil
		}
	}

	isNew := false

	if conv == nil {
		isNew = true
		convID := "conv-wapp-" + uuid.New().String()[:8]
		conv = &models.Conversation{
			ID:          convID,
			ClientID:    "wapp-" + number,
			ClientName:  pushName,
			ContactName: pushName,
			Department:  "Suporte Técnico",
			Status:      models.ConvWaiting,
			Channel:     "whatsapp_evolution",
			ChannelID:   number,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if s.db != nil {
			_ = s.db.UpsertConversation(conv)
		}
	} else {
		conv.UpdatedAt = now
		if s.db != nil {
			_ = s.db.UpsertConversation(conv)
		}
	}

	if s.chatService != nil {
		s.chatService.UpsertMemoryConversation(conv)
	}

	// 2. Salva a mensagem recebida
	msgID := "msg-wapp-" + uuid.New().String()[:8]
	if idStr, ok := key["id"].(string); ok && idStr != "" {
		msgID = "wapp-" + idStr
	}

	msg := &models.Message{
		ID:             msgID,
		ConversationID: conv.ID,
		SenderID:       "wapp-" + number,
		SenderType:     models.SenderClient,
		SenderName:     pushName,
		Content:        content,
		Timestamp:      now.Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}

	if err := s.chatService.SaveMessage(msg); err != nil {
		log.Printf("[EVOLUTION] Erro ao salvar mensagem: %v", err)
		return err
	}

	// 3. Notifica operadores via WebSocket em tempo real
	s.mu.RLock()
	hub := s.hub
	s.mu.RUnlock()

	if hub != nil {
		if isNew {
			hub.BroadcastToOperators(&models.WSAction{
				Type:    "new_chat_waiting",
				Payload: conv,
			})
		}
		hub.BroadcastToOperators(&models.WSAction{
			Type:    "message",
			Payload: msg,
		})
		hub.BroadcastToConversation(conv.ID, &models.WSAction{
			Type:    "message",
			Payload: msg,
		})
	}

	log.Printf("📩 [EVOLUTION] Mensagem recebida de %s (%s): %s", pushName, number, content)
	return nil
}

// ProcessWhatsAppOfficialWebhook processa mensagens recebidas da Meta Cloud API
func (s *ChannelService) ProcessWhatsAppOfficialWebhook(body []byte) error {
	var payload struct {
		Object string `json:"object"`
		Entry  []struct {
			ID      string `json:"id"`
			Changes []struct {
				Value struct {
					MessagingProduct string `json:"messaging_product"`
					Contacts         []struct {
						Profile struct {
							Name string `json:"name"`
						} `json:"profile"`
						WaID string `json:"wa_id"`
					} `json:"contacts"`
					Messages []struct {
						From      string `json:"from"`
						ID        string `json:"id"`
						Timestamp string `json:"timestamp"`
						Type      string `json:"type"`
						Text      struct {
							Body string `json:"body"`
						} `json:"text"`
						Reaction struct {
							MessageID string `json:"message_id"`
							Emoji     string `json:"emoji"`
						} `json:"reaction"`
						Image struct {
							Caption string `json:"caption"`
						} `json:"image"`
						Document struct {
							Filename string `json:"filename"`
							Caption  string `json:"caption"`
						} `json:"document"`
						Button struct {
							Text string `json:"text"`
						} `json:"button"`
						Interactive struct {
							ButtonReply struct {
								Title string `json:"title"`
							} `json:"button_reply"`
							ListReply struct {
								Title string `json:"title"`
							} `json:"list_reply"`
						} `json:"interactive"`
					} `json:"messages"`
				} `json:"value"`
			} `json:"changes"`
		} `json:"entry"`
	}

	if err := json.Unmarshal(body, &payload); err != nil {
		return err
	}

	for _, entry := range payload.Entry {
		for _, change := range entry.Changes {
			val := change.Value
			contactName := "WhatsApp Oficial"
			if len(val.Contacts) > 0 && val.Contacts[0].Profile.Name != "" {
				contactName = val.Contacts[0].Profile.Name
			}

			for _, m := range val.Messages {
				content := ""
				switch m.Type {
				case "text":
					content = m.Text.Body
				case "reaction":
					if m.Reaction.Emoji != "" {
						content = fmt.Sprintf("Reagiu com %s", m.Reaction.Emoji)
					}
				case "image":
					if m.Image.Caption != "" {
						content = fmt.Sprintf("📷 [Imagem]: %s", m.Image.Caption)
					} else {
						content = "📷 [Imagem recebida]"
					}
				case "document":
					if m.Document.Caption != "" {
						content = fmt.Sprintf("📄 [Documento]: %s", m.Document.Caption)
					} else if m.Document.Filename != "" {
						content = fmt.Sprintf("📄 [Documento: %s]", m.Document.Filename)
					} else {
						content = "📄 [Documento recebido]"
					}
				case "audio":
					content = "🎤 [Mensagem de áudio recebida]"
				case "video":
					content = "🎥 [Vídeo recebido]"
				case "sticker":
					content = "🖼️ [Figurinha recebida]"
				case "button":
					content = m.Button.Text
				case "interactive":
					if m.Interactive.ButtonReply.Title != "" {
						content = m.Interactive.ButtonReply.Title
					} else if m.Interactive.ListReply.Title != "" {
						content = m.Interactive.ListReply.Title
					}
				default:
					if m.Text.Body != "" {
						content = m.Text.Body
					}
				}

				if strings.TrimSpace(content) == "" {
					continue
				}

				number := m.From
				var conv *models.Conversation
				if s.db != nil {
					conv, _ = s.db.GetActiveConversationByChannel("whatsapp_official", number)
				}

				now := time.Now().UTC()

				// Se a conversa estiver aguardando avaliação (CSAT), processa a nota de 1 a 5
				if conv != nil && conv.Status == models.ConvWaitingRating {
					rating := ParseRatingNumber(content)
					if rating >= 1 && rating <= 5 {
						log.Printf("⭐ [CSAT OFICIAL] Cliente %s (%s) avaliou atendimento %s com nota %d", contactName, number, conv.ID, rating)

						clientRatingMsg := &models.Message{
							ID:             "msg-waoff-rate-" + uuid.New().String()[:8],
							ConversationID: conv.ID,
							SenderID:       "waoff-" + number,
							SenderType:     models.SenderClient,
							SenderName:     contactName,
							Content:        content,
							Timestamp:      now.Format(time.RFC3339),
							Status:         models.StatusDelivered,
						}
						_ = s.chatService.SaveMessage(clientRatingMsg)

						_, _ = s.chatService.RateConversation(conv.ID, rating, content)

						thankYouText := fmt.Sprintf("Agradecemos pela sua avaliação (Nota %d)! ⭐\nSua opinião nos ajuda a melhorar cada vez mais.\n\nAtendimento finalizado com sucesso. Tenha um excelente dia!", rating)
						s.SendMessageToChannel(conv, thankYouText)

						sysThankMsg := &models.Message{
							ID:             "sys-thank-" + uuid.New().String()[:8],
							ConversationID: conv.ID,
							SenderID:       "system",
							SenderType:     models.SenderSystem,
							SenderName:     "Sistema SOL",
							Content:        thankYouText,
							Timestamp:      now.Format(time.RFC3339),
							Status:         models.StatusDelivered,
						}
						_ = s.chatService.SaveMessage(sysThankMsg)

						s.mu.RLock()
						hub := s.hub
						s.mu.RUnlock()
						if hub != nil {
							hub.BroadcastToOperators(&models.WSAction{
								Type:    "conversation_updated",
								Payload: conv,
							})
							hub.BroadcastToOperators(&models.WSAction{
								Type:    "message",
								Payload: clientRatingMsg,
							})
							hub.BroadcastToOperators(&models.WSAction{
								Type:    "message",
								Payload: sysThankMsg,
							})
						}
						continue
					} else {
						reminderText := "O atendimento já foi encerrado pelo atendente.\n\nPara registrar sua avaliação, por favor responda apenas com uma nota de 1 a 5 (onde 1 é Muito Ruim e 5 é Excelente)."
						s.SendMessageToChannel(conv, reminderText)
						continue
					}
				}

				isNew := false

				if conv == nil {
					isNew = true
					convID := "conv-waoff-" + uuid.New().String()[:8]
					conv = &models.Conversation{
						ID:          convID,
						ClientID:    "waoff-" + number,
						ClientName:  contactName,
						ContactName: contactName,
						Department:  "Suporte Técnico",
						Status:      models.ConvWaiting,
						Channel:     "whatsapp_official",
						ChannelID:   number,
						CreatedAt:   now,
						UpdatedAt:   now,
					}
					if s.db != nil {
						_ = s.db.UpsertConversation(conv)
					}
				} else {
					conv.UpdatedAt = now
					if s.db != nil {
						_ = s.db.UpsertConversation(conv)
					}
				}

				if s.chatService != nil {
					s.chatService.UpsertMemoryConversation(conv)
				}

				msg := &models.Message{
					ID:             "waoff-" + m.ID,
					ConversationID: conv.ID,
					SenderID:       "waoff-" + number,
					SenderType:     models.SenderClient,
					SenderName:     contactName,
					Content:        m.Text.Body,
					Timestamp:      now.Format(time.RFC3339),
					Status:         models.StatusDelivered,
				}

				_ = s.chatService.SaveMessage(msg)

				s.mu.RLock()
				hub := s.hub
				s.mu.RUnlock()

				if hub != nil {
					if isNew {
						hub.BroadcastToOperators(&models.WSAction{
							Type:    "new_chat_waiting",
							Payload: conv,
						})
					}
					hub.BroadcastToOperators(&models.WSAction{
						Type:    "message",
						Payload: msg,
					})
					hub.BroadcastToConversation(conv.ID, &models.WSAction{
						Type:    "message",
						Payload: msg,
					})
				}

				log.Printf("📩 [WHATSAPP OFICIAL] Mensagem recebida de %s (%s): %s", contactName, number, m.Text.Body)
			}
		}
	}

	return nil
}

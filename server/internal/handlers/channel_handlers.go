package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"chat-interno-server/internal/models"
)

// HandleGetChannelsConfig retorna as configurações de todos os canais de atendimento
func (h *Handler) HandleGetChannelsConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.channelService.GetChannelsConfig()
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao carregar configurações de canais"})
		return
	}
	h.respondJSON(w, http.StatusOK, cfg)
}

// ==========================================
// TELEGRAM HANDLERS
// ==========================================

func (h *Handler) HandleSaveTelegramConfig(w http.ResponseWriter, r *http.Request) {
	var body models.TelegramConfig
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	if err := h.channelService.SaveTelegramConfig(&body); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao salvar configuração do Telegram"})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Configuração do Telegram salva com sucesso!",
		"config":  body,
	})
}

func (h *Handler) HandleTestTelegram(w http.ResponseWriter, r *http.Request) {
	var body struct {
		BotToken string `json:"botToken"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	info, err := h.channelService.TestTelegram(body.BotToken)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"bot":     info,
	})
}

func (h *Handler) HandleSetupTelegramWebhook(w http.ResponseWriter, r *http.Request) {
	var body struct {
		BotToken   string `json:"botToken"`
		WebhookURL string `json:"webhookUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	if err := h.channelService.SetupTelegramWebhook(body.BotToken, body.WebhookURL); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Webhook do Telegram configurado com sucesso!",
	})
}

// HandleTelegramWebhook recebe atualizações enviadas pelos servidores do Telegram
func (h *Handler) HandleTelegramWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	if err := h.channelService.ProcessTelegramWebhook(body); err != nil {
		log.Printf("[TELEGRAM WEBHOOK ERROR] %v", err)
	}

	// Telegram sempre espera 200 OK para confirmar entrega
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

// ==========================================
// WHATSAPP OFICIAL (META CLOUD API) HANDLERS
// ==========================================

func (h *Handler) HandleSaveWhatsAppOfficialConfig(w http.ResponseWriter, r *http.Request) {
	var body models.WhatsAppOfficialConfig
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	if err := h.channelService.SaveWhatsAppOfficialConfig(&body); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao salvar configuração do WhatsApp Oficial"})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Configuração da Meta Cloud API salva com sucesso!",
		"config":  body,
	})
}

func (h *Handler) HandleTestWhatsAppOfficial(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PhoneNumberID string `json:"phoneNumberId"`
		AccessToken   string `json:"accessToken"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	if err := h.channelService.TestWhatsAppOfficial(body.PhoneNumberID, body.AccessToken); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Conexão com a Meta Cloud API verificada com sucesso!",
	})
}

// HandleGetWhatsAppTemplates retorna os templates autorizados para a Meta Cloud API
func (h *Handler) HandleGetWhatsAppTemplates(w http.ResponseWriter, r *http.Request) {
	templates, err := h.channelService.GetWhatsAppOfficialTemplates()
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao listar templates"})
		return
	}
	h.respondJSON(w, http.StatusOK, templates)
}

// HandleWhatsAppOfficialWebhookVerify responde ao handshake de verificação do Webhook da Meta
func (h *Handler) HandleWhatsAppOfficialWebhookVerify(w http.ResponseWriter, r *http.Request) {
	mode := r.URL.Query().Get("hub.mode")
	token := r.URL.Query().Get("hub.verify_token")
	challenge := r.URL.Query().Get("hub.challenge")

	cfg, _ := h.channelService.GetChannelsConfig()
	expectedToken := "sol_whatsapp_verify_token"
	if cfg != nil && cfg.WhatsAppOfficial.VerifyToken != "" {
		expectedToken = cfg.WhatsAppOfficial.VerifyToken
	}

	if mode == "subscribe" && token == expectedToken {
		log.Printf("✅ [META WEBHOOK VERIFY] Desafio validado com sucesso")
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(challenge))
		return
	}

	log.Printf("❌ [META WEBHOOK VERIFY] Token de verificação inválido: recebido=%s esperado=%s", token, expectedToken)
	w.WriteHeader(http.StatusForbidden)
}

// HandleWhatsAppOfficialWebhook recebe mensagens enviadas pela Meta Cloud API
func (h *Handler) HandleWhatsAppOfficialWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	if err := h.channelService.ProcessWhatsAppOfficialWebhook(body); err != nil {
		log.Printf("[META WEBHOOK ERROR] %v", err)
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("EVENT_RECEIVED"))
}

// ==========================================
// WHATSAPP EVOLUTION API HANDLERS
// ==========================================

func (h *Handler) HandleSaveEvolutionConfig(w http.ResponseWriter, r *http.Request) {
	var body models.WhatsAppEvolutionConfig
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	if strings.TrimSpace(body.ServerURL) == "" {
		body.ServerURL = "http://45.166.31.237:8080"
	}
	if strings.TrimSpace(body.ApiKey) == "" {
		body.ApiKey = "rr66oi90rr66oi90"
	}

	if err := h.channelService.SaveEvolutionConfig(&body); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao salvar configuração do Evolution API"})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Configuração do Evolution API salva com sucesso!",
		"config":  body,
	})
}

func (h *Handler) HandleFetchEvolutionInstances(w http.ResponseWriter, r *http.Request) {
	cfg, _ := h.channelService.GetChannelsConfig()
	serverURL := "http://45.166.31.237:8080"
	apiKey := "rr66oi90rr66oi90"
	if cfg != nil {
		if cfg.WhatsAppEvolution.ServerURL != "" {
			serverURL = cfg.WhatsAppEvolution.ServerURL
		}
		if cfg.WhatsAppEvolution.ApiKey != "" {
			apiKey = cfg.WhatsAppEvolution.ApiKey
		}
	}

	// Permite override via query params para testes dinâmicos
	if s := r.URL.Query().Get("serverUrl"); s != "" {
		serverURL = s
	}
	if k := r.URL.Query().Get("apiKey"); k != "" {
		apiKey = k
	}

	instances, err := h.channelService.FetchEvolutionInstances(serverURL, apiKey)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, instances)
}

func (h *Handler) HandleCreateEvolutionInstance(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerURL    string `json:"serverUrl"`
		ApiKey       string `json:"apiKey"`
		InstanceName string `json:"instanceName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	inst, err := h.channelService.CreateEvolutionInstance(body.ServerURL, body.ApiKey, body.InstanceName)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"instance": inst,
	})
}

func (h *Handler) HandleGetEvolutionQRCode(w http.ResponseWriter, r *http.Request) {
	instanceName := chi.URLParam(r, "name")
	if instanceName == "" {
		instanceName = r.URL.Query().Get("instance")
	}
	if instanceName == "" {
		instanceName = "solprovedorgroup"
	}

	cfg, _ := h.channelService.GetChannelsConfig()
	serverURL := "http://45.166.31.237:8080"
	apiKey := "rr66oi90rr66oi90"
	if cfg != nil {
		if cfg.WhatsAppEvolution.ServerURL != "" {
			serverURL = cfg.WhatsAppEvolution.ServerURL
		}
		if cfg.WhatsAppEvolution.ApiKey != "" {
			apiKey = cfg.WhatsAppEvolution.ApiKey
		}
	}

	result, err := h.channelService.GetEvolutionQRCode(serverURL, apiKey, instanceName)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, result)
}

func (h *Handler) HandleLogoutEvolutionInstance(w http.ResponseWriter, r *http.Request) {
	instanceName := chi.URLParam(r, "name")
	if instanceName == "" {
		instanceName = r.URL.Query().Get("instance")
	}
	if instanceName == "" {
		var body struct {
			InstanceName string `json:"instanceName"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		instanceName = body.InstanceName
	}
	if instanceName == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Nome da instância é obrigatório"})
		return
	}

	cfg, _ := h.channelService.GetChannelsConfig()
	serverURL := "http://45.166.31.237:8080"
	apiKey := "rr66oi90rr66oi90"
	if cfg != nil {
		if cfg.WhatsAppEvolution.ServerURL != "" {
			serverURL = cfg.WhatsAppEvolution.ServerURL
		}
		if cfg.WhatsAppEvolution.ApiKey != "" {
			apiKey = cfg.WhatsAppEvolution.ApiKey
		}
	}

	if err := h.channelService.LogoutEvolutionInstance(serverURL, apiKey, instanceName); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Instância %s desconectada com sucesso. Um novo QR Code pode ser gerado agora.", instanceName),
	})
}

func (h *Handler) HandleDeleteEvolutionInstance(w http.ResponseWriter, r *http.Request) {
	instanceName := chi.URLParam(r, "name")
	if instanceName == "" {
		instanceName = r.URL.Query().Get("instance")
	}
	if instanceName == "" {
		var body struct {
			InstanceName string `json:"instanceName"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		instanceName = body.InstanceName
	}
	if instanceName == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Nome da instância é obrigatório"})
		return
	}

	cfg, _ := h.channelService.GetChannelsConfig()
	serverURL := "http://45.166.31.237:8080"
	apiKey := "rr66oi90rr66oi90"
	if cfg != nil {
		if cfg.WhatsAppEvolution.ServerURL != "" {
			serverURL = cfg.WhatsAppEvolution.ServerURL
		}
		if cfg.WhatsAppEvolution.ApiKey != "" {
			apiKey = cfg.WhatsAppEvolution.ApiKey
		}
	}

	if err := h.channelService.DeleteEvolutionInstance(serverURL, apiKey, instanceName); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Instância %s excluída com sucesso.", instanceName),
	})
}

func (h *Handler) HandleSetupEvolutionWebhook(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerURL    string `json:"serverUrl"`
		ApiKey       string `json:"apiKey"`
		InstanceName string `json:"instanceName"`
		WebhookURL   string `json:"webhookUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	if err := h.channelService.SetupEvolutionWebhook(body.ServerURL, body.ApiKey, body.InstanceName, body.WebhookURL); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Webhook registrado com sucesso no Evolution API!",
	})
}

// HandleEvolutionWebhook recebe notificações de mensagens recebidas do Evolution API
func (h *Handler) HandleEvolutionWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	log.Printf("📥 [EVOLUTION WEBHOOK HTTP] Requisição recebida em %s (%d bytes)", r.URL.Path, len(body))

	if err := h.channelService.ProcessEvolutionWebhook(body); err != nil {
		log.Printf("[EVOLUTION WEBHOOK ERROR] %v", err)
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

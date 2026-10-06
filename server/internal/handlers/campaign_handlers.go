package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"chat-interno-server/internal/models"
)

// HandleRegisterDevice vincula ou atualiza o aparelho móvel do cliente ao seu CPF
func (h *Handler) HandleRegisterDevice(w http.ResponseWriter, r *http.Request) {
	var body models.DeviceRegistration
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if body.DeviceID == "" && body.CpfCnpj == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "deviceId ou cpfCnpj é obrigatório"})
		return
	}

	dev, err := h.campaignService.RegisterDevice(body)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"device":  dev,
	})
}

// HandleListDevices lista todos os dispositivos cadastrados no sistema
func (h *Handler) HandleListDevices(w http.ResponseWriter, r *http.Request) {
	devices := h.campaignService.ListDevices()
	h.respondJSON(w, http.StatusOK, devices)
}

// HandleListCampaigns lista todas as campanhas de disparo
func (h *Handler) HandleListCampaigns(w http.ResponseWriter, r *http.Request) {
	campaigns := h.campaignService.ListCampaigns()
	h.respondJSON(w, http.StatusOK, campaigns)
}

// HandleSaveCampaign cria ou atualiza uma campanha
func (h *Handler) HandleSaveCampaign(w http.ResponseWriter, r *http.Request) {
	var camp models.Campaign
	if err := json.NewDecoder(r.Body).Decode(&camp); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	saved, err := h.campaignService.SaveCampaign(&camp)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, saved)
}

// HandleDispatchCampaign dispara a campanha em massa para os clientes do público-alvo
func (h *Handler) HandleDispatchCampaign(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID da campanha é obrigatório"})
		return
	}

	res, notifs, err := h.campaignService.DispatchCampaign(id)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Notifica via WebSocket em tempo real para os clientes conectados
	for _, notif := range notifs {
		wsAct := &models.WSAction{
			Type:    "campaign_notification",
			Payload: notif,
		}
		if notif.CpfCnpj != "" {
			h.hub.BroadcastToClientCpf(notif.CpfCnpj, wsAct)
		}
	}

	// Broadcast geral para qualquer cliente com app aberto
	if len(notifs) > 0 {
		h.hub.BroadcastAll(&models.WSAction{
			Type:    "campaign_notification",
			Payload: notifs[0],
		})
	}

	h.respondJSON(w, http.StatusOK, res)
}

// HandleGetClientNotifications retorna notificações pendentes para o cliente
func (h *Handler) HandleGetClientNotifications(w http.ResponseWriter, r *http.Request) {
	cpf := r.URL.Query().Get("cpf")
	if cpf == "" {
		cpf = r.URL.Query().Get("cpfCnpj")
	}
	deviceId := r.URL.Query().Get("deviceId")

	notifs := h.campaignService.GetClientNotifications(cpf, deviceId)
	h.respondJSON(w, http.StatusOK, notifs)
}

// HandleMarkNotificationRead marca notificação como lida
func (h *Handler) HandleMarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID da notificação é obrigatório"})
		return
	}

	if err := h.campaignService.MarkNotificationRead(id); err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]string{"message": "Notificação marcada como lida"})
}

// HandleStartChatFromNotification inicia um atendimento contextualizado a partir de uma campanha
func (h *Handler) HandleStartChatFromNotification(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		ClientID    string `json:"clientId"`
		ClientName  string `json:"clientName"`
		ContactName string `json:"contactName"`
		CpfCnpj     string `json:"cpfCnpj"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	// Busca a notificação para extrair departamento e mensagem inicial
	notifs := h.campaignService.GetClientNotifications(body.CpfCnpj, "")
	var targetNotif *models.ClientNotification
	for _, n := range notifs {
		if n.ID == id {
			targetNotif = n
			break
		}
	}

	dept := "Atendimento Geral"
	initialMsg := "Olá! Gostaria de falar com um atendente sobre o comunicado recente."
	if targetNotif != nil {
		if targetNotif.Department != "" {
			dept = targetNotif.Department
		}
		if targetNotif.ChatInitialMsg != "" {
			initialMsg = targetNotif.ChatInitialMsg
		} else {
			initialMsg = fmt.Sprintf("Olá! Recebi a notificação sobre \"%s\" e gostaria de atendimento.", targetNotif.Title)
		}
		_ = h.campaignService.MarkNotificationRead(id)
	}

	// Cria o novo atendimento
	conv, err := h.chatService.CreateConversation(models.StartChatRequest{
		ClientID:    body.ClientID,
		ClientName:  body.ClientName,
		ContactName: body.ContactName,
		CpfCnpj:     body.CpfCnpj,
		Department:  dept,
	})
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Adiciona a primeira mensagem contextual do cliente
	firstMsg := &models.Message{
		ID:             "msg-" + uuid.New().String()[:8],
		ConversationID: conv.ID,
		SenderID:       conv.ClientID,
		SenderType:     models.SenderClient,
		SenderName:     conv.ContactName,
		Content:        initialMsg,
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		Status:         models.StatusDelivered,
	}
	_ = h.chatService.SaveMessage(firstMsg)

	// Notifica operadores instantaneamente via WebSocket
	h.hub.BroadcastToOperators(&models.WSAction{
		Type:    "new_chat_waiting",
		Payload: conv,
	})

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"conversationId": conv.ID,
		"conversation":   conv,
		"initialMessage": firstMsg,
	})
}

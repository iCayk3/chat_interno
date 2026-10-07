package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// ExpoPushMessage define o formato exigido pela API oficial de Push do Expo (APNs / FCM)
type ExpoPushMessage struct {
	To        string                 `json:"to"`
	Title     string                 `json:"title"`
	Body      string                 `json:"body"`
	Sound     string                 `json:"sound,omitempty"`
	Priority  string                 `json:"priority,omitempty"`
	ChannelID string                 `json:"channelId,omitempty"`
	Badge     int                    `json:"badge,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
}

type PushService struct {
	httpClient *http.Client
	apiURL     string
}

func NewPushService() *PushService {
	return &PushService{
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		apiURL: "https://exp.host/--/api/v2/push/send",
	}
}

// IsExpoPushToken valida se o token possui o formato oficial do Expo Push
func IsExpoPushToken(token string) bool {
	t := strings.TrimSpace(token)
	return strings.HasPrefix(t, "ExponentPushToken[") || strings.HasPrefix(t, "ExpoPushToken[")
}

// SendPushToTokens dispara notificações push para múltiplos tokens de celulares de forma concorrente e sem travar a requisição
func (s *PushService) SendPushToTokens(tokens []string, title, body, channelID string, data map[string]interface{}) {
	if len(tokens) == 0 {
		return
	}

	validTokens := make([]string, 0, len(tokens))
	for _, t := range tokens {
		tClean := strings.TrimSpace(t)
		if IsExpoPushToken(tClean) {
			validTokens = append(validTokens, tClean)
		}
	}

	if len(validTokens) == 0 {
		log.Printf("[PUSH] Nenhum token Expo válido entre os %d aparelhos informados.", len(tokens))
		return
	}

	// Executa em goroutine para envio assíncrono e instantâneo
	go func(targetTokens []string) {
		messages := make([]ExpoPushMessage, 0, len(targetTokens))
		for _, tok := range targetTokens {
			messages = append(messages, ExpoPushMessage{
				To:        tok,
				Title:     title,
				Body:      body,
				Sound:     "default",
				Priority:  "high",
				ChannelID: channelID,
				Badge:     1,
				Data:      data,
			})
		}

		// Envia em lotes de até 100 mensagens (limite da API do Expo)
		chunkSize := 100
		for i := 0; i < len(messages); i += chunkSize {
			end := i + chunkSize
			if end > len(messages) {
				end = len(messages)
			}
			chunk := messages[i:end]
			s.sendBatch(chunk)
		}
	}(validTokens)
}

func (s *PushService) sendBatch(messages []ExpoPushMessage) {
	payloadBytes, err := json.Marshal(messages)
	if err != nil {
		log.Printf("[PUSH ERROR] Falha ao serializar lote de push: %v", err)
		return
	}

	req, err := http.NewRequest(http.MethodPost, s.apiURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		log.Printf("[PUSH ERROR] Falha ao criar requisição HTTP: %v", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Encoding", "gzip, deflate")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Printf("[PUSH ERROR] Falha ao enviar requisição para Expo Push Service: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("[PUSH SUCCESS] %d notificação(ões) push enviada(s) com sucesso para os aparelhos!", len(messages))
	} else {
		log.Printf("[PUSH WARN] Expo Push retornou HTTP status %d", resp.StatusCode)
	}
}

// SendCampaignPush envia notificação de campanha em massa para os aparelhos
func (s *PushService) SendCampaignPush(tokens []string, title, message string, data map[string]interface{}) {
	s.SendPushToTokens(tokens, title, message, "sol-campaigns", data)
}

// SendChatMessagePush envia notificação de nova mensagem no chat do operador para o cliente
func (s *PushService) SendChatMessagePush(token, senderName, messageText, conversationID string) {
	title := fmt.Sprintf("SOL Atendimento - %s", senderName)
	data := map[string]interface{}{
		"type":           "chat_message",
		"conversationId": conversationID,
		"senderName":     senderName,
	}
	s.SendPushToTokens([]string{token}, title, messageText, "sol-chat", data)
}

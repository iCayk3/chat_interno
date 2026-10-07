package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"chat-interno-server/internal/models"
)

// HandleSearchConversations realiza a busca avançada e auditoria de atendimentos com múltiplos filtros
func (h *Handler) HandleSearchConversations(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	filter := models.SearchConversationsFilter{
		OperatorID: strings.TrimSpace(q.Get("operatorId")),
		Department: strings.TrimSpace(q.Get("department")),
		RbxGroup:   strings.TrimSpace(q.Get("rbxGroup")),
		Status:     strings.TrimSpace(q.Get("status")),
		SearchTerm: strings.TrimSpace(q.Get("search")),
		Limit:      20,
		Offset:     0,
	}

	if filter.SearchTerm == "" {
		filter.SearchTerm = strings.TrimSpace(q.Get("q"))
	}

	if limitStr := q.Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			if l > 100 {
				l = 100
			}
			filter.Limit = l
		}
	}

	if offsetStr := q.Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			filter.Offset = o
		}
	}

	if ratingStr := q.Get("rating"); ratingStr != "" {
		if rt, err := strconv.Atoi(ratingStr); err == nil && rt >= 1 && rt <= 5 {
			filter.Rating = &rt
		}
	}

	if startStr := q.Get("startDate"); startStr != "" {
		if t, err := parseDateFilter(startStr, false); err == nil {
			filter.StartDate = &t
		}
	}

	if endStr := q.Get("endDate"); endStr != "" {
		if t, err := parseDateFilter(endStr, true); err == nil {
			filter.EndDate = &t
		}
	}

	resp, err := h.chatService.SearchConversations(filter)
	if err != nil {
		log.Printf("[SEARCH ERROR] Falha ao buscar atendimentos: %v", err)
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao buscar atendimentos"})
		return
	}

	h.respondJSON(w, http.StatusOK, resp)
}

// HandleGetConversationFull retorna a conversa com todos os metadados e histórico completo de mensagens
func (h *Handler) HandleGetConversationFull(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if strings.TrimSpace(id) == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID do atendimento é obrigatório"})
		return
	}

	conv, msgs, err := h.chatService.GetConversationFull(id)
	if err != nil {
		h.respondJSON(w, http.StatusNotFound, map[string]string{"error": "Atendimento não encontrado"})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"conversation": conv,
		"messages":     msgs,
	})
}

// HandleRateConversation registra a avaliação de 1 a 5 estrelas e comentário do cliente
func (h *Handler) HandleRateConversation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if strings.TrimSpace(id) == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID do atendimento é obrigatório"})
		return
	}

	var req models.RateConversationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	if req.Rating < 1 || req.Rating > 5 {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "A nota deve ser de 1 (muito ruim) a 5 (excelente)"})
		return
	}

	conv, err := h.chatService.RateConversation(id, req.Rating, req.Comment)
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Notifica operadores em tempo real
	h.hub.BroadcastToOperators(&models.WSAction{
		Type:    "conversation_rated",
		Payload: conv,
	})

	// Notifica a sala da conversa
	h.hub.BroadcastToRoom(id, &models.WSAction{
		Type: "chat_rated",
		Payload: map[string]interface{}{
			"conversationId": id,
			"rating":         req.Rating,
			"comment":        req.Comment,
		},
	}, nil)

	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":      true,
		"message":      "Avaliação registrada com sucesso! Obrigado pelo seu feedback.",
		"conversation": conv,
	})
}

// HandleGetReportSummary consolida métricas gerenciais (TMA, TME, CSAT, por departamento e atendente)
func (h *Handler) HandleGetReportSummary(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	filter := models.ReportMetricsFilter{
		Period:     strings.TrimSpace(q.Get("period")),
		Department: strings.TrimSpace(q.Get("department")),
		OperatorID: strings.TrimSpace(q.Get("operatorId")),
	}

	if filter.Period == "" {
		filter.Period = "30days"
	}

	if startStr := q.Get("startDate"); startStr != "" {
		if t, err := parseDateFilter(startStr, false); err == nil {
			filter.StartDate = &t
		}
	}

	if endStr := q.Get("endDate"); endStr != "" {
		if t, err := parseDateFilter(endStr, true); err == nil {
			filter.EndDate = &t
		}
	}

	summary, err := h.chatService.GetReportsSummary(filter)
	if err != nil {
		log.Printf("[REPORTS ERROR] Falha ao consolidar relatórios: %v", err)
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Erro ao carregar métricas gerenciais"})
		return
	}

	h.respondJSON(w, http.StatusOK, summary)
}

func parseDateFilter(str string, isEnd bool) (time.Time, error) {
	str = strings.TrimSpace(str)
	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02",
	}

	for _, fmtStr := range formats {
		if t, err := time.Parse(fmtStr, str); err == nil {
			if isEnd && fmtStr == "2006-01-02" {
				// Final do dia
				return time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, 999999999, time.UTC), nil
			}
			return t.UTC(), nil
		}
	}

	return time.Time{}, strconv.ErrSyntax
}

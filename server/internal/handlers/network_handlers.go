package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"chat-interno-server/internal/models"
)

// HandleGetNetworkTree retorna a árvore completa da hierarquia FTTH
func (h *Handler) HandleGetNetworkTree(w http.ResponseWriter, r *http.Request) {
	tree, err := h.networkService.GetTree()
	if err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, tree)
}

// HandleCreateOlt cadastra uma nova OLT
func (h *Handler) HandleCreateOlt(w http.ResponseWriter, r *http.Request) {
	var olt models.NetworkOlt
	if err := json.NewDecoder(r.Body).Decode(&olt); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	created, err := h.networkService.CreateOlt(&olt)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusCreated, created)
}

// HandleUpdateOlt atualiza uma OLT
func (h *Handler) HandleUpdateOlt(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID da OLT é obrigatório"})
		return
	}

	var olt models.NetworkOlt
	if err := json.NewDecoder(r.Body).Decode(&olt); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	updated, err := h.networkService.UpdateOlt(id, &olt)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, updated)
}

// HandleDeleteOlt remove uma OLT e todos os seus filhos
func (h *Handler) HandleDeleteOlt(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID da OLT é obrigatório"})
		return
	}

	if err := h.networkService.DeleteOlt(id); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "OLT excluída com sucesso"})
}

// HandleCreateSlot adiciona um novo Slot de placa PON
func (h *Handler) HandleCreateSlot(w http.ResponseWriter, r *http.Request) {
	var slot models.NetworkSlot
	if err := json.NewDecoder(r.Body).Decode(&slot); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	created, err := h.networkService.CreateSlot(&slot)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusCreated, created)
}

// HandleUpdateSlot atualiza dados do Slot
func (h *Handler) HandleUpdateSlot(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var slot models.NetworkSlot
	if err := json.NewDecoder(r.Body).Decode(&slot); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	updated, err := h.networkService.UpdateSlot(id, &slot)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, updated)
}

// HandleDeleteSlot remove o Slot
func (h *Handler) HandleDeleteSlot(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.networkService.DeleteSlot(id); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Slot excluído com sucesso"})
}

// HandleCreatePon adiciona uma nova porta PON ao Slot
func (h *Handler) HandleCreatePon(w http.ResponseWriter, r *http.Request) {
	var pon models.NetworkPon
	if err := json.NewDecoder(r.Body).Decode(&pon); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	created, err := h.networkService.CreatePon(&pon)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusCreated, created)
}

// HandleUpdatePon atualiza dados da porta PON
func (h *Handler) HandleUpdatePon(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var pon models.NetworkPon
	if err := json.NewDecoder(r.Body).Decode(&pon); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	updated, err := h.networkService.UpdatePon(id, &pon)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, updated)
}

// HandleDeletePon remove uma porta PON
func (h *Handler) HandleDeletePon(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.networkService.DeletePon(id); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Porta PON excluída com sucesso"})
}

// HandleCreateCto adiciona uma nova CTO à porta PON
func (h *Handler) HandleCreateCto(w http.ResponseWriter, r *http.Request) {
	var cto models.NetworkCto
	if err := json.NewDecoder(r.Body).Decode(&cto); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	created, err := h.networkService.CreateCto(&cto)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusCreated, created)
}

// HandleUpdateCto atualiza uma CTO
func (h *Handler) HandleUpdateCto(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var cto models.NetworkCto
	if err := json.NewDecoder(r.Body).Decode(&cto); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	updated, err := h.networkService.UpdateCto(id, &cto)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusOK, updated)
}

// HandleDeleteCto remove uma CTO
func (h *Handler) HandleDeleteCto(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.networkService.DeleteCto(id); err != nil {
		h.respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "CTO excluída com sucesso"})
}

// HandleCreateCtosBatch cadastra 1 ou mais CTOs em lote vinculadas a uma única PON
func (h *Handler) HandleCreateCtosBatch(w http.ResponseWriter, r *http.Request) {
	var req models.CreateCtosBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload JSON inválido"})
		return
	}

	created, err := h.networkService.CreateCtosBatch(&req)
	if err != nil {
		h.respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.respondJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"count":   len(created),
		"ctos":    created,
	})
}

package handlers

import (
	_ "embed"
	"net/http"
)

//go:embed index.html
var masterDashboardHTML []byte

func (h *MasterHandler) HandleDashboard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(masterDashboardHTML)
}

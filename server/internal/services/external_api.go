package services

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// CustomerEnrichment agrega dados consultados em sistemas externos concorrentemente
type CustomerEnrichment struct {
	DocumentOrEmail string                 `json:"documentOrEmail"`
	CRMData         map[string]interface{} `json:"crmData,omitempty"`
	FinancialStatus map[string]interface{} `json:"financialStatus,omitempty"`
	OpenTickets     int                    `json:"openTickets"`
	FetchedAt       time.Time              `json:"fetchedAt"`
}

// ExternalAPIService gerencia consultas a sistemas externos (CRM, ERP, Bots)
type ExternalAPIService struct{}

func NewExternalAPIService() *ExternalAPIService {
	return &ExternalAPIService{}
}

// EnrichCustomerData demonstra consultas concorrentes ultra-rápidas usando goroutines e WaitGroup
func (e *ExternalAPIService) EnrichCustomerData(ctx context.Context, docOrEmail string) (*CustomerEnrichment, error) {
	if docOrEmail == "" {
		return nil, fmt.Errorf("identificador vazio para consulta")
	}

	enrichment := &CustomerEnrichment{
		DocumentOrEmail: docOrEmail,
		FetchedAt:       time.Now().UTC(),
	}

	var wg sync.WaitGroup
	var mu sync.Mutex

	// Consulta 1: Sistema CRM
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Simulação de chamada HTTP com timeout respeitando o context
		select {
		case <-time.After(30 * time.Millisecond):
			mu.Lock()
			enrichment.CRMData = map[string]interface{}{
				"tier":        "VIP",
				"lastContact": time.Now().Add(-48 * time.Hour).Format("2006-01-02"),
			}
			mu.Unlock()
		case <-ctx.Done():
			return
		}
	}()

	// Consulta 2: Sistema Financeiro / ERP
	wg.Add(1)
	go func() {
		defer wg.Done()
		select {
		case <-time.After(40 * time.Millisecond):
			mu.Lock()
			enrichment.FinancialStatus = map[string]interface{}{
				"status":        "Adimplente",
				"activePlan":    "Empresarial 100",
				"pendingOrders": 0,
			}
			mu.Unlock()
		case <-ctx.Done():
			return
		}
	}()

	// Consulta 3: Histórico de chamados
	wg.Add(1)
	go func() {
		defer wg.Done()
		select {
		case <-time.After(20 * time.Millisecond):
			mu.Lock()
			enrichment.OpenTickets = 1
			mu.Unlock()
		case <-ctx.Done():
			return
		}
	}()

	// Aguarda todas as consultas concorrentes terminarem
	wg.Wait()

	return enrichment, nil
}

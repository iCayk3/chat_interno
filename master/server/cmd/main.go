package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"master-license-server/internal/database"
	"master-license-server/internal/handlers"
	"master-license-server/internal/services"
)

func main() {
	log.Println("==================================================")
	log.Println("👑 Iniciando Master License Server (Super Sistema)")
	log.Println("==================================================")

	port := os.Getenv("MASTER_PORT")
	if port == "" {
		port = os.Getenv("PORT")
	}
	if port == "" {
		port = "8090"
	}

	dataFile := os.Getenv("MASTER_DATA_FILE")
	if dataFile == "" {
		dataFile = os.Getenv("DATA_FILE_PATH")
	}
	if dataFile == "" {
		dataFile = "master_data.json"
	}

	signingKey := os.Getenv("MASTER_SIGNING_KEY")
	if signingKey == "" {
		signingKey = "master-secret-signing-key-sol-telecom-2026"
	}

	adminApiKey := os.Getenv("MASTER_ADMIN_KEY") // Opcional, permite acesso aberto se vazio

	supportPhone := os.Getenv("SUPPORT_PHONE")
	if supportPhone == "" {
		supportPhone = "(11) 98765-4321"
	}

	supportEmail := os.Getenv("SUPPORT_EMAIL")
	if supportEmail == "" {
		supportEmail = "comercial@soltelecom.com.br"
	}

	// 1. Inicializa armazenamento de dados
	store, err := database.NewStore(dataFile)
	if err != nil {
		log.Fatalf("❌ Erro ao iniciar base de dados mestre: %v", err)
	}

	// 2. Inicializa serviços e handlers
	service := services.NewMasterService(store, signingKey, supportPhone, supportEmail)
	h := handlers.NewMasterHandler(service, adminApiKey)

	// 3. Router Chi com CORS permissivo para gestão centralizada
	r := chi.NewRouter()

	r.Use(chiMiddleware.RequestID)
	r.Use(chiMiddleware.RealIP)
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)

	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	})
	r.Use(corsHandler.Handler)

	// Painel Visual Master (Dashboard HTML/SPA Embutido)
	r.Get("/", h.HandleDashboard)
	r.Get("/dashboard", h.HandleDashboard)

	// Rotas Públicas para os Softwares Clientes (Handshake, Auto-Register, Heartbeats & Checkout)
	r.Route("/api/v1/licenses", func(r chi.Router) {
		r.Post("/auto-register", h.HandleAutoRegister)
		r.Post("/activate", h.HandleActivateLicense)
		r.Post("/heartbeat", h.HandleHeartbeat)
		r.Get("/plans", h.HandleGetPlanOptions)
		r.Post("/checkout", h.HandleCreateCheckout)
		r.Post("/confirm-payment", h.HandleConfirmPayment)
	})

	// Webhook do Mercado Pago no Master (Liberação Automática)
	r.Post("/api/v1/master/webhook/mercadopago", h.HandleMercadoPagoWebhook)
	r.Get("/api/v1/master/webhook/mercadopago", h.HandleMercadoPagoWebhook)

	// Rotas Administrativas do Super Sistema Master (Gestão de Clientes, Prazos e Chaves)
	r.Route("/api/v1/master", func(r chi.Router) {
		r.Use(h.AdminAuthMiddleware)

		r.Get("/tenants", h.HandleListTenants)
		r.Post("/tenants", h.HandleCreateTenant)
		r.Get("/tenants/{id}", h.HandleGetTenant)
		r.Put("/tenants/{id}/status", h.HandleUpdateTenantStatus)
		r.Put("/tenants/{id}/trial", h.HandleExtendTrial)
		r.Put("/tenants/{id}/discount", h.HandleUpdateDiscount)
		r.Put("/tenants/{id}/operation-mode", h.HandleUpdateOperationMode)
		r.Put("/tenants/{id}/billing", h.HandleUpdateBilling)
		r.Delete("/tenants/{id}", h.HandleDeleteTenant)

		r.Get("/stats", h.HandleGetStats)
		r.Get("/finance", h.HandleGetFinanceSettings)
		r.Put("/finance", h.HandleSaveFinanceSettings)
	})

	// Inicia Servidor HTTP com Graceful Shutdown
	serverAddr := fmt.Sprintf(":%s", port)
	srv := &http.Server{
		Addr:         serverAddr,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("📡 Servidor Mestre escutando na porta %s", port)
		log.Printf("🔗 Painel Visual do Administrador: http://localhost:%s/", port)
		log.Printf("🔗 Endpoint de Heartbeat:            http://localhost:%s/api/v1/licenses/heartbeat", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ Falha crítica no servidor mestre: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("🛑 Encerrando Master License Server...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("✅ Master License Server finalizado com sucesso.")
}

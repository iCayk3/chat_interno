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

	"chat-interno-server/internal/config"
	"chat-interno-server/internal/database"
	"chat-interno-server/internal/handlers"
	"chat-interno-server/internal/middleware"
	"chat-interno-server/internal/services"
	"chat-interno-server/internal/websocket"
)

func main() {
	log.Println("==================================================")
	log.Println("🚀 Iniciando Servidor Central Chat-Interno (Go)")
	log.Println("==================================================")

	// 1. Carrega configurações e variáveis de ambiente
	cfg := config.LoadConfig()

	// 2. Conecta ao banco de dados PostgreSQL (Docker)
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("❌ Erro crítico ao conectar no PostgreSQL: %v", err)
	}
	defer db.Close()

	// 3. Inicializa serviços centrais
	chatService := services.NewChatService(db)
	extService := services.NewExternalAPIService()
	authService := services.NewAuthService(db, cfg.JWTSecret)
	rbxService := services.NewRBXService(db)
	fileService := services.NewFileService("storage/temp_boletos")
	campaignService := services.NewCampaignService(db, rbxService)
	networkService := services.NewNetworkService(db)

	// 3. Inicializa e roda o Hub WebSocket
	hub := websocket.NewHub(chatService)
	go hub.Run()

	// 4. Inicializa handlers e limitadores
	h := handlers.NewHandler(chatService, extService, authService, rbxService, fileService, campaignService, networkService, db, hub, cfg.AllowedOrigins)
	rateLimiter := middleware.NewIPRateLimiter(cfg.RateLimitRPS, cfg.RateLimitBurst)

	// 5. Configura roteador Chi com middlewares de segurança
	r := chi.NewRouter()

	// Middlewares padrão e de segurança mandatórios
	r.Use(chiMiddleware.RequestID)
	r.Use(chiMiddleware.RealIP)
	r.Use(chiMiddleware.Logger)
	r.Use(middleware.SafeRecovery)                  // Regra 10: erros internos protegidos
	r.Use(middleware.SecureHeaders)                 // Proteção contra XSS / sniffing
	r.Use(middleware.SetupCORS(cfg.AllowedOrigins)) // Regra 9: CORS restritivo
	r.Use(middleware.RateLimitMiddleware(rateLimiter)) // Regra 5: Rate Limiting por IP

	// Rota do WebSocket (Handshake)
	r.Get("/ws", h.HandleWebSocket)

	// Rotas REST da API
	r.Get("/api/health", h.HandleHealth)

	// Rotas de Autenticação e Usuários (RBAC)
	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/login", h.HandleLogin)
		r.Get("/me", h.HandleGetMe)
		r.Put("/profile", h.HandleUpdateProfile)
		r.Post("/password", h.HandleChangePassword)
		r.Get("/users", h.HandleListUsers)
		r.Post("/users", h.HandleCreateUser)
		r.Put("/users/{id}", h.HandleUpdateUser)
	})

	r.Route("/api/conversations", func(r chi.Router) {
		r.Post("/", h.HandleCreateConversation)                // Iniciar novo atendimento
		r.Get("/", h.HandleListConversations)                  // Listar atendimentos (para painel operador)
		r.Post("/reset", h.HandleResetAll)                     // Encerra e limpa todo o histórico para testes do zero
		r.Get("/{id}", h.HandleGetConversation)                // Detalhes do atendimento
		r.Get("/{id}/messages", h.HandleGetMessages)           // Histórico de mensagens
		r.Put("/{id}/network", h.HandleUpdateConversationNetwork) // Atualiza OLT, PON e CTO
		r.Post("/{id}/assign", h.HandleAssignOperator)         // Operador assume atendimento
		r.Post("/{id}/close", h.HandleCloseConversation)       // Encerramento do atendimento
	})

	// Configurações do Chat, Mensagens de Encerramento e Fluxo Visual do Bot
	r.Route("/api/settings", func(r chi.Router) {
		r.Get("/", h.HandleGetSettings)
		r.Put("/", h.HandleSaveSettings)
	})

	// Registro de Dispositivos Móveis dos Clientes
	r.Route("/api/devices", func(r chi.Router) {
		r.Post("/register", h.HandleRegisterDevice)
		r.Get("/", h.HandleListDevices)
	})

	// Campanhas e Disparos em Massa (Web Operador/Gestor)
	r.Route("/api/campaigns", func(r chi.Router) {
		r.Get("/", h.HandleListCampaigns)
		r.Post("/", h.HandleSaveCampaign)
		r.Post("/{id}/dispatch", h.HandleDispatchCampaign)
	})

	// Notificações Recebidas pelos Clientes no App
	r.Route("/api/notifications", func(r chi.Router) {
		r.Get("/client", h.HandleGetClientNotifications)
		r.Post("/{id}/read", h.HandleMarkNotificationRead)
		r.Post("/{id}/start-chat", h.HandleStartChatFromNotification)
	})

	// Integração ERP RBXSoft ISP (V1 e V2)
	r.Route("/api/erp/rbx", func(r chi.Router) {
		r.Get("/customer", h.HandleRBXCustomerLookup)
		r.Get("/financial", h.HandleRBXFinancial)
		r.Get("/groups", h.HandleRBXGetGroups)                    // Consulta Grupos de Clientes do RBX
		r.Get("/groups/{code}/clients", h.HandleRBXGetGroupClients) // Consulta Clientes por Grupo no RBX
		r.Post("/pix", h.HandleRBXPix)
		r.Post("/qrcode", h.HandleRBXQRCode)
		r.Post("/boleto", h.HandleRBXBoleto)
		r.Post("/boleto/send", h.HandleSendRBXBoleto)
		r.Post("/promessa", h.HandleRBXPromessa)
		r.Get("/config", h.HandleRBXGetConfig)
		r.Put("/config", h.HandleRBXSaveConfig)
		r.Post("/test", h.HandleRBXTestConnection)
	})

	// Gestão de Rede FTTH (OLTs -> Slots -> PONs -> CTOs)
	r.Route("/api/network", func(r chi.Router) {
		r.Get("/tree", h.HandleGetNetworkTree)
		r.Post("/olts", h.HandleCreateOlt)
		r.Put("/olts/{id}", h.HandleUpdateOlt)
		r.Delete("/olts/{id}", h.HandleDeleteOlt)

		r.Post("/slots", h.HandleCreateSlot)
		r.Put("/slots/{id}", h.HandleUpdateSlot)
		r.Delete("/slots/{id}", h.HandleDeleteSlot)

		r.Post("/pons", h.HandleCreatePon)
		r.Put("/pons/{id}", h.HandleUpdatePon)
		r.Delete("/pons/{id}", h.HandleDeletePon)

		r.Post("/ctos", h.HandleCreateCto)
		r.Post("/ctos/batch", h.HandleCreateCtosBatch)
		r.Put("/ctos/{id}", h.HandleUpdateCto)
		r.Delete("/ctos/{id}", h.HandleDeleteCto)

		// Vínculo e consulta de OLT/PON/CTO por CPF do cliente
		r.Get("/customer", h.HandleGetCustomerNetwork)
		r.Put("/customer", h.HandleSaveCustomerNetwork)
	})

	// Download de arquivos temporários (boletos auto-excluídos após 1h)
	r.Get("/api/files/boletos/{filename}", h.HandleServeBoletoFile)

	// Consultas a APIs externas
	r.Get("/api/customers/lookup", h.HandleCustomerLookup)

	// 6. Inicialização do servidor HTTP com Graceful Shutdown
	serverAddr := fmt.Sprintf(":%s", cfg.Port)
	srv := &http.Server{
		Addr:         serverAddr,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Goroutine para executar o servidor
	go func() {
		log.Printf("📡 Servidor HTTP e WebSocket escutando na porta %s", cfg.Port)
		log.Printf("🔗 Endpoint WebSocket: ws://localhost:%s/ws", cfg.Port)
		log.Printf("🔗 Health Check:      http://localhost:%s/api/health", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ Falha crítica no servidor: %v", err)
		}
	}()

	// 7. Espera sinal do sistema para desligamento limpo
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("🛑 Encerrando servidor graciosamente...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("❌ Forçado a encerrar: %v", err)
	}

	log.Println("✅ Servidor finalizado com sucesso.")
}

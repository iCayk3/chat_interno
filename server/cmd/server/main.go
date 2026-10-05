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

	// 2. Inicializa serviços centrais
	chatService := services.NewChatService()
	extService := services.NewExternalAPIService()

	// 3. Inicializa e roda o Hub WebSocket
	hub := websocket.NewHub(chatService)
	go hub.Run()

	// 4. Inicializa handlers e limitadores
	h := handlers.NewHandler(chatService, extService, hub, cfg.AllowedOrigins)
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

	r.Route("/api/conversations", func(r chi.Router) {
		r.Post("/", h.HandleCreateConversation)         // Iniciar novo atendimento
		r.Get("/", h.HandleListConversations)           // Listar atendimentos (para painel operador)
		r.Get("/{id}", h.HandleGetConversation)         // Detalhes do atendimento
		r.Get("/{id}/messages", h.HandleGetMessages)    // Histórico de mensagens
		r.Post("/{id}/assign", h.HandleAssignOperator)  // Operador assume atendimento
		r.Post("/{id}/close", h.HandleCloseConversation)// Encerramento do atendimento
	})

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

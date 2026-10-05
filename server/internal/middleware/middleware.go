package middleware

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/cors"
	"golang.org/x/time/rate"
)

// IPвымиLimiter gerencia limitadores de taxa por IP
type IPRateLimiter struct {
	ips   map[string]*clientLimiter
	mu    sync.RWMutex
	rps   rate.Limit
	burst int
}

type clientLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func NewIPRateLimiter(rps float64, burst int) *IPRateLimiter {
	i := &IPRateLimiter{
		ips:   make(map[string]*clientLimiter),
		rps:   rate.Limit(rps),
		burst: burst,
	}

	// Rotina em background para limpar IPs inativos a cada 5 minutos (evita vazamento de memória)
	go i.cleanupVisitors()

	return i
}

func (i *IPRateLimiter) getLimiter(ip string) *rate.Limiter {
	i.mu.Lock()
	defer i.mu.Unlock()

	lim, exists := i.ips[ip]
	if !exists {
		limiter := rate.NewLimiter(i.rps, i.burst)
		i.ips[ip] = &clientLimiter{limiter: limiter, lastSeen: time.Now()}
		return limiter
	}

	lim.lastSeen = time.Now()
	return lim.limiter
}

func (i *IPRateLimiter) cleanupVisitors() {
	for {
		time.Sleep(5 * time.Minute)
		i.mu.Lock()
		for ip, client := range i.ips {
			if time.Since(client.lastSeen) > 5*time.Minute {
				delete(i.ips, ip)
			}
		}
		i.mu.Unlock()
	}
}

// RateLimitMiddleware aplica o limite por IP (Regra 5 de Segurança)
func RateLimitMiddleware(limiter *IPRateLimiter) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr
			if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
				ip = forwarded
			}

			if !limiter.getLimiter(ip).Allow() {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "Muitas requisições. Por favor, aguarde alguns instantes.",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// SecureHeaders adiciona headers de proteção contra ataques comuns
func SecureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}

// SafeRecovery recupera de pânico sem expor detalhes ao usuário (Regra 10 de Segurança)
func SafeRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				// Log interno detalhado
				log.Printf("[PANIC RECOVERED] Erro: %v | Rota: %s %s", rec, r.Method, r.URL.Path)

				// Resposta genérica segura para o cliente
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "Ocorreu um erro interno no servidor. Tente novamente mais tarde.",
				})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// SetupCORS configura as permissões de CORS de forma segura (Regra 9 de Segurança)
func SetupCORS(allowedOrigins []string) func(http.Handler) http.Handler {
	return cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	})
}

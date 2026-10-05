package config

import (
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port           string
	Environment    string
	AllowedOrigins []string
	RateLimitRPS   float64
	RateLimitBurst int
}

func LoadConfig() *Config {
	// Tenta carregar .env caso exista, mas não falha se não houver (ex: em containers)
	if err := godotenv.Load(); err != nil {
		log.Println("[INFO] Arquivo .env não encontrado, usando variáveis de ambiente do sistema")
	}

	port := getEnv("PORT", "8080")
	env := getEnv("ENV", "development")

	rawOrigins := getEnv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173,http://localhost:8081,http://127.0.0.1:8081")
	allowedOrigins := strings.Split(rawOrigins, ",")
	for i := range allowedOrigins {
		allowedOrigins[i] = strings.TrimSpace(allowedOrigins[i])
	}

	rps, err := strconv.ParseFloat(getEnv("RATE_LIMIT_RPS", "30"), 64)
	if err != nil {
		rps = 30
	}

	burst, err := strconv.Atoi(getEnv("RATE_LIMIT_BURST", "60"))
	if err != nil {
		burst = 60
	}

	return &Config{
		Port:           port,
		Environment:    env,
		AllowedOrigins: allowedOrigins,
		RateLimitRPS:   rps,
		RateLimitBurst: burst,
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

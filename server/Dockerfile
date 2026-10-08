# ==============================================================================
# Dockerfile: Backend do Chat & Atendimento (Go Server)
# ==============================================================================

# Estágio 1: Build do binário Go
FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Compilação estática com remoção de símbolos de debug para binário enxuto
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /bin/server ./cmd/server/main.go

# Estágio 2: Imagem final enxuta
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata curl \
    && addgroup -S chatuser && adduser -S chatuser -G chatuser

WORKDIR /app

COPY --from=builder /bin/server /app/server

# Diretórios para armazenamento temporário de arquivos e boletos
RUN mkdir -p /app/storage/temp_boletos && chown -R chatuser:chatuser /app

USER chatuser

ENV PORT=8080
ENV ENV=production

EXPOSE 8080

ENTRYPOINT ["/app/server"]

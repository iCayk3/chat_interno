# ==============================================================================
# Dockerfile: Master License Control Plane (SaaS Master)
# ==============================================================================

# Estágio 1: Build da aplicação em Go
FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates tzdata

COPY server/go.mod server/go.sum ./
RUN go mod download

COPY server/ .

# Compilação estática de alto desempenho
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /bin/master ./cmd/main.go

# Estágio 2: Imagem final enxuta (Scratch/Alpine seguro)
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S solmaster && adduser -S solmaster -G solmaster

WORKDIR /app

# Copia binário compilado
COPY --from=builder /bin/master /app/master

# Cria diretório persistente para armazenamento de dados (JSON/SQLite)
RUN mkdir -p /app/data && chown -R solmaster:solmaster /app

USER solmaster

ENV PORT=8090
ENV DATA_FILE_PATH=/app/data/master_licenses.json

EXPOSE 8090

VOLUME ["/app/data"]

ENTRYPOINT ["/app/master"]

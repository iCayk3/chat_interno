# ==============================================================================
# Dockerfile: Painel Web do Operador & Atendimento (React + Vite + Tailwind)
# ==============================================================================

# Estágio 1: Build da aplicação React
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Estágio 2: Nginx de alta performance para servir SPA e proxy reverso
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

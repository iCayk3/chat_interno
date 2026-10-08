#!/usr/bin/env bash
# ==============================================================================
# Script de Instalação Automatizada: Software de Chat & Atendimento (Linux Básico)
# Compatível com: Ubuntu 20.04+, Debian 11+, CentOS 8+, Rocky Linux
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}  Instalador Oficial: Sistema de Chat & Atendimento Omnichannel ${NC}"
echo -e "${BLUE}================================================================${NC}"

# 1. Checagem de privilégios de superusuário
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Este script deve ser executado como root (sudo).${NC}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 2. Pergunta ou configuração inicial
echo -e "\n${YELLOW}⚙️ Configurações Iniciais de Implantação:${NC}"
read -rp "1. Informe a URL do Servidor Master de Licenças (padrão: http://localhost:8090): " INPUT_MASTER_URL
MASTER_URL="${INPUT_MASTER_URL:-http://localhost:8090}"

read -rp "2. Nome da Empresa / Provedor (ex: Sol Telecom): " INPUT_TENANT_NAME
TENANT_NAME="${INPUT_TENANT_NAME:-Sol Telecom}"

read -rp "3. CNPJ da Empresa (opcional, para identificação no Master): " INPUT_TENANT_CNPJ
TENANT_CNPJ="${INPUT_TENANT_CNPJ:-}"

SERVER_IP_AUTO=$(hostname -I 2>/dev/null | awk '{print $1}')
SERVER_IP_AUTO="${SERVER_IP_AUTO:-localhost}"

read -rp "4. URL ou IP Público de Acesso deste Servidor (padrão: http://$SERVER_IP_AUTO): " INPUT_SERVER_PUBLIC_URL
SERVER_PUBLIC_URL="${INPUT_SERVER_PUBLIC_URL:-http://$SERVER_IP_AUTO}"

DB_PASS=$(tr -dc A-Za-z0-9 </dev/urandom | head -c 16 ; echo '')


# 3. Instalação de Pacotes e Dependências do Sistema
echo -e "\n${YELLOW}📦 1/6 Instalando pacotes do sistema (PostgreSQL, Nginx, Curl, Git)...${NC}"
if command -v apt-get &> /dev/null; then
  apt-get update -y
  apt-get install -y curl wget git tar ca-certificates postgresql postgresql-contrib nginx ufw
elif command -v dnf &> /dev/null; then
  dnf install -y curl wget git tar ca-certificates postgresql-server postgresql-contrib nginx firewalld
  postgresql-setup --initdb || true
  systemctl enable postgresql
  systemctl start postgresql
fi

# 4. Configuração do Banco de Dados PostgreSQL
echo -e "\n${YELLOW}🗄️ 2/6 Configurando banco de dados PostgreSQL...${NC}"
systemctl enable postgresql
systemctl start postgresql

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='solchat'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE USER solchat WITH PASSWORD '$DB_PASS';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='solcrm'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE DATABASE solcrm OWNER solchat;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE solcrm TO solchat;"

# 5. Criação de Usuário e Diretórios da Aplicação
echo -e "\n${YELLOW}👤 3/6 Criando diretórios da aplicação...${NC}"
if ! id -u solchat &>/dev/null; then
  useradd -r -s /bin/false -d /opt/sol-chat solchat
fi

mkdir -p /opt/sol-chat/storage/temp_boletos
mkdir -p /var/www/sol-chat
chown -R solchat:solchat /opt/sol-chat

# Salva arquivo .env para o backend
cat <<EOF > /opt/sol-chat/.env
PORT=8080
ENV=production
DATABASE_URL=postgres://solchat:$DB_PASS@localhost:5432/solcrm?sslmode=disable
JWT_SECRET=sol-crm-prod-$(tr -dc A-Za-z0-9 </dev/urandom | head -c 24)
MASTER_LICENSE_SERVER_URL=$MASTER_URL
TENANT_NAME=$TENANT_NAME
TENANT_CNPJ=$TENANT_CNPJ
SERVER_PUBLIC_URL=$SERVER_PUBLIC_URL
ALLOWED_ORIGINS=http://localhost,http://127.0.0.1,$SERVER_PUBLIC_URL
RATE_LIMIT_RPS=60
RATE_LIMIT_BURST=120
EOF
chown solchat:solchat /opt/sol-chat/.env
chmod 600 /opt/sol-chat/.env

# 6. Compilação do Backend Go
echo -e "\n${YELLOW}🔨 4/6 Instalando backend Go...${NC}"
if [ -f "$SCRIPT_DIR/server/bin/server" ]; then
  cp "$SCRIPT_DIR/server/bin/server" /opt/sol-chat/server
elif [ -f "$SCRIPT_DIR/server/server" ]; then
  cp "$SCRIPT_DIR/server/server" /opt/sol-chat/server
else
  if ! command -v go &> /dev/null; then
    echo -e "${BLUE}Instalando compilador Golang 1.24...${NC}"
    GO_TAR="go1.24.0.linux-amd64.tar.gz"
    curl -fsSL "https://go.dev/dl/$GO_TAR" -o "/tmp/$GO_TAR"
    rm -rf /usr/local/go && tar -C /usr/local -xzf "/tmp/$GO_TAR"
    export PATH=$PATH:/usr/local/go/bin
  fi
  cd "$SCRIPT_DIR/server"
  CGO_ENABLED=0 go build -ldflags="-w -s" -o /opt/sol-chat/server ./cmd/server/main.go
  cd "$SCRIPT_DIR"
fi

chmod +x /opt/sol-chat/server
chown solchat:solchat /opt/sol-chat/server

# Registra e inicia serviço backend
cp "$SCRIPT_DIR/deploy/chat-server.service" /etc/systemd/system/chat-server.service
systemctl daemon-reload
systemctl enable chat-server
systemctl restart chat-server

# 7. Compilação e Publicação do Frontend Web (React / Vite)
echo -e "\n${YELLOW}🌐 5/6 Compilando e publicando painel web...${NC}"
if [ -d "$SCRIPT_DIR/web/dist" ]; then
  cp -r "$SCRIPT_DIR/web/dist/"* /var/www/sol-chat/
else
  if ! command -v node &> /dev/null; then
    echo -e "${BLUE}Instalando Node.js 20 LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs || dnf install -y nodejs
  fi
  cd "$SCRIPT_DIR/web"
  npm install
  npm run build
  cp -r dist/* /var/www/sol-chat/
  cd "$SCRIPT_DIR"
fi

chown -R www-data:www-data /var/www/sol-chat 2>/dev/null || chown -R nginx:nginx /var/www/sol-chat

# Configuração do Nginx
cp "$SCRIPT_DIR/deploy/nginx-chat.conf" /etc/nginx/sites-available/sol-chat 2>/dev/null || cp "$SCRIPT_DIR/deploy/nginx-chat.conf" /etc/nginx/conf.d/sol-chat.conf
if [ -d "/etc/nginx/sites-enabled" ]; then
  rm -f /etc/nginx/sites-enabled/default
  ln -sf /etc/nginx/sites-available/sol-chat /etc/nginx/sites-enabled/sol-chat
fi

systemctl enable nginx
systemctl restart nginx

# 8. Firewall
echo -e "\n${YELLOW}🛡️ 6/6 Configurando regras de firewall (Porta 80)...${NC}"
if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp comment 'Chat Interno HTTP'
  ufw reload
fi

SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
  SERVER_IP="SEU_IP_PUBLICO"
fi

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}🎉 Instalação do Chat & Atendimento concluída com sucesso!       ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "Acesse o sistema no navegador:"
echo -e "👉 ${BLUE}http://$SERVER_IP${NC}"
echo -e "\nCredenciais do Banco de Dados PostgreSQL:"
echo -e "  - Usuário:  ${YELLOW}solchat${NC}"
echo -e "  - Senha:    ${YELLOW}$DB_PASS${NC}"
echo -e "  - Banco:    ${YELLOW}solcrm${NC}"
echo -e "\nComandos de Gestão:"
echo -e "  - Status do servidor:  ${YELLOW}systemctl status chat-server${NC}"
echo -e "  - Ver logs em tempo real: ${YELLOW}journalctl -u chat-server -f${NC}"
echo -e "  - Reiniciar servidor:  ${YELLOW}systemctl restart chat-server${NC}"
echo -e "${GREEN}================================================================${NC}"

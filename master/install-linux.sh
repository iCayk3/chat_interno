#!/usr/bin/env bash
# ==============================================================================
# Script de Instalação Automatizada: Master Control Plane (Linux Básico)
# Compatível com: Ubuntu 20.04+, Debian 11+, CentOS 8+, Rocky Linux
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}   Instalador Oficial: Master License Control Plane (SaaS)     ${NC}"
echo -e "${BLUE}================================================================${NC}"

# 1. Checagem de privilégios de superusuário
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Este script deve ser executado como root (sudo).${NC}"
  exit 1
fi

# 2. Instalação de dependências essenciais
echo -e "\n${YELLOW}📦 1/5 Instalando dependências do sistema operacional...${NC}"
if command -v apt-get &> /dev/null; then
  apt-get update -y
  apt-get install -y curl wget tar ca-certificates ufw
elif command -v dnf &> /dev/null; then
  dnf install -y curl wget tar ca-certificates firewalld
fi

# 3. Criação de usuário e diretórios
echo -e "\n${YELLOW}👤 2/5 Configurando usuário dedicado de serviço...${NC}"
if ! id -u solmaster &>/dev/null; then
  useradd -r -s /bin/false -d /opt/sol-master solmaster
fi

mkdir -p /opt/sol-master/data

if [ ! -f /opt/sol-master/.env ]; then
  cat <<EOF > /opt/sol-master/.env
MASTER_PORT=8090
DATA_FILE_PATH=/opt/sol-master/data/master_licenses.json
MASTER_JWT_SECRET=sol-master-$(tr -dc A-Za-z0-9 </dev/urandom | head -c 24)
SUPPORT_CONTACT_PHONE=(11) 98765-4321
SUPPORT_CONTACT_EMAIL=comercial@soltelecom.com.br
EOF
  chmod 600 /opt/sol-master/.env
fi

chown -R solmaster:solmaster /opt/sol-master

# 4. Compilação ou Cópia do Binário
echo -e "\n${YELLOW}⚙️ 3/5 Instalando binário do Master...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/server/bin/master" ]; then
  cp "$SCRIPT_DIR/server/bin/master" /opt/sol-master/master
elif [ -f "$SCRIPT_DIR/master" ]; then
  cp "$SCRIPT_DIR/master" /opt/sol-master/master
else
  echo -e "${BLUE}ℹ️ Compilando binário Go a partir do código fonte local...${NC}"
  if ! command -v go &> /dev/null; then
    echo -e "${YELLOW}Instalando Golang 1.24...${NC}"
    GO_TAR="go1.24.0.linux-amd64.tar.gz"
    curl -fsSL "https://go.dev/dl/$GO_TAR" -o "/tmp/$GO_TAR"
    rm -rf /usr/local/go && tar -C /usr/local -xzf "/tmp/$GO_TAR"
    export PATH=$PATH:/usr/local/go/bin
  fi

  cd "$SCRIPT_DIR/server"
  CGO_ENABLED=0 go build -ldflags="-w -s" -o /opt/sol-master/master ./cmd/main.go
  cd "$SCRIPT_DIR"
fi

chmod +x /opt/sol-master/master
chown solmaster:solmaster /opt/sol-master/master

# 5. Configuração do Serviço Systemd
echo -e "\n${YELLOW}🔧 4/5 Registrando serviço no systemd...${NC}"
cp "$SCRIPT_DIR/sol-master.service" /etc/systemd/system/sol-master.service
systemctl daemon-reload
systemctl enable sol-master
systemctl restart sol-master

# 6. Liberação de Firewall
echo -e "\n${YELLOW}🛡️ 5/5 Configurando regras de firewall (Porta 8090)...${NC}"
if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 8090/tcp comment 'Master License Control Plane'
  ufw reload
fi

SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
  SERVER_IP="SEU_IP_PUBLICO"
fi

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}🎉 Instalação do Master Control Plane concluída com sucesso!    ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "Acesse o painel web no navegador:"
echo -e "👉 ${BLUE}http://$SERVER_IP:8090${NC}"
echo -e "\nComandos úteis:"
echo -e "  - Status do serviço:   ${YELLOW}systemctl status sol-master${NC}"
echo -e "  - Ver logs em tempo real: ${YELLOW}journalctl -u sol-master -f${NC}"
echo -e "  - Reiniciar serviço:  ${YELLOW}systemctl restart sol-master${NC}"
echo -e "${GREEN}================================================================${NC}"

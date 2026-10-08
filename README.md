# 🚀 Chat Interno & Omnichannel SaaS

Plataforma completa de atendimento e mensageria em tempo real no modelo **Omnichannel / Helpdesk**, composta por:
1. **Master Control Plane (`master/`)**: Central de comando independente do proprietário da plataforma para licenciamento, gestão de assinaturas, controle remoto de recursos e recebimentos de planos (Mensal/Anual).
2. **Servidor do Cliente (`server/` + `web/`)**: Instalação distribuída para clientes/provedores com API em **Go (Golang)** de alta concorrência (~2KB/conexão WebSocket), banco relacional **PostgreSQL** e painel web do operador em **React + Vite + Tailwind CSS**.
3. **Aplicativo Mobile (`mobile/`)**: App React Native (Expo SDK 52+) para os clientes finais abrirem chamados e conversarem com operadores, com suporte a **Pareamento Dinâmico Híbrido** e **Build White-Label**.

---

## 🏛️ 1. Arquitetura do Ecossistema

```text
Chat-Interno/
├── master/                    # Super Sistema Master (Control Plane Isolado do Proprietário)
│   ├── server/                # Backend em Go do Master (API Chi, Engine de Licenças, SQLite/JSON)
│   ├── Dockerfile             # Container Docker do Master
│   ├── docker-compose.yml     # Orquestração do Master
│   ├── install-linux.sh       # Instalador automatizado para VPS do Master
│   └── README.md              # Documentação dedicada do Master
├── server/                    # Servidor do Cliente (Backend Go de Atendimento & WebSocket Hub)
│   ├── cmd/server/            # Ponto de entrada (main.go)
│   ├── internal/              # Core: WebSocket Hub, Handlers REST, Licenciamento, ERPs, Mercado Pago
│   ├── Dockerfile             # Container Docker do Servidor do Cliente
│   └── go.mod
├── web/                       # Painel Web do Operador do Cliente (React + Vite + Tailwind CSS)
│   ├── src/components/        # Fila de atendimento, CRM, Canais, Financeiro, Licença
│   └── Dockerfile             # Build estático com Nginx
├── mobile/                    # Aplicativo Mobile do Cliente (Expo SDK 52+ / TypeScript)
│   ├── src/components/        # ChatMessageItem, ChatInputBar, ServerConfigModal
│   ├── src/services/          # chatSocket com suporte a servidor dinâmico e fallback simulado
│   └── app.json               # Configurações do Expo com deep linking (solchat://)
├── deploy/                    # Arquivos de infraestrutura (Nginx conf, Systemd service)
├── docker-compose.yml         # Stack Docker de produção do Servidor do Cliente
├── install-linux.sh           # Instalador automatizado para VPS/Servidor do Cliente
├── AGENTS.md                  # Regras mandatórias e diretrizes técnicas para agentes de IA
└── README.md                  # Este documento
```

---

## 💳 2. Arquitetura Financeira Dupla (Mercado Pago)

O sistema possui duas camadas financeiras totalmente desacopladas:

1. **Mercado Pago do Proprietário (Configurado no Master):**
   - Configurado no painel do Master (`/dashboard` ou rota `/api/v1/master/finance`).
   - Recebe as mensalidades e anuidades do software pagas pelos clientes/provedores.
   - Emite cobrança PIX automática e libera/renova a licença do cliente instantaneamente via Webhook.
2. **Mercado Pago do Cliente/Provedor (Configurado no Servidor do Cliente):**
   - Configurado no painel do cliente (Aba Financeiro / Configurações).
   - Utilizado pelo cliente/provedor para emitir cobranças PIX e boletos para os **clientes finais dele** no chat de atendimento, sem qualquer interferência com o Master.

---

## 👑 3. Como Instalar o Master Control Plane (VPS Isolada)

O Master roda em sua própria VPS/máquina dedicada, independente de qualquer instalação de cliente.

### Opção A: Instalação Automatizada em Linux (Ubuntu / Debian / CentOS / Rocky)
```bash
cd master
sudo bash install-linux.sh
```
*O script instala o compilador Go (se necessário), compila o binário estático em `/opt/sol-master/master`, cria o serviço Systemd `sol-master.service`, configura as portas de firewall (8090) e inicia o serviço.*

### Opção B: Instalação via Docker
```bash
cd master
docker compose up -d
```

**Painel Administrativo:** Acesse `http://SEU_IP_MASTER:8090/` no navegador.

---

## 🏢 4. Como Instalar o Servidor do Cliente (Atendimento)

Ao instalar o sistema de atendimento em um cliente/provedor, você pode utilizar o instalador nativo Linux ou Docker.

### Opção A: Instalação Automatizada em Linux (`install-linux.sh`)
Execute na VPS/servidor do cliente:
```bash
sudo bash install-linux.sh
```
O script fará 4 perguntas de configuração inicial:
1. **URL do Servidor Master de Licenças:** (ex: `http://master.seudominio.com:8090`)
2. **Nome da Empresa / Provedor:** (ex: `Provedor Sol Telecom`)
3. **CNPJ da Empresa:** (opcional, para identificação formal no Master)
4. **URL ou IP Público deste servidor:** (ex: `http://chat.soltelecom.com.br`)

O instalador cuida de:
- Instalar e configurar PostgreSQL com credenciais seguras geradas dinamicamente.
- Instalar e configurar Nginx com suporte a WebSockets persistentes (`/ws`) e SPA.
- Compilar o backend em Go de alta concorrência em `/opt/sol-chat/server`.
- Compilar e publicar o painel web em `/var/www/sol-chat`.
- Configurar o serviço systemd `chat-server.service` com inicialização automática no boot.

### Opção B: Instalação via Docker Compose
No diretório raiz da instalação do cliente:
1. Crie o arquivo `.env` baseado no [`.env.example`](file:///c:/Users/SOL%20NOC/Documents/Dev/Projetos/Chat-Interno/.env.example):
```env
MASTER_LICENSE_SERVER_URL=http://IP_DO_MASTER:8090
TENANT_NAME=Provedor Sol Telecom
TENANT_CNPJ=12.345.678/0001-90
SERVER_PUBLIC_URL=http://chat.soltelecom.com.br
```
2. Inicie a stack completa:
```bash
docker compose up -d
```

---

## 🔄 5. Auto-Registro e Gestão Remota pelo Master

Toda instalação de cliente se auto-gerencia sem necessidade de digitação manual de chaves:

1. **Auto-Registro no Primeiro Boot:**
   - O servidor do cliente inicia, verifica que ainda não possui licença ativa ou que o Master precisa ser sincronizado, e efetua um `POST /api/v1/licenses/auto-register` para a URL do Master configurada.
   - Envia nome da empresa, CNPJ, IP/Host e o identificador único de hardware (`machine-id` da máquina).
2. **Liberação Instantânea pelo Master:**
   - O Master cadastra o novo cliente instantaneamente, emite uma chave única (ex: `LIC-XXXX-XXXX-XXXX`), concede **30 dias de Trial grátis** e libera o uso imediatamente.
3. **Sincronização Contínua (Heartbeat a cada 5 segundos):**
   - O servidor do cliente pulsa o Master continuamente.
   - **Bloqueio/Desbloqueio Remoto:** Se o status for alterado para `suspended` ou o cliente não pagar, a tela do operador é bloqueada no mesmo segundo, exibindo o QR Code PIX gerado pelo Mercado Pago do Master.
   - **Controle Remoto do Modo de Operação:** O Master define se o cliente opera em modo `erp` (RBX, IXC), `native` (banco interno) ou `hybrid`. Ao alterar no Master, o servidor do cliente recebe a instrução e altera as telas dos operadores em tempo real via WebSocket.

---

## 📱 6. Conexão do Aplicativo Mobile (Híbrido & White-Label)

O aplicativo mobile suporta duas estratégias de conexão com o servidor do respectivo cliente:

### Estratégia 1: Conexão Dinâmica (App Único na Loja)
- O cliente baixa o app e pode se conectar de três maneiras:
  1. **QR Code Dinâmico:** No painel web do operador (Aba **Canais** > **App Mobile**), o operador exibe o QR Code gerado pelo sistema. O cliente escaneia com o celular e conecta na hora.
  2. **Deep Link:** O cliente clica em um link enviado por SMS/WhatsApp no formato:
     ```text
     solchat://connect?server=https://chat.provedor.com.br
     ```
  3. **Configuração Manual:** No app, clica no ícone de engrenagem e digita a URL do servidor, com teste de conexão em tempo real.

### Estratégia 2: Compilação White-Label (App Exclusivo da Marca)
- Para gerar um aplicativo exclusivo publicado com a marca e logotipo de um cliente específico com o servidor fixo no código:
```bash
cd mobile
EXPO_PUBLIC_API_URL="https://chat.provedor.com.br" npx expo run:android
# ou via EAS Build:
EXPO_PUBLIC_API_URL="https://chat.provedor.com.br" eas build -p android
```

---

## 🛠️ 7. Ambiente de Desenvolvimento Local

Para rodar todo o ecossistema localmente para testes:

### Terminal 1: Master Control Plane
```bash
cd master/server
go run cmd/main.go
# Painel disponível em: http://localhost:8090
```

### Terminal 2: Servidor Central (Cliente)
```bash
cd server
go run cmd/server/main.go
# API e WebSocket em: http://localhost:8080 (WS: ws://localhost:8080/ws)
```

### Terminal 3: Painel Web do Operador
```bash
cd web
npm run dev
# Dashboard em: http://localhost:5173
```

### Terminal 4: App Mobile
```bash
cd mobile
npx expo start
# Pressione 'a' para emulador Android ou leia o QR Code no Expo Go
```

---

## 🔒 8. Diretrizes Mandatórias de Segurança

Conforme estabelecido nas regras mandatórias do projeto (`AGENTS.md`), as seguintes práticas são rigorosamente aplicadas em todo o código:
- Validação estrita de entradas no backend em Go (nunca confiar exclusivamente no frontend).
- Autenticação e autorização via JWT validadas em todos os endpoints e no handshake do WebSocket.
- Proibição de hardcode de secrets ou chaves de API (uso estrito de variáveis de ambiente).
- Proteção Anti-IDOR (verificação se o usuário pertence à conversa solicitada).
- Rate Limiting por IP e por token para proteção contra DoS e força bruta.
- CORS restrito aos domínios autorizados.
- Mascaramento e sanitização de dados sensíveis nas respostas da API (`json:"-"`).

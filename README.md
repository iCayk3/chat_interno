# 🚀 Chat Interno - Sistema de Atendimento Omnichannel

Sistema completo de mensageria em tempo real conectando **Clientes (App Mobile)** e **Operadores de Suporte (Painel Web)** através de um servidor de alta concorrência em **Go (Golang)**.

---

## 📁 Estrutura do Ecossistema

```text
Chat-Interno/
├── AGENTS.md        # Diretrizes e regras mandatórias de segurança para agentes de IA
├── README.md        # Guia mestre de execução e arquitetura
├── mobile/          # App Mobile do Cliente (Expo SDK 52+ / React Native + TypeScript)
├── server/          # Backend em Go (Golang 1.27) com WebSockets, Hub/Client e Chi Router
└── web/             # Painel Web do Operador (React + Vite + TypeScript + Tailwind CSS)
```

---

## 🚀 Como Executar o Teste Completo (Ponta a Ponta)

Para realizar um teste integrado completo, abra 3 terminais:

### 1️⃣ Terminal 1: Servidor Central em Go
Inicia a API e o Hub WebSocket de alta concorrência:

```bash
cd server
go run cmd/server/main.go
```
* **WebSocket:** `ws://localhost:8080/ws` (e na rede local `ws://192.168.1.2:8080/ws`)
* **Health Check:** `http://localhost:8080/api/health`

---

### 2️⃣ Terminal 2: Painel Web do Operador (Atendente)
Inicia o dashboard do operador com fila de espera e histórico:

```bash
cd web
npm run dev
```
* Acesse no navegador: **`http://localhost:5173`**
* O painel se conectará imediatamente ao servidor Go exibindo o status **Operador Online**.

---

### 3️⃣ Terminal 3: App Mobile (Cliente)
Inicia o aplicativo para os clientes iniciarem atendimento:

```bash
cd mobile
npx expo start
```
* Escaneie o **QR Code** no aplicativo **Expo Go** do seu celular (ou aperte `a` para emulador Android / `w` para navegador).
* Informe seu nome, departamento e clique em **Iniciar Atendimento**.

---

## 🔄 Fluxo de Teste Prático

1. **Cliente entra na fila:** No celular (Mobile), informe um nome (ex: "Carlos Cliente") e inicie o atendimento.
2. **Operador recebe notificação:** No navegador (`http://localhost:5173`), a aba **Fila** atualizará automaticamente com a nova solicitação.
3. **Assumir atendimento:** Clique na conversa e no botão **Assumir Atendimento**. O status mudará para *Em Atendimento*.
4. **Mensageria Bidirecional em Tempo Real:** 
   - Envie mensagens no celular e veja-as aparecer instantaneamente na tela do operador.
   - Responda pelo painel web (ou use as *Respostas Rápidas*) e veja as mensagens chegarem no celular com confirmação de entrega.
   - Digite no teclado de um dos lados para ver o indicador *"Digitando..."* em tempo real no outro!
5. **Consulta a APIs Externas:** No painel web do operador, clique no botão **Consultar** no painel direito para testar a integração concorrente de CRM/ERP do Go.

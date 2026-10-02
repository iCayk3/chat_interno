# 🤖 Diretrizes e Instruções do Projeto (AGENTS.md)

Este documento serve como guia mestre para qualquer agente de IA (Antigravity, Cursor, Copilot, Claude) ou desenvolvedor que for atuar neste repositório. **Siga rigorosamente as diretrizes e decisões arquiteturais aqui descritas.**

---

## 🎯 1. Visão Geral do Projeto

Sistema de chat e atendimento interno em tempo real no modelo **Omnichannel / Helpdesk**:
- **Mobile (`mobile/`):** Aplicativo voltado aos **Clientes**, focado em facilidade, identificação rápida e chat em tempo real com operadores.
- **Web (`web/`):** Painel voltado aos **Operadores/Atendentes**, com fila de atendimento, gestão de múltiplos chats simultâneos e histórico.
- **Backend (`server/`):** API central em **Go (Golang)** de alta performance com WebSockets nativos para mensageria instantânea, gerenciador de salas (*Hub/Client pattern*) e camada extensível para **consultas em APIs externas** (CRM, ERP, status de pedidos, bots).

---

## 🛠️ 2. Stack Tecnológica Oficial

| Camada | Tecnologia | Decisão & Racional |
| :--- | :--- | :--- |
| **Mobile** | **React Native (Expo SDK 52+) + TypeScript** | Rápido desenvolvimento, compatível com iOS e Android, testável via Expo Go. |
| **Backend** | **Go (Golang 1.27+)** | Concorrência ultraleve com goroutines (~2KB/conexão WebSocket), performance bruta para milhares de chats, binário único e baixo consumo de memória. |
| **Web** | **React + Vite + TypeScript + Tailwind CSS** | Painel de operador moderno, responsivo, veloz e de fácil manutenção. |
| **Banco de Dados** | **PostgreSQL** | Relacional robusto com suporte a JSONB para histórico e metadados flexíveis. |

---

## 📁 3. Estrutura de Diretórios

```text
Chat-Interno/
├── AGENTS.md                  # Este arquivo de diretrizes para agentes de IA
├── README.md                  # Documentação humana do projeto
├── mobile/                    # App Mobile do Cliente (Expo + React Native)
│   ├── src/
│   │   ├── components/        # Componentes UI (ChatMessageItem, ChatInputBar, etc.)
│   │   ├── screens/           # Telas (WelcomeScreen, ChatScreen)
│   │   ├── services/          # chatSocket (WebSocket + Mock fallback), storage (AsyncStorage)
│   │   ├── theme/             # Cores e estilos do app
│   │   ├── types/             # Tipagens centrais de mensagens, clientes e sessões
│   │   └── navigation/        # Stack de navegação (React Navigation)
│   ├── App.tsx                # Ponto de entrada com SafeAreaProvider e Navigator
│   └── app.json               # Configurações do Expo (ajustes de teclado resize)
├── server/                    # Backend em Go (a ser implementado/expandido)
│   ├── cmd/server/            # main.go
│   ├── internal/
│   │   ├── websocket/         # Hub, Client e gerenciador de conexões
│   │   ├── handlers/          # Handlers REST e WebSocket
│   │   ├── services/          # Lógica de negócio e integrações com APIs externas
│   │   └── models/            # Structs Go alinhadas com as tipagens do mobile/web
│   └── go.mod
└── web/                       # Painel Web do Operador (a ser inicializado)
```

---

## 📜 4. Protocolo e Contrato de Dados (WebSocket & REST)

Toda a comunicação em tempo real utiliza **JSON padronizado**:

### Estrutura da Mensagem (`Message`)
```typescript
interface Message {
  id: string;              // Identificador único (UUID)
  conversationId: string;  // ID da conversa/sala
  senderId: string;        // ID do remetente
  senderType: 'client' | 'operator' | 'system';
  senderName: string;      // Nome visível de quem enviou
  content: string;         // Conteúdo textual
  timestamp: string;       // ISO 8601 (ex: "2026-10-02T17:35:00Z")
  status: 'pending' | 'sent' | 'delivered' | 'read';
}
```

### Eventos de WebSocket
- **`send_message`**: Envio de mensagem pelo cliente ou operador.
- **`message`**: Broadcast da mensagem recebida para os participantes da sala.
- **`typing`**: `{ conversationId, senderId, senderName, isTyping: boolean }`
- **`operator_assigned`**: Informa ao cliente que um operador assumiu a conversa.
- **`chat_closed`**: Encerramento formal do atendimento.

---

## ⚠️ 5. Regras Críticas e Diretrizes Já Estabelecidas

1. **Mobile - Teclado no Android/iOS:**
   - O campo de texto do chat **DEVE** permanecer colado acima do teclado quando aberto.
   - Manter `"softwareKeyboardLayoutMode": "resize"` no `mobile/app.json`.
   - Utilizar `KeyboardAvoidingView` com `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` e `useSafeAreaInsets` do `react-native-safe-area-context`.
   - O `FlatList` deve manter `keyboardShouldPersistTaps="handled"` e `keyboardDismissMode="on-drag"`.
2. **Mobile - Modo Simulador (Mock Mode):**
   - O `chatSocket.ts` possui fallback automático para modo simulado quando o backend não estiver acessível, garantindo que o app mobile seja 100% testável localmente. **Não quebre essa retrocompatibilidade.**
3. **Backend em Go:**
   - Utilizar o padrão **Hub/Client** com goroutines e channels para broadcast de mensagens em tempo real.
   - Deixar a camada de serviços preparada para **consultas concorrentes a APIs externas** (`sync.WaitGroup` ou channels).
4. **Qualidade de Código:**
   - Antes de concluir qualquer tarefa mobile, execute `npx tsc --noEmit` dentro da pasta `mobile/` para garantir **zero erros de TypeScript**.
   - No backend em Go, execute `go vet ./...` e garanta que não há goroutine leaks.

---

## 🚀 6. Comandos Frequentes

### Mobile:
```bash
cd mobile
npx expo start          # Inicia servidor do Expo (QR code para celular)
npx tsc --noEmit        # Validação estática de tipos TypeScript
npx expo install <pkg>  # Instalar pacotes compatíveis com o SDK do Expo
```

### Server (Go):
```bash
cd server
go run cmd/server/main.go
go test ./...
```

---

## 🔒 7. Regras Mandatórias de Segurança (Invioláveis desde o Início)

Qualquer agente ou desenvolvedor atuando neste repositório **DEVE PREVENIR E NUNCA PERMITIR** as seguintes 10 falhas de segurança e más práticas:

1. **Formulário sem validação no servidor:**
   - *Diretriz:* Nunca confiar exclusivamente na validação do frontend. Toda entrada (REST ou WebSocket) deve ser estritamente validada no backend em Go (tipos, tamanhos máximos, regex e campos obrigatórios).
2. **Rotas protegidas apenas no frontend:**
   - *Diretriz:* O frontend apenas oculta elementos de interface; o backend em Go deve validar autenticação (tokens/JWT) e autorização em **todos** os endpoints e no handshake do WebSocket.
3. **Chaves e secrets expostos no código:**
   - *Diretriz:* Proibido *hardcode* de chaves de API, senhas de banco de dados e secrets JWT. Usar exclusivamente variáveis de ambiente (`.env`), devidamente ignoradas no `.gitignore`.
4. **Falta de validação de autorização por usuário (Anti-IDOR):**
   - *Diretriz:* O backend deve validar se o remetente realmente tem permissão para acessar ou enviar mensagens na conversa informada, impedindo que um cliente leia dados de outro.
5. **Endpoints sem limite de requisições (Rate Limiting):**
   - *Diretriz:* Implementar limitador de requisições (rate limit) por IP e por usuário em rotas críticas e de autenticação, prevenindo força bruta e DoS.
6. **Upload de arquivos sem validação:**
   - *Diretriz:* Qualquer upload futuro de mídias/documentos no chat deve validar tamanho máximo, MIME type real (magic numbers) e extensão permitida, armazenando com nomes aleatórios (UUID).
7. **Dados sensíveis expostos nas respostas da API:**
   - *Diretriz:* Structs em Go e DTOs de resposta nunca devem expor campos como senhas, hashes, dados fiscais desnecessários ou tokens internos. Utilizar tags `json:"-"` nas structs.
8. **Proteção insuficiente contra XSS:**
   - *Diretriz:* Sanitizar e escapar todo conteúdo gerado por usuários antes da renderização no Painel Web e no Mobile para mitigar injeção de scripts maliciosos.
9. **Configuração de CORS aberta demais:**
   - *Diretriz:* Nunca liberar `Access-Control-Allow-Origin: *` em rotas privadas. Restringir explicitamente aos domínios autorizados do app mobile e do painel web.
10. **Mensagens de erro revelando informações internas:**
    - *Diretriz:* Nunca expor stack traces, erros internos de driver SQL ou detalhes de infraestrutura para o cliente. Erros detalhados vão apenas para os logs internos do servidor; o cliente recebe mensagens amigáveis e padronizadas.


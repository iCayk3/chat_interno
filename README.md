# 🚀 Chat Interno - Sistema de Atendimento Omnichannel

Sistema de mensageria em tempo real conectando **Clientes (Mobile)** e **Operadores de Atendimento (Web)**, alimentado por um backend de alta performance em **Go (Golang)**.

---

## 📁 Estrutura do Projeto

```text
Chat-Interno/
├── mobile/      # Aplicativo React Native (Expo) com TypeScript - App do Cliente
├── server/      # Backend em Go (Golang) com WebSockets e REST APIs (Próxima etapa)
└── web/         # Painel do Operador em React + Vite + Tailwind (Próxima etapa)
```

---

## 📱 Como rodar o App Mobile

### 1. Pré-requisitos
- Aplicativo **Expo Go** instalado no seu celular ([Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent) ou [App Store](https://apps.apple.com/app/expo-go/id982107442)).

### 2. Iniciar o servidor de desenvolvimento
No terminal, entre na pasta `mobile` e execute:

```bash
cd mobile
npx expo start
```

### 3. Abrir no aparelho
- No terminal será exibido um **QR Code**.
- Abra o aplicativo **Expo Go** no seu celular e escaneie o código.
- O aplicativo compilará e abrirá instantaneamente na tela do seu celular!

---

## 💡 Recursos do App Mobile Já Implementados

- ✅ **Identificação do Cliente:** Tela inicial com nome, CPF/e-mail para consulta e seleção de departamento (Suporte, Dúvidas, Comercial).
- ✅ **Persistência de Sessão:** Armazena dados localmente via `AsyncStorage` permitindo retomar atendimentos em andamento.
- ✅ **Chat em Tempo Real:** Interface de mensagens com balões estilizados, data/hora e confirmações de envio (✓, ✓✓).
- ✅ **Indicador de Digitação:** Notificação visual em tempo real quando o operador está digitando.
- ✅ **Simulador Offline Inteligente (Mock Mode):** Permite testar o fluxo de envio e resposta mesmo enquanto o servidor Go ainda não estiver rodando!

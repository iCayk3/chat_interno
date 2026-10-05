import Constants from 'expo-constants';
import { Message } from '../types/chat';

type MessageHandler = (message: Message) => void;
type StatusHandler = (connected: boolean) => void;
type TypingHandler = (isTyping: boolean, senderName: string) => void;
type ChatClosedHandler = (reason: string) => void;

function getWebSocketUrl(): string {
  // 1. Se estiver rodando no navegador (Web)
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'ws://localhost:8080/ws';
    }
    return `ws://${window.location.hostname}:8080/ws`;
  }

  // 2. Se estiver rodando no celular via Expo Go, extrai o IP de onde o bundle foi baixado
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoClient?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost') {
      return `ws://${ip}:8080/ws`;
    }
  }

  // 3. Fallback para o IP ativo da máquina na rede SOL-PROVEDOR_5G
  return 'ws://10.12.199.3:8080/ws';
}

class ChatSocketService {
  private socket: WebSocket | null = null;
  private isConnected: boolean = false;
  private messageListeners: MessageHandler[] = [];
  private statusListeners: StatusHandler[] = [];
  private typingListeners: TypingHandler[] = [];
  private chatClosedListeners: ChatClosedHandler[] = [];
  private reconnectTimer: any = null;
  private outboxQueue: string[] = []; // Fila de envio garantido para mensagens nunca se perderem

  public getConnected(): boolean {
    return this.isConnected;
  }

  public connect(conversationId: string, clientId: string, clientName: string) {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const baseUrl = getWebSocketUrl();
      const url = `${baseUrl}?conversationId=${conversationId}&clientId=${clientId}&clientName=${encodeURIComponent(clientName)}`;
      console.log('[MOBILE WS] Conectando a:', url);
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.notifyStatus(true);
        console.log('[MOBILE WS] Conectado ao servidor Go com sucesso!');

        // Despeja mensagens pendentes da fila instantaneamente
        while (this.outboxQueue.length > 0) {
          const item = this.outboxQueue.shift();
          if (item) {
            console.log('[MOBILE WS] Enviando mensagem da fila pendente...');
            this.socket?.send(item);
          }
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message' && data.payload) {
            this.notifyMessage(data.payload);
          } else if (data.type === 'typing' && data.payload) {
            this.notifyTyping(data.payload.isTyping, data.payload.senderName || 'Operador');
          } else if (data.type === 'chat_closed') {
            const reason = data.payload?.reason || 'Atendimento encerrado pelo operador';
            this.notifyChatClosed(reason);
          }
        } catch (e) {
          console.warn('[MOBILE WS] Falha ao processar mensagem do servidor', e);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.notifyStatus(false);
        this.scheduleReconnect(conversationId, clientId, clientName);
      };

      this.socket.onerror = (e) => {
        console.warn('[MOBILE WS] Erro na conexão do WebSocket:', e);
        this.isConnected = false;
        this.notifyStatus(false);
      };
    } catch (e) {
      console.warn('[MOBILE WS] Falha ao iniciar WebSocket:', e);
      this.isConnected = false;
      this.notifyStatus(false);
      this.scheduleReconnect(conversationId, clientId, clientName);
    }
  }

  private scheduleReconnect(conversationId: string, clientId: string, clientName: string) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      console.log('[MOBILE WS] Tentando reconectar ao Go Server...');
      this.connect(conversationId, clientId, clientName);
    }, 4000);
  }

  public sendMessage(message: Message) {
    const raw = JSON.stringify({
      type: 'send_message',
      payload: message,
    });

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(raw);
    } else {
      console.log('[MOBILE WS] Socket ainda conectando. Enfileirando mensagem para envio imediato...');
      this.outboxQueue.push(raw);
    }
  }

  public sendTyping(conversationId: string, clientId: string, isTyping: boolean) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'typing',
        payload: { conversationId, clientId, isTyping },
      }));
    }
  }

  public onMessage(handler: MessageHandler) {
    this.messageListeners.push(handler);
    return () => {
      this.messageListeners = this.messageListeners.filter((h) => h !== handler);
    };
  }

  public onStatus(handler: StatusHandler) {
    this.statusListeners.push(handler);
    handler(this.isConnected);
    return () => {
      this.statusListeners = this.statusListeners.filter((h) => h !== handler);
    };
  }

  public onTyping(handler: TypingHandler) {
    this.typingListeners.push(handler);
    return () => {
      this.typingListeners = this.typingListeners.filter((h) => h !== handler);
    };
  }

  public onChatClosed(handler: ChatClosedHandler) {
    this.chatClosedListeners.push(handler);
    return () => {
      this.chatClosedListeners = this.chatClosedListeners.filter((h) => h !== handler);
    };
  }

  private notifyMessage(msg: Message) {
    this.messageListeners.forEach((h) => h(msg));
  }

  private notifyStatus(connected: boolean) {
    this.statusListeners.forEach((h) => h(connected));
  }

  private notifyTyping(isTyping: boolean, senderName: string) {
    this.typingListeners.forEach((h) => h(isTyping, senderName));
  }

  private notifyChatClosed(reason: string) {
    this.chatClosedListeners.forEach((h) => h(reason));
  }

  public disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    this.outboxQueue = [];
  }
}

export const chatSocket = new ChatSocketService();

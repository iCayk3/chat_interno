import { Message } from '../types/chat';

type MessageHandler = (message: Message) => void;
type StatusHandler = (connected: boolean) => void;
type TypingHandler = (isTyping: boolean, senderName: string) => void;

class ChatSocketService {
  private socket: WebSocket | null = null;
  private serverUrl: string = 'ws://10.0.2.2:8080/ws'; // Default Go server url (or local network IP)
  private isConnected: boolean = false;
  private messageListeners: MessageHandler[] = [];
  private statusListeners: StatusHandler[] = [];
  private typingListeners: TypingHandler[] = [];
  private reconnectTimer: any = null;
  private mockMode: boolean = true; // Enabled when server is unreachable so the app remains fully testable

  public setServerUrl(url: string) {
    this.serverUrl = url;
  }

  public enableMockMode(enabled: boolean) {
    this.mockMode = enabled;
  }

  public connect(conversationId: string, clientId: string, clientName: string) {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const url = `${this.serverUrl}?conversationId=${conversationId}&clientId=${clientId}&clientName=${encodeURIComponent(clientName)}`;
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.mockMode = false;
        this.notifyStatus(true);
        console.log('Connected to Chat WebSocket');
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message') {
            this.notifyMessage(data.payload);
          } else if (data.type === 'typing') {
            this.notifyTyping(data.payload.isTyping, data.payload.senderName || 'Operador');
          }
        } catch (e) {
          console.warn('Failed to parse WebSocket message', e);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.notifyStatus(false);
        this.scheduleReconnect(conversationId, clientId, clientName);
      };

      this.socket.onerror = () => {
        this.isConnected = false;
        this.notifyStatus(false);
        // Fallback to simulated offline/mock mode for seamless UI testing
        this.mockMode = true;
      };
    } catch {
      this.isConnected = false;
      this.mockMode = true;
      this.notifyStatus(false);
    }
  }

  private scheduleReconnect(conversationId: string, clientId: string, clientName: string) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect(conversationId, clientId, clientName);
    }, 5000);
  }

  public sendMessage(message: Message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'send_message',
        payload: message,
      }));
    } else if (this.mockMode) {
      // Simulate operator response in mock mode for preview/testing
      this.simulateOperatorResponse(message);
    }
  }

  private simulateOperatorResponse(clientMsg: Message) {
    // Notify typing after 1s
    setTimeout(() => {
      this.notifyTyping(true, 'Operador Suporte');
    }, 800);

    // Send operator mock reply after 2.5s
    setTimeout(() => {
      this.notifyTyping(false, 'Operador Suporte');
      const reply: Message = {
        id: 'mock-' + Date.now(),
        conversationId: clientMsg.conversationId,
        senderId: 'op-01',
        senderType: 'operator',
        senderName: 'Atendimento SOL',
        content: `Olá, ${clientMsg.senderName}! Recebi sua mensagem: "${clientMsg.content}". Como posso te ajudar hoje?`,
        timestamp: new Date().toISOString(),
        status: 'delivered',
      };
      this.notifyMessage(reply);
    }, 2400);
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

  private notifyMessage(msg: Message) {
    this.messageListeners.forEach((h) => h(msg));
  }

  private notifyStatus(connected: boolean) {
    this.statusListeners.forEach((h) => h(connected));
  }

  private notifyTyping(isTyping: boolean, senderName: string) {
    this.typingListeners.forEach((h) => h(isTyping, senderName));
  }

  public disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
  }
}

export const chatSocket = new ChatSocketService();

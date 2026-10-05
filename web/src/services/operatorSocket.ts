import type { Message, WSAction } from '../types/chat';

type MessageListener = (message: Message) => void;
type TypingListener = (payload: { conversationId: string; senderId: string; senderName: string; isTyping: boolean }) => void;
type StatusListener = (connected: boolean) => void;
type ActionCallback = (action: WSAction) => void;

class OperatorSocketService {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private currentConversationId = '';
  private operatorId = 'op-01';
  private operatorName = 'Marcos Suporte';

  private messageListeners: MessageListener[] = [];
  private typingListeners: TypingListener[] = [];
  private statusListeners: StatusListener[] = [];
  private actionListeners: ActionCallback[] = [];
  private reconnectTimer: any = null;
  private outboxQueue: string[] = [];

  public setOperator(id: string, name: string) {
    this.operatorId = id;
    this.operatorName = name;
  }

  public connect(conversationId = '') {
    this.currentConversationId = conversationId;

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      if (conversationId && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          type: 'join_room',
          payload: { conversationId },
        }));
      }
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const url = `${protocol}//${host}/ws?conversationId=${encodeURIComponent(conversationId)}&clientId=${encodeURIComponent(this.operatorId)}&clientName=${encodeURIComponent(this.operatorName)}&senderType=operator`;

      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.notifyStatus(true);
        console.log('[OPERATOR WS] Conectado permanentemente ao servidor Go');

        if (this.currentConversationId) {
          this.socket?.send(JSON.stringify({
            type: 'join_room',
            payload: { conversationId: this.currentConversationId },
          }));
        }

        // Despeja mensagens pendentes da fila (zero perda de primeira mensagem)
        while (this.outboxQueue.length > 0) {
          const item = this.outboxQueue.shift();
          if (item) this.socket?.send(item);
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const action: WSAction = JSON.parse(event.data);
          this.notifyAction(action);

          if (action.type === 'message' && action.payload) {
            this.notifyMessage(action.payload);
          } else if (action.type === 'typing' && action.payload) {
            this.notifyTyping(action.payload);
          }
        } catch (e) {
          console.warn('[OPERATOR WS] Mensagem inválida recebida:', e);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.notifyStatus(false);
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.warn('[OPERATOR WS] Erro de conexão:', err);
      };
    } catch {
      this.isConnected = false;
      this.notifyStatus(false);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.currentConversationId);
    }, 4000);
  }

  // Troca de sala sem destruir a conexão WebSocket existente
  public switchConversation(conversationId: string) {
    this.currentConversationId = conversationId;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'join_room',
        payload: { conversationId },
      }));
    } else {
      this.connect(conversationId);
    }
  }

  public sendMessage(conversationId: string, content: string) {
    const payload: Message = {
      id: 'op-msg-' + Date.now(),
      conversationId,
      senderId: this.operatorId,
      senderType: 'operator',
      senderName: this.operatorName,
      content,
      timestamp: new Date().toISOString(),
      status: 'delivered',
    };

    const raw = JSON.stringify({
      type: 'send_message',
      payload,
    });

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(raw);
    } else {
      console.log('[OPERATOR WS] Conexão pendente. Enfileirando mensagem para envio automático...');
      this.outboxQueue.push(raw);
    }
  }

  public sendTyping(conversationId: string, isTyping: boolean) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    this.socket.send(JSON.stringify({
      type: 'typing',
      payload: {
        conversationId,
        senderId: this.operatorId,
        senderName: this.operatorName,
        isTyping,
      },
    }));
  }

  public onMessage(cb: MessageListener) {
    this.messageListeners.push(cb);
    return () => {
      this.messageListeners = this.messageListeners.filter(l => l !== cb);
    };
  }

  public onTyping(cb: TypingListener) {
    this.typingListeners.push(cb);
    return () => {
      this.typingListeners = this.typingListeners.filter(l => l !== cb);
    };
  }

  public onStatus(cb: StatusListener) {
    this.statusListeners.push(cb);
    cb(this.isConnected);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== cb);
    };
  }

  public onAction(cb: ActionCallback) {
    this.actionListeners.push(cb);
    return () => {
      this.actionListeners = this.actionListeners.filter(l => l !== cb);
    };
  }

  private notifyMessage(msg: Message) {
    this.messageListeners.forEach(l => l(msg));
  }

  private notifyTyping(p: any) {
    this.typingListeners.forEach(l => l(p));
  }

  private notifyStatus(s: boolean) {
    this.statusListeners.forEach(l => l(s));
  }

  private notifyAction(a: WSAction) {
    this.actionListeners.forEach(l => l(a));
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

export const operatorSocket = new OperatorSocketService();

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { Message } from '../types/chat';
import { notificationService } from './notificationService';

type MessageHandler = (message: Message) => void;
type StatusHandler = (connected: boolean) => void;
type TypingHandler = (isTyping: boolean, senderName: string) => void;
type ChatClosedHandler = (reason: string) => void;
type OperatorAssignedHandler = (operatorId: string, operatorName: string) => void;
type NotificationHandler = (notification: any) => void;

export const SERVER_URL_STORAGE_KEY = '@chat_server_base_url';
export const SERVER_NAME_STORAGE_KEY = '@chat_server_company_name';

// URL injetada no momento do build (White-label por compilação)
const COMPILE_TIME_URL = (process.env.EXPO_PUBLIC_API_URL || (Constants.expoConfig?.extra as any)?.apiUrl || '').trim();

let runtimeServerUrl: string | null = null;
let runtimeCompanyName: string | null = null;
let isConfigInitialized = false;

// Inicializa cache em memória a partir do AsyncStorage
async function ensureConfigLoaded(): Promise<void> {
  if (isConfigInitialized) return;
  try {
    const saved = await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY);
    if (saved) runtimeServerUrl = saved;
    const name = await AsyncStorage.getItem(SERVER_NAME_STORAGE_KEY);
    if (name) runtimeCompanyName = name;
  } catch {}
  isConfigInitialized = true;
}

// Inicialização imediata não-bloqueante
ensureConfigLoaded().catch(() => {});

export function sanitizeServerUrl(rawUrl: string): string {
  let url = (rawUrl || '').trim();
  if (!url) return '';
  if (url.startsWith('ws://')) {
    url = 'http://' + url.slice(5);
  } else if (url.startsWith('wss://')) {
    url = 'https://' + url.slice(6);
  } else if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  return url.replace(/\/+$/, '').replace(/\/ws$/i, '').replace(/\/api$/i, '');
}

export function isWhiteLabelBuild(): boolean {
  return Boolean(COMPILE_TIME_URL);
}

export function getApiHttpBaseUrl(): string {
  // 1. Prioridade 1: Build White-label com URL fixa no compile-time
  if (COMPILE_TIME_URL) {
    return sanitizeServerUrl(COMPILE_TIME_URL);
  }

  // 2. Prioridade 2: URL configurada dinamicamente pelo usuário/QR Code salva no aparelho
  if (runtimeServerUrl) {
    return sanitizeServerUrl(runtimeServerUrl);
  }

  // 3. Prioridade 3: Se estiver no navegador Web
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8080';
    }
    return `http://${window.location.hostname}:8080`;
  }

  // 4. Prioridade 4: Se estiver rodando via Expo Go no celular (extrai IP da máquina desenvolvedora)
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoClient?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1' && !ip.startsWith('127.')) {
      return `http://${ip}:8080`;
    }
  }

  // 5. Fallback padrão seguro de desenvolvimento local
  return 'http://localhost:8080';
}

export function getWebSocketUrl(): string {
  const httpUrl = getApiHttpBaseUrl();
  let wsUrl = httpUrl;
  if (wsUrl.startsWith('https://')) {
    wsUrl = 'wss://' + wsUrl.slice(8);
  } else if (wsUrl.startsWith('http://')) {
    wsUrl = 'ws://' + wsUrl.slice(7);
  }
  return `${wsUrl}/ws`;
}

export async function testServerConnection(rawUrl: string): Promise<{ ok: boolean; companyName: string; system: string; url: string }> {
  const sanitized = sanitizeServerUrl(rawUrl);
  if (!sanitized) {
    throw new Error('Informe um endereço de servidor válido.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`${sanitized}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Servidor respondeu com status ${res.status}`);
    }

    const data = await res.json();
    return {
      ok: true,
      companyName: data.companyName || 'Servidor Chat-Interno',
      system: data.system || 'Go Backend',
      url: sanitized,
    };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Tempo limite esgotado (timeout). O servidor não respondeu em 6 segundos.');
    }
    throw new Error('Não foi possível conectar ao servidor. Verifique o endereço e se o servidor está online.');
  }
}

class ChatSocketService {
  private socket: WebSocket | null = null;
  private isConnected: boolean = false;
  private messageListeners: MessageHandler[] = [];
  private statusListeners: StatusHandler[] = [];
  private typingListeners: TypingHandler[] = [];
  private chatClosedListeners: ChatClosedHandler[] = [];
  private operatorAssignedListeners: OperatorAssignedHandler[] = [];
  private notificationListeners: NotificationHandler[] = [];
  private reconnectTimer: any = null;
  private outboxQueue: string[] = [];
  private notifiedMessageIds: Map<string, number> = new Map();

  public getConnected(): boolean {
    return this.isConnected;
  }

  public getApiHttpBaseUrl(): string {
    return getApiHttpBaseUrl();
  }

  public getWebSocketUrl(): string {
    return getWebSocketUrl();
  }

  public async initConfig(): Promise<string> {
    await ensureConfigLoaded();
    return getApiHttpBaseUrl();
  }

  public async setServerUrl(newUrl: string, companyName?: string): Promise<void> {
    const sanitized = sanitizeServerUrl(newUrl);
    runtimeServerUrl = sanitized;
    if (companyName) {
      runtimeCompanyName = companyName;
    }
    try {
      await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, sanitized);
      if (companyName) {
        await AsyncStorage.setItem(SERVER_NAME_STORAGE_KEY, companyName);
      }
    } catch {}

    // Desconecta socket atual para forçar reconexão imediata com a nova base
    if (this.socket) {
      this.disconnect();
    }
  }

  public async clearServerUrl(): Promise<void> {
    runtimeServerUrl = null;
    runtimeCompanyName = null;
    try {
      await AsyncStorage.removeItem(SERVER_URL_STORAGE_KEY);
      await AsyncStorage.removeItem(SERVER_NAME_STORAGE_KEY);
    } catch {}
    if (this.socket) {
      this.disconnect();
    }
  }

  public getCompanyName(): string | null {
    return runtimeCompanyName;
  }

  public hasCustomConfiguredServer(): boolean {
    return Boolean(runtimeServerUrl);
  }

  public joinRoom(conversationId: string, department: string = '') {
    if (!conversationId) return;
    const raw = JSON.stringify({
      type: 'join_room',
      payload: { conversationId, department },
    });
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(raw);
    } else {
      this.outboxQueue.push(raw);
    }
  }

  public connect(
    conversationId: string,
    clientId: string,
    clientName: string,
    department: string = '',
    contactName: string = '',
    cpfCnpj: string = '',
    deviceId: string = ''
  ) {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      if (conversationId) {
        this.joinRoom(conversationId, department);
      }
      return;
    }

    try {
      const baseUrl = getWebSocketUrl();
      const params = new URLSearchParams({
        conversationId,
        clientId,
        clientName,
        department,
      });
      if (contactName) params.append('contactName', contactName);
      if (cpfCnpj) params.append('cpfCnpj', cpfCnpj);
      if (deviceId) params.append('deviceId', deviceId);

      const url = `${baseUrl}?${params.toString()}`;
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
          const raw = typeof event.data === 'string' ? event.data : '';
          const lines = raw.split('\n').filter((l: string) => l.trim().length > 0);
          for (const line of lines) {
            const data = JSON.parse(line);
            if (data.type === 'message' && data.payload) {
              this.notifyMessage(data.payload);
              // Notifica nativamente com som e banner caso o operador responda com o app minimizado
              if (data.payload.senderType === 'operator' && AppState.currentState !== 'active') {
                const msgId = data.payload.id || `${data.payload.conversationId}-${data.payload.timestamp}`;
                const now = Date.now();
                for (const [k, ts] of this.notifiedMessageIds.entries()) {
                  if (now - ts > 30000) this.notifiedMessageIds.delete(k);
                }
                if (!this.notifiedMessageIds.has(msgId)) {
                  this.notifiedMessageIds.set(msgId, now);
                  notificationService.showNativeNotification(
                    `Atendente: ${data.payload.senderName || 'Suporte'}`,
                    data.payload.content || 'Nova mensagem no atendimento',
                    {
                      id: msgId,
                      type: 'chat_message',
                      conversationId: data.payload.conversationId,
                      senderName: data.payload.senderName,
                    },
                    'sol-chat'
                  ).catch(() => {});
                }
              }
            } else if (data.type === 'typing' && data.payload) {
              this.notifyTyping(data.payload.isTyping, data.payload.senderName || 'Operador');
            } else if (data.type === 'operator_assigned' && data.payload) {
              this.notifyOperatorAssigned(data.payload.operatorId || '', data.payload.operatorName || 'Operador');
            } else if (data.type === 'chat_closed') {
              const reason = data.payload?.reason || 'Atendimento encerrado pelo operador';
              this.notifyChatClosed(reason);
            } else if (data.type === 'campaign_notification' && data.payload) {
              this.notifyNotification(data.payload);
              notificationService.showNativeNotification(
                data.payload.title || 'Comunicado Importante',
                data.payload.message || 'Você recebeu um novo comunicado.',
                data.payload,
                'sol-campaigns'
              ).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('[MOBILE WS] Falha ao processar mensagem do servidor', e);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.notifyStatus(false);
        this.scheduleReconnect(conversationId, clientId, clientName, department, contactName, cpfCnpj, deviceId);
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
      this.scheduleReconnect(conversationId, clientId, clientName, department, contactName, cpfCnpj, deviceId);
    }
  }

  private scheduleReconnect(
    conversationId: string,
    clientId: string,
    clientName: string,
    department: string = '',
    contactName: string = '',
    cpfCnpj: string = '',
    deviceId: string = ''
  ) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      console.log('[MOBILE WS] Tentando reconectar ao Go Server...');
      this.connect(conversationId, clientId, clientName, department, contactName, cpfCnpj, deviceId);
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

  public onOperatorAssigned(handler: OperatorAssignedHandler) {
    this.operatorAssignedListeners.push(handler);
    return () => {
      this.operatorAssignedListeners = this.operatorAssignedListeners.filter((h) => h !== handler);
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

  private notifyOperatorAssigned(operatorId: string, operatorName: string) {
    this.operatorAssignedListeners.forEach((h) => h(operatorId, operatorName));
  }

  public onNotification(handler: NotificationHandler) {
    this.notificationListeners.push(handler);
    return () => {
      this.notificationListeners = this.notificationListeners.filter((h) => h !== handler);
    };
  }

  private notifyNotification(notif: any) {
    this.notificationListeners.forEach((h) => h(notif));
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

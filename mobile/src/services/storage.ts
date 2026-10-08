import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ClientProfile, ConversationSession, Message } from '../types/chat';
import { getApiHttpBaseUrl } from './chatSocket';

import { notificationService } from './notificationService';

const CLIENT_KEY = '@chat_client_profile';
const SESSION_KEY = '@chat_current_session';
const DEVICE_ID_KEY = '@sol_device_id';
const CLOSED_SESSIONS_KEY = '@chat_closed_sessions';
const MSGS_PREFIX = '@chat_msgs_';

export const storage = {
  // Retorna ou gera identificador único persistente deste aparelho celular
  async getDeviceId(): Promise<string> {
    try {
      let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        await AsyncStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch {
      return `dev-${Date.now()}`;
    }
  },

  // Vincula o aparelho do cliente ao CPF no backend para recebimento de campanhas e notificações
  async registerDevice(cpfCnpj: string = '', clientName: string = ''): Promise<void> {
    try {
      const deviceId = await this.getDeviceId();
      const cleanCpf = cpfCnpj.replace(/\D/g, '');
      const baseUrl = getApiHttpBaseUrl();
      const pushToken = await notificationService.getPushToken();

      await fetch(`${baseUrl}/api/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          cpfCnpj: cleanCpf,
          clientName: clientName.trim(),
          platform: Platform.OS,
          pushToken: pushToken || '',
          appVersion: '1.0.0',
        }),
      });
      console.log('[DEVICE] Aparelho registrado no backend:', deviceId, 'CPF:', cleanCpf, 'PushToken:', pushToken ? 'SIM' : 'NÃO');
    } catch (e) {
      console.warn('[DEVICE] Falha ao registrar aparelho:', e);
    }
  },

  async saveClientProfile(profile: ClientProfile): Promise<void> {
    try {
      await AsyncStorage.setItem(CLIENT_KEY, JSON.stringify(profile));
      // Já aproveita para vincular o aparelho ao CPF do perfil salvo!
      if (profile.cpfCnpj) {
        this.registerDevice(profile.cpfCnpj, profile.name).catch(() => {});
      }
    } catch (e) {
      console.error('Failed to save client profile', e);
    }
  },

  async getClientProfile(): Promise<ClientProfile | null> {
    try {
      const data = await AsyncStorage.getItem(CLIENT_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Failed to get client profile', e);
      return null;
    }
  },

  async saveCurrentSession(session: ConversationSession): Promise<void> {
    try {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      console.error('Failed to save session', e);
    }
  },

  async getCurrentSession(): Promise<ConversationSession | null> {
    try {
      const data = await AsyncStorage.getItem(SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Failed to get session', e);
      return null;
    }
  },

  async clearSession(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.error('Failed to clear session', e);
    }
  },

  // Persiste mensagens de um atendimento específico (evita iniciar em branco ao sair e voltar)
  async saveConversationMessages(convId: string, messages: Message[]): Promise<void> {
    if (!convId) return;
    try {
      await AsyncStorage.setItem(`${MSGS_PREFIX}${convId}`, JSON.stringify(messages));
    } catch (e) {
      console.error('Failed to save conversation messages', e);
    }
  },

  async getConversationMessages(convId: string): Promise<Message[]> {
    if (!convId) return [];
    try {
      const data = await AsyncStorage.getItem(`${MSGS_PREFIX}${convId}`);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to get conversation messages', e);
      return [];
    }
  },

  // Salva no histórico de atendimentos finalizados para consulta posterior do cliente
  async saveClosedSession(session: ConversationSession): Promise<void> {
    if (!session || !session.id) return;
    try {
      const list = await this.getClosedSessions();
      const filtered = list.filter((s) => s.id !== session.id);
      const updated = [session, ...filtered].slice(0, 30); // Mantém os 30 últimos
      await AsyncStorage.setItem(CLOSED_SESSIONS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save closed session', e);
    }
  },

  async getClosedSessions(): Promise<ConversationSession[]> {
    try {
      const data = await AsyncStorage.getItem(CLOSED_SESSIONS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to get closed sessions', e);
      return [];
    }
  },

  // Gerenciamento dinâmico da base/servidor de conexão
  async getServerUrl(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('@chat_server_base_url');
    } catch {
      return null;
    }
  },

  async getServerCompanyName(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('@chat_server_company_name');
    } catch {
      return null;
    }
  },

  async saveServerUrl(url: string, companyName?: string): Promise<void> {
    const { chatSocket } = await import('./chatSocket');
    await chatSocket.setServerUrl(url, companyName);
  },

  async clearServerUrl(): Promise<void> {
    const { chatSocket } = await import('./chatSocket');
    await chatSocket.clearServerUrl();
  },
};

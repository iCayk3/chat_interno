import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClientProfile, ConversationSession } from '../types/chat';

const CLIENT_KEY = '@chat_client_profile';
const SESSION_KEY = '@chat_current_session';

export const storage = {
  async saveClientProfile(profile: ClientProfile): Promise<void> {
    try {
      await AsyncStorage.setItem(CLIENT_KEY, JSON.stringify(profile));
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
  }
};

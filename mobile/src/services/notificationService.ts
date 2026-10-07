import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const PUSH_TOKEN_KEY = '@sol_push_token';

// Configuração de apresentação da notificação em primeiro plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface NotificationPayload {
  id?: string;
  type?: 'campaign_notification' | 'chat_message' | 'operator_assigned' | 'system';
  title?: string;
  message?: string;
  department?: string;
  actionType?: 'chat_and_view' | 'view_only';
  chatInitialMsg?: string;
  campaignId?: string;
  conversationId?: string;
  senderName?: string;
  [key: string]: any;
}

export const notificationService = {
  /**
   * Inicializa os canais de notificação no Android e pede permissões no iOS/Android
   */
  async initNotifications(): Promise<void> {
    try {
      if (Platform.OS === 'web') return;

      // 1. Solicita permissão primeiro (necessário no Android 13+ e iOS)
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          console.log('[NOTIF] Permissão de notificação não concedida pelo usuário.');
          return;
        }

        console.log('[NOTIF] Permissão de notificações concedida com sucesso.');
      } catch (permErr) {
        console.warn('[NOTIF] Erro ao obter permissões de notificação:', permErr);
      }

      // 2. Configura os canais nativos do Android (apenas em APK / Standalone builds, pois no Expo Go os canais pertencem ao shell do app)
      const isExpoGo =
        Constants.appOwnership === 'expo' ||
        (Constants as any).executionEnvironment === 'storeClient';

      if (Platform.OS === 'android' && !isExpoGo) {
        try {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Padrão',
            importance: Notifications.AndroidImportance.MAX,
            enableVibrate: true,
            showBadge: true,
          });

          await Notifications.setNotificationChannelAsync('sol-campaigns', {
            name: 'Comunicados e Campanhas',
            description: 'Avisos importantes de rede, faturas e comunicados em massa',
            importance: Notifications.AndroidImportance.MAX,
            enableVibrate: true,
            showBadge: true,
          });

          await Notifications.setNotificationChannelAsync('sol-chat', {
            name: 'Atendimento & Mensagens',
            description: 'Respostas dos atendentes em tempo real',
            importance: Notifications.AndroidImportance.MAX,
            enableVibrate: true,
            showBadge: true,
          });
        } catch (channelErr) {
          console.warn('[NOTIF] Erro ao configurar canais nativos:', channelErr);
        }
      }
    } catch (e) {
      console.warn('[NOTIF] Erro ao inicializar notificações:', e);
    }
  },

  /**
   * Obtém o token de Push do dispositivo (ExpoPushToken) para envio pelo backend
   * No Expo Go a partir do SDK 53, o suporte a Push Remoto (FCM) no Android foi descontinuado pelo Expo.
   * Em Expo Go, notificações em tempo real funcionam perfeitamente via WebSocket + Notificações Locais.
   * Em builds standalone (APK / Development build) com projectId EAS, o Push Remoto é retornado normalmente.
   */
  async getPushToken(): Promise<string> {
    try {
      if (Platform.OS === 'web') return '';

      // Verifica se já temos em cache local
      const cached = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
      if (cached) return cached;

      // Detecta se estamos rodando dentro do aplicativo Expo Go
      const isExpoGo =
        Constants.appOwnership === 'expo' ||
        (Constants as any).executionEnvironment === 'storeClient';

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId ??
        undefined;

      // No Expo Go no Android (SDK 53+), getExpoPushTokenAsync foi intencionalmente removido pela equipe do Expo
      // e lança uma exceção fatal se for chamado. Pulamos com segurança.
      if (Platform.OS === 'android' && (isExpoGo || !projectId)) {
        console.log('[NOTIF] Expo Go Android (SDK 53+): Push Remoto indisponível no Expo Go. O app usará WebSocket com Notificações Locais.');
        return '';
      }

      if (!projectId) {
        return '';
      }

      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const { status: reqStatus } = await Notifications.requestPermissionsAsync();
        if (reqStatus !== 'granted') {
          return '';
        }
      }

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        if (tokenData?.data) {
          await AsyncStorage.setItem(PUSH_TOKEN_KEY, tokenData.data);
          return tokenData.data;
        }
      } catch (tokenErr: any) {
        console.log('[NOTIF] Push Token remoto indisponível neste ambiente:', tokenErr?.message);
      }

      return '';
    } catch (e) {
      console.warn('[NOTIF] Falha segura ao verificar push token:', e);
      return '';
    }
  },

  /**
   * Exibe uma notificação nativa de sistema no aparelho (estilo WhatsApp)
   * Dispara som, vibração e banner no topo da tela (Heads-up notification)
   * Totalmente suportado no Expo Go e em builds standalone.
   */
  async showNativeNotification(
    title: string,
    body: string,
    data: NotificationPayload = {},
    channelId: 'sol-campaigns' | 'sol-chat' = 'sol-campaigns'
  ): Promise<void> {
    try {
      if (Platform.OS === 'web') return;

      const isExpoGo =
        Constants.appOwnership === 'expo' ||
        (Constants as any).executionEnvironment === 'storeClient';

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data as Record<string, unknown>,
          priority: Notifications.AndroidNotificationPriority.MAX,
          badge: 1,
        },
        trigger: !isExpoGo && channelId ? ({ channelId } as any) : null,
      });
      console.log('[NOTIF] Notificação nativa disparada com sucesso:', title);
    } catch (e) {
      console.warn('[NOTIF] Falha ao agendar notificação nativa:', e);
    }
  },

  /**
   * Registra listener para quando o usuário toca na notificação (fora do app ou na barra de status)
   */
  addNotificationResponseListener(
    callback: (data: NotificationPayload) => void
  ): Notifications.EventSubscription | { remove: () => void } {
    try {
      if (Platform.OS === 'web') return { remove: () => {} };
      return Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          const data = response.notification.request.content.data as NotificationPayload;
          console.log('[NOTIF] Usuário tocou na notificação do sistema:', data);
          if (data) {
            callback(data);
          }
        } catch (e) {
          console.warn('[NOTIF] Erro ao processar toque na notificação:', e);
        }
      });
    } catch (e) {
      console.warn('[NOTIF] Falha ao adicionar listener de resposta:', e);
      return { remove: () => {} };
    }
  },

  /**
   * Verifica se o aplicativo foi aberto a partir do clique em uma notificação com o app fechado
   */
  async checkInitialNotification(
    callback: (data: NotificationPayload) => void
  ): Promise<void> {
    try {
      if (Platform.OS === 'web') return;
      const response = await Notifications.getLastNotificationResponseAsync();
      if (response) {
        const data = response.notification.request.content.data as NotificationPayload;
        if (data) {
          console.log('[NOTIF] App iniciado a partir do toque na notificação:', data);
          callback(data);
        }
      }
    } catch (e) {
      console.warn('[NOTIF] Erro ao verificar notificação inicial:', e);
    }
  },
};

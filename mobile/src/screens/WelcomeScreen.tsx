import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
  Image,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { RootStackParamList, ClientProfile, ConversationSession, Message } from '../types/chat';
import { colors } from '../theme/colors';
import { storage } from '../services/storage';
import { downloadAndSavePdf } from '../services/fileDownload';
import { chatSocket, isWhiteLabelBuild, testServerConnection } from '../services/chatSocket';
import { notificationService, NotificationPayload } from '../services/notificationService';
import { ServerConfigModal } from '../components/ServerConfigModal';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

type HomeOption = 'chat' | 'financial' | 'unlock';

interface ClientNotification {
  id: string;
  campaignId: string;
  title: string;
  message: string;
  department: string;
  actionType: 'chat_and_view' | 'view_only';
  chatInitialMsg?: string;
  cpfCnpj?: string;
  deviceId?: string;
  read: boolean;
  createdAt: string;
}

interface RBXDocument {
  id: number;
  dueDate: string;
  documentNumber: string;
  value: number;
  historic?: string;
  status: 'aberto' | 'vencido' | 'pago';
  pixCopiaCola?: string;
  pixQrCode?: string;
  boletoLink?: string;
}

const DEPARTMENTS = [
  { id: 'support', label: 'Suporte Técnico', icon: 'hardware-chip-outline' },
  { id: 'doubts', label: 'Dúvidas Gerais', icon: 'help-circle-outline' },
  { id: 'financial', label: 'Financeiro / Faturamento', icon: 'card-outline' },
  { id: 'commercial', label: 'Comercial', icon: 'briefcase-outline' },
];

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [cpfCnpj, setCpfCnpj] = useState('');
  // O campo do nome inicia SEMPRE em branco conforme regra de negócio
  const [name, setName] = useState('');
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0].id);
  const [activeOption, setActiveOption] = useState<HomeOption>('chat');
  const [hasExistingSession, setHasExistingSession] = useState(false);

  // Estados do Histórico de Atendimentos Encerrados
  const [closedSessions, setClosedSessions] = useState<ConversationSession[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistorySession, setSelectedHistorySession] = useState<ConversationSession | null>(null);
  const [historyMessages, setHistoryMessages] = useState<Message[]>([]);
  const [loadingHistoryMessages, setLoadingHistoryMessages] = useState(false);

  // Estados de Campanhas e Notificações em Massa
  const [activeNotification, setActiveNotification] = useState<ClientNotification | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState<ClientNotification[]>([]);
  const [loadingNotificationAction, setLoadingNotificationAction] = useState(false);

  // Estados de Integração com o ERP RBX
  const [isSearchingRbx, setIsSearchingRbx] = useState(false);
  const [rbxVerifiedClient, setRbxVerifiedClient] = useState<{
    codigo: string;
    nome: string;
    contrato?: string;
    conexao?: string;
    cidade?: string;
  } | null>(null);
  const [rbxError, setRbxError] = useState<string | null>(null);

  // Estados da Segunda Via de Boleto
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const [financialDocs, setFinancialDocs] = useState<RBXDocument[]>([]);
  const [loadingBoletoDocId, setLoadingBoletoDocId] = useState<number | null>(null);
  const [loadingPixDocId, setLoadingPixDocId] = useState<number | null>(null);

  // Estado do Modal de Pix com QR Code
  const [pixModalData, setPixModalData] = useState<{
    doc: RBXDocument;
    pixCode: string;
    qrCodeBase64: string;
  } | null>(null);
  const [pixCopiedModal, setPixCopiedModal] = useState(false);

  // Estados do Desbloqueio em Confiança
  const [isProcessingUnlock, setIsProcessingUnlock] = useState(false);
  const [unlockSuccessMsg, setUnlockSuccessMsg] = useState<string | null>(null);

  // Estados de Conexão com Servidor (Híbrido)
  const [showServerModal, setShowServerModal] = useState(false);
  const [connectedServerCompany, setConnectedServerCompany] = useState<string | null>(null);

  // Recarrega sempre que a tela ganha foco (ao voltar do chat)
  useFocusEffect(
    useCallback(() => {
      loadCachedProfile();
    }, [])
  );

  const getApiBaseUrl = () => {
    return chatSocket.getApiHttpBaseUrl();
  };

  // Inicialização do servidor configurado e escuta de pareamento via Deep Linking
  useEffect(() => {
    chatSocket.initConfig().then(async () => {
      const savedName = await storage.getServerCompanyName();
      if (savedName) {
        setConnectedServerCompany(savedName);
      } else {
        try {
          const res = await fetch(`${chatSocket.getApiHttpBaseUrl()}/api/health`);
          if (res.ok) {
            const data = await res.json();
            if (data.companyName) {
              setConnectedServerCompany(data.companyName);
              await storage.saveServerUrl(chatSocket.getApiHttpBaseUrl(), data.companyName);
            }
          }
        } catch {}
      }
    });

    // Escuta deep linking (ex: solchat://connect?server=...)
    const handleUrl = async (urlStr: string | null) => {
      if (!urlStr || isWhiteLabelBuild()) return;
      try {
        if (urlStr.includes('server=')) {
          const match = urlStr.match(/server=([^&]+)/);
          if (match && match[1]) {
            const raw = decodeURIComponent(match[1]);
            const res = await testServerConnection(raw);
            await storage.saveServerUrl(res.url, res.companyName);
            setConnectedServerCompany(res.companyName);
            Alert.alert('Servidor Pareado! ✅', `Aplicativo conectado com sucesso a ${res.companyName}.`);
          }
        }
      } catch (err: any) {
        console.warn('[DEEP LINK] Falha ao parear servidor:', err);
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  // Busca comunicados e notificações de campanhas direcionadas a este cliente/aparelho
  const fetchClientNotifications = async (docClean?: string) => {
    try {
      const clean = docClean || cpfCnpj.replace(/\D/g, '');
      const deviceId = await storage.getDeviceId();
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/notifications/client?cpf=${clean}&deviceId=${deviceId}`);
      if (res.ok) {
        const data: ClientNotification[] = await res.json();
        const unread = data.filter((n) => !n.read);
        setUnreadNotifications(unread);
        if (unread.length > 0) {
          setActiveNotification((current) => current || unread[0]);
        }
      }
    } catch (e) {
      console.warn('[NOTIF] Erro ao buscar comunicados:', e);
    }
  };

  // Escuta notificações em tempo real, registra o aparelho no backend e trata pushs nativos
  useEffect(() => {
    let isMounted = true;

    // Função de abertura/contexto quando o cliente toca na notificação nativa (fora do app ou barra de status)
    const handlePushResponse = (data: NotificationPayload) => {
      console.log('[PUSH TAP] Notificação tocada pelo cliente:', data);
      if (!data) return;

      // Se o push for de resposta de chat do operador, navega diretamente para a conversa
      if (data.type === 'chat_message' && data.conversationId) {
        storage.getClientProfile().then((profile) => {
          if (profile) {
            storage.getCurrentSession().then((session) => {
              if (session && session.id === data.conversationId) {
                navigation.navigate('Chat', { client: profile, session });
              }
            });
          }
        });
        return;
      }

      const parsed: ClientNotification = {
        id: data.notificationId || data.id || `notif-${Date.now()}`,
        campaignId: data.campaignId || '',
        title: data.title || 'Comunicado Importante',
        message: data.message || '',
        department: data.department || '',
        actionType: (data.actionType as any) || 'chat_and_view',
        chatInitialMsg: data.chatInitialMsg || '',
        cpfCnpj: data.cpfCnpj || '',
        deviceId: data.deviceId || '',
        read: false,
        createdAt: new Date().toISOString(),
      };

      setUnreadNotifications((prev) => {
        const exists = prev.some((n) => n.id === parsed.id);
        if (exists) return prev;
        return [parsed, ...prev];
      });
      setActiveNotification(parsed);
    };

    const pushSub = notificationService.addNotificationResponseListener(handlePushResponse);
    notificationService.checkInitialNotification(handlePushResponse);

    // Escuta retorno do app do plano de fundo para primeiro plano
    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        storage.getClientProfile().then((profile) => {
          fetchClientNotifications(profile?.cpfCnpj || '');
        });
      }
    });

    (async () => {
      try {
        // Inicializa canais nativos do Android (som, vibração e alta prioridade) e pede permissões
        await notificationService.initNotifications();

        const deviceId = await storage.getDeviceId();
        const profile = await storage.getClientProfile();
        const cleanCpf = profile?.cpfCnpj || '';

        // Garante registro inicial do aparelho e token de push no backend
        await storage.registerDevice(cleanCpf, profile?.name || '');

        // Conecta ao WS para receber broadcasts e notificações em tempo real
        chatSocket.connect(
          '',
          `client-${deviceId}`,
          profile?.name || 'Cliente App',
          profile?.department || '',
          profile?.contactName || '',
          cleanCpf,
          deviceId
        );

        if (isMounted) {
          fetchClientNotifications(cleanCpf);
        }
      } catch (err) {
        console.warn('[NOTIF INIT ERROR]', err);
      }
    })();

    // Registra listener em tempo real para eventos de campanha
    const unsubscribeNotif = chatSocket.onNotification((notif: ClientNotification) => {
      console.log('[NOTIF REALTIME] Recebido comunicado:', notif?.title);
      if (!notif) return;
      setUnreadNotifications((prev) => {
        const exists = prev.some((n) => n.id === notif.id);
        if (exists) return prev;
        return [notif, ...prev];
      });
      setActiveNotification(notif);
    });

    return () => {
      isMounted = false;
      pushSub.remove();
      appStateSub.remove();
      unsubscribeNotif();
    };
  }, []);

  // Ação 1: Fechar / Apenas Visualizar a notificação (marca como lida no servidor)
  const handleCloseNotification = async () => {
    if (!activeNotification) return;
    const notifId = activeNotification.id;

    try {
      const baseUrl = getApiBaseUrl();
      await fetch(`${baseUrl}/api/notifications/${notifId}/read`, {
        method: 'POST',
      });
    } catch (e) {
      console.warn('[NOTIF READ] Falha ao marcar como lida:', e);
    }

    setUnreadNotifications((prev) => prev.filter((n) => n.id !== notifId));
    setActiveNotification(null);
  };

  // Ação 2: Iniciar Atendimento a partir da notificação com contexto automático
  const handleStartChatFromNotification = async () => {
    if (!activeNotification) return;

    const cleanDoc =
      cpfCnpj.replace(/\D/g, '') ||
      (activeNotification.cpfCnpj ? activeNotification.cpfCnpj.replace(/\D/g, '') : '');

    if (!cleanDoc || cleanDoc.length < 11) {
      Alert.alert(
        'Identificação Necessária',
        'Por favor, preencha o seu CPF na tela inicial para que possamos localizar seu cadastro antes de iniciar o atendimento sobre este comunicado.',
        [
          {
            text: 'OK',
            onPress: () => {
              setActiveNotification(null);
            },
          },
        ]
      );
      return;
    }

    setLoadingNotificationAction(true);
    try {
      const customContact = name.trim();
      const titularName = rbxVerifiedClient?.nome || 'Cliente SOL';
      const clientId = 'client-' + (rbxVerifiedClient?.codigo || cleanDoc);

      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/notifications/${activeNotification.id}/start-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientName: titularName,
          contactName: customContact || titularName,
          cpfCnpj: cleanDoc,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const clientProfile: ClientProfile = {
          id: clientId,
          name: titularName,
          contactName: customContact || undefined,
          emailOrDoc: cpfCnpj.trim() || cleanDoc,
          cpfCnpj: cleanDoc,
          department: activeNotification.department || 'Atendimento Geral',
        };

        await storage.saveClientProfile(clientProfile);

        if (data.conversation) {
          await storage.saveCurrentSession({
            id: data.conversationId || data.conversation.id,
            clientId: data.conversation.clientId,
            clientName: data.conversation.clientName,
            department: data.conversation.department,
            status: data.conversation.status,
            createdAt: data.conversation.createdAt,
            operator: data.conversation.operator,
          });
        }

        const notifId = activeNotification.id;
        setUnreadNotifications((prev) => prev.filter((n) => n.id !== notifId));
        setActiveNotification(null);

        // Navega diretamente para o Chat com o atendimento já criado e contextualizado
        navigation.navigate('Chat', {
          client: clientProfile,
          session: data.conversation,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Atendimento', err.error || 'Não foi possível iniciar o atendimento.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Falha ao comunicar com o servidor para iniciar atendimento.');
    } finally {
      setLoadingNotificationAction(false);
    }
  };

  const loadCachedProfile = async () => {
    const profile = await storage.getClientProfile();
    if (profile) {
      if (profile.emailOrDoc) {
        setCpfCnpj(formatCpfCnpj(profile.emailOrDoc));
        const clean = profile.emailOrDoc.replace(/\D/g, '');
        if (clean.length === 11 || clean.length === 14) {
          storage.registerDevice(clean, profile.name).catch(() => {});
          fetchClientNotifications(clean);
        }
      }
      if (profile.department) setSelectedDept(profile.department);
      // O campo name inicia sempre em branco
    } else {
      fetchClientNotifications();
    }

    const session = await storage.getCurrentSession();
    if (session && session.status !== 'closed') {
      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/conversations/${session.id}`);
        if (res.ok) {
          const conv = await res.json();
          if (conv.status === 'closed') {
            session.status = 'closed';
            await storage.saveCurrentSession(session);
            await storage.saveClosedSession(session);
            setHasExistingSession(false);
          } else if (conv.operator && conv.operator.name) {
            session.operator = conv.operator;
            session.status = conv.status;
            await storage.saveCurrentSession(session);
          }
        } else if (res.status === 404) {
          await storage.clearSession();
          setHasExistingSession(false);
        }
      } catch {}
      setHasExistingSession(session.status !== 'closed');
    } else {
      setHasExistingSession(false);
    }

    // Carrega atendimentos encerrados para visualização do histórico
    try {
      const localClosed = await storage.getClosedSessions();
      setClosedSessions(localClosed);

      const docDigits = (profile?.emailOrDoc || cpfCnpj).replace(/\D/g, '');
      if (docDigits.length >= 11) {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/conversations?cpfCnpj=${docDigits}&status=closed`);
        if (res.ok) {
          const serverClosed = await res.json();
          if (Array.isArray(serverClosed) && serverClosed.length > 0) {
            setClosedSessions((prev) => {
              const map = new Map<string, ConversationSession>();
              prev.forEach((s) => map.set(s.id, s));
              serverClosed.forEach((s: any) => map.set(s.id, {
                id: s.id,
                clientId: s.clientId,
                clientName: s.clientName,
                department: s.department,
                status: s.status,
                createdAt: s.createdAt,
                operator: s.operator,
              }));
              return Array.from(map.values()).sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );
            });
          }
        }
      }
    } catch (e) {
      console.warn('[HISTORY] Erro ao carregar histórico:', e);
    }
  };

  const handleOpenHistorySession = async (sess: ConversationSession) => {
    setSelectedHistorySession(sess);
    setLoadingHistoryMessages(true);
    setHistoryMessages([]);
    try {
      // 1. Tenta carregar do cache local
      const localMsgs = await storage.getConversationMessages(sess.id);
      if (localMsgs && localMsgs.length > 0) {
        setHistoryMessages(localMsgs);
      }

      // 2. Busca do servidor Go
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/conversations/${sess.id}/messages?limit=100`);
      if (res.ok) {
        const msgs = await res.json();
        if (Array.isArray(msgs) && msgs.length > 0) {
          setHistoryMessages(msgs);
          await storage.saveConversationMessages(sess.id, msgs);
        }
      }
    } catch (e) {
      console.warn('[HISTORY] Erro ao abrir mensagens do histórico:', e);
    } finally {
      setLoadingHistoryMessages(false);
    }
  };

  // Máscara dinâmica para CPF (11 dígitos) e CNPJ (14 dígitos)
  const formatCpfCnpj = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return numbers
      .slice(0, 14)
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  };

  const handleCpfChange = (text: string) => {
    const formatted = formatCpfCnpj(text);
    setCpfCnpj(formatted);
    setRbxError(null);

    const clean = text.replace(/\D/g, '');
    if (rbxVerifiedClient && clean.length < 11) {
      setRbxVerifiedClient(null);
      setFinancialDocs([]);
      setUnlockSuccessMsg(null);
    }

    if (clean.length === 11 || clean.length === 14) {
      consultarRbx(clean);
    }
  };

  // Consulta no Web Service do ERP RBXSoft ISP
  const consultarRbx = async (docDigits: string) => {
    const clean = docDigits.replace(/\D/g, '');
    if (clean.length < 11) {
      Alert.alert('Documento incompleto', 'Informe os 11 dígitos do CPF ou 14 do CNPJ.');
      return;
    }

    setIsSearchingRbx(true);
    setRbxError(null);
    setUnlockSuccessMsg(null);

    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/erp/rbx/customer?cpfCnpj=${clean}`);

      if (res.ok) {
        const client = await res.json();
        setRbxVerifiedClient({
          codigo: client.codigo,
          nome: client.nome,
          contrato: client.contratoDescricao || 'Fibra Óptica SOL',
          conexao: client.conexaoStatus || 'online',
          cidade: client.cidade,
        });

        // Vincula o aparelho no backend para campanhas e busca notificações
        storage.registerDevice(clean, client.nome).catch(() => {});
        fetchClientNotifications(clean);

        // Caso a aba ativa seja financeiro, já busca as faturas imediatamente
        if (activeOption === 'financial') {
          fetchFinancialDocs(client.codigo, clean);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setRbxVerifiedClient(null);
        setRbxError(errData.error || 'CPF/CNPJ não localizado na base do ERP RBX.');
      }
    } catch (err: any) {
      setRbxVerifiedClient(null);
      setRbxError('Não foi possível conectar ao servidor. Verifique a conexão Wi-Fi.');
    } finally {
      setIsSearchingRbx(false);
    }
  };

  // Busca faturas em aberto no RBX
  const fetchFinancialDocs = async (customerId?: string, docClean?: string) => {
    const code = customerId || rbxVerifiedClient?.codigo;
    const clean = docClean || cpfCnpj.replace(/\D/g, '');
    if (!code && !clean) return;

    setLoadingFinancial(true);
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/erp/rbx/financial?customerId=${code || ''}&cpfCnpj=${clean}`);
      if (res.ok) {
        const data = await res.json();
        setFinancialDocs(data.documents || []);
      }
    } catch (e) {
      console.warn('Erro ao buscar financeiro:', e);
    } finally {
      setLoadingFinancial(false);
    }
  };

  // Muda de opção/aba inicial
  const handleSelectOption = (opt: HomeOption) => {
    setActiveOption(opt);
    const clean = cpfCnpj.replace(/\D/g, '');
    if (opt === 'financial' && rbxVerifiedClient) {
      fetchFinancialDocs();
    }
    if (!clean || clean.length < 11) {
      Alert.alert(
        'Informe seu CPF/CNPJ',
        'Para acessar esta opção, preencha seu CPF ou CNPJ no campo acima.'
      );
    }
  };

  // Abre o Modal com QR Code e Pix Copia e Cola oficiais do RBX
  const handleOpenPixModal = async (doc: RBXDocument) => {
    setLoadingPixDocId(doc.id);
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/erp/rbx/pix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billetId: doc.id }),
      });

      if (res.ok) {
        const data = await res.json();
        setPixModalData({
          doc,
          pixCode: data.pixCopiaCola || doc.pixCopiaCola || '',
          qrCodeBase64: data.pixQrCode || '',
        });
        setPixCopiedModal(false);
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert('PIX RBX', err.error || 'Não foi possível carregar as informações do PIX.');
      }
    } catch {
      Alert.alert('Erro', 'Falha ao consultar PIX no servidor.');
    } finally {
      setLoadingPixDocId(null);
    }
  };

  // Copia o código Pix direto pelo modal
  const handleCopyPixFromModal = async () => {
    if (!pixModalData?.pixCode) return;
    await Clipboard.setStringAsync(pixModalData.pixCode);
    setPixCopiedModal(true);
    Alert.alert('PIX Copiado!', 'O código Pix Copia e Cola foi copiado para a sua área de transferência.');
    setTimeout(() => setPixCopiedModal(false), 3000);
  };

  // Abre o link do Boleto PDF gerado na V2 do RBX (get_banking_billet)
  const handleOpenBoleto = async (doc: RBXDocument) => {
    setLoadingBoletoDocId(doc.id);
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/erp/rbx/boleto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.boletoLink) {
          console.log('[BOLETO RBX LINK]', data.boletoLink);
          await downloadAndSavePdf(data.boletoLink, `boleto_${doc.documentNumber || doc.id}.pdf`);
          return;
        }
      }

      const err = await res.json().catch(() => ({}));
      Alert.alert('Boleto RBX', err.error || 'Não foi possível gerar o link do boleto no momento.');
    } catch (e: any) {
      Alert.alert('Erro', 'Falha ao comunicar com o servidor RBX para gerar o boleto.');
    } finally {
      setLoadingBoletoDocId(null);
    }
  };

  // Registra o desbloqueio em confiança de 48h
  const handleRequestUnlock = async () => {
    if (!rbxVerifiedClient) {
      Alert.alert('CPF Necessário', 'Informe seu CPF/CNPJ e localize o cadastro primeiro.');
      return;
    }

    Alert.alert(
      'Desbloqueio em Confiança',
      'Deseja solicitar o desbloqueio temporário da sua conexão por 48 horas?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar Desbloqueio',
          onPress: async () => {
            setIsProcessingUnlock(true);
            try {
              const baseUrl = getApiBaseUrl();
              const overdueDoc = financialDocs.find((d) => d.status === 'vencido');
              const docId = overdueDoc ? overdueDoc.id : 0;

              const res = await fetch(`${baseUrl}/api/erp/rbx/promessa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customerId: rbxVerifiedClient.codigo,
                  documentId: docId,
                }),
              });

              if (res.ok) {
                const data = await res.json();
                setUnlockSuccessMsg(
                  data.message || 'Desbloqueio em confiança realizado com sucesso! Conexão liberada por 48h.'
                );
                setRbxVerifiedClient((prev) => (prev ? { ...prev, conexao: 'online' } : null));
              } else {
                const err = await res.json().catch(() => ({}));
                Alert.alert('Aviso', err.error || 'Não foi possível registrar o desbloqueio em confiança.');
              }
            } catch (e) {
              Alert.alert('Erro de Conexão', 'Falha ao comunicar com o servidor do provedor.');
            } finally {
              setIsProcessingUnlock(false);
            }
          },
        },
      ]
    );
  };

  // Inicia o atendimento via Chat
  const handleStartChat = async (resumeExisting: boolean = false) => {
    const cleanDoc = cpfCnpj.replace(/\D/g, '');

    if (!cleanDoc || cleanDoc.length < 11) {
      Alert.alert(
        'CPF/CNPJ Obrigatório',
        'Por favor, informe seu CPF ou CNPJ para consultar seu cadastro no ERP RBX antes de iniciar o atendimento.'
      );
      return;
    }

    if (!rbxVerifiedClient) {
      Alert.alert(
        'Cliente Não Localizado',
        'Seu CPF/CNPJ ainda não foi verificado na base do ERP RBX. Verifique os números digitados ou aguarde a consulta.'
      );
      return;
    }

    // Regra de Negócio:
    // Se o campo do nome foi preenchido: contactName = nome digitado, titular = nome do RBX.
    // Se o campo do nome ficou em branco: usa o nome do titular retornado pelo RBX.
    const customContact = name.trim();
    const titularName = rbxVerifiedClient.nome || 'Cliente SOL';

    const client: ClientProfile = {
      id: 'client-' + (rbxVerifiedClient.codigo || cleanDoc),
      name: titularName,                           // Titular do contrato
      contactName: customContact || undefined,     // Interlocutor identificado (se preenchido)
      emailOrDoc: cpfCnpj.trim(),
      cpfCnpj: cleanDoc,
      department: selectedDept,
    };

    await storage.saveClientProfile(client);

    if (resumeExisting) {
      const existingSession = await storage.getCurrentSession();
      navigation.navigate('Chat', { client, session: existingSession || undefined });
    } else {
      await storage.clearSession();
      navigation.navigate('Chat', { client });
    }
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header branding */}
          <View style={styles.header}>
            {!isWhiteLabelBuild() && (
              <TouchableOpacity
                style={styles.serverPill}
                onPress={() => setShowServerModal(true)}
                activeOpacity={0.8}
              >
                <View style={styles.serverPillDot} />
                <Ionicons name="server-outline" size={13} color="#2563EB" />
                <Text style={styles.serverPillText} numberOfLines={1}>
                  {connectedServerCompany ? `Servidor: ${connectedServerCompany}` : 'Conectar Servidor'}
                </Text>
                <Ionicons name="swap-horizontal" size={12} color="#64748B" />
              </TouchableOpacity>
            )}

            <View style={styles.logoBadge}>
              <Ionicons name="chatbubbles" size={34} color={colors.primary} />
            </View>
            <Text style={styles.title}>
              {connectedServerCompany || 'Central de Atendimento'}
            </Text>
            <Text style={styles.subtitle}>
              Atendimento em tempo real • Identifique-se para iniciar.
            </Text>
          </View>

          {/* Resume banner if there is a pending chat */}
          {hasExistingSession && (
            <View style={styles.resumeContainer}>
              <TouchableOpacity
                style={styles.resumeBanner}
                onPress={() => handleStartChat(true)}
                activeOpacity={0.8}
              >
                <View style={styles.resumeInfo}>
                  <Ionicons name="time-outline" size={20} color={colors.primary} />
                  <Text style={styles.resumeText}>Você possui um atendimento em andamento</Text>
                </View>
                <Text style={styles.resumeAction}>Continuar →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.discardSessionBtn}
                onPress={async () => {
                  await storage.clearSession();
                  setHasExistingSession(false);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
                <Text style={styles.discardSessionText}>Descartar atendimento e iniciar do zero</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Banner de Acesso ao Histórico de Atendimentos Encerrados */}
          {closedSessions.length > 0 && (
            <TouchableOpacity
              style={styles.historyBtnBanner}
              onPress={() => setShowHistoryModal(true)}
              activeOpacity={0.8}
            >
              <View style={styles.historyBtnLeft}>
                <View style={styles.historyBtnIconBg}>
                  <Ionicons name="file-tray-full-outline" size={18} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.historyBtnTitle}>Histórico de Atendimentos</Text>
                  <Text style={styles.historyBtnSubtitle}>
                    {closedSessions.length === 1
                      ? '1 atendimento anterior finalizado'
                      : `${closedSessions.length} atendimentos anteriores finalizados`}
                  </Text>
                </View>
              </View>
              <View style={styles.historyBtnAction}>
                <Text style={styles.historyBtnActionText}>Ver</Text>
                <Ionicons name="chevron-forward" size={16} color="#2563EB" />
              </View>
            </TouchableOpacity>
          )}

          {/* Banner de Comunicado em Destaque */}
          {unreadNotifications.length > 0 && !activeNotification && (
            <TouchableOpacity
              style={styles.notificationNoticeBanner}
              onPress={() => setActiveNotification(unreadNotifications[0])}
              activeOpacity={0.8}
            >
              <View style={styles.notificationNoticeIconBg}>
                <Ionicons name="megaphone" size={20} color="#D97706" />
              </View>
              <View style={styles.notificationNoticeContent}>
                <View style={styles.notificationNoticeTopRow}>
                  <Text style={styles.notificationNoticeTitle}>
                    {unreadNotifications.length === 1
                      ? 'Comunicado Importante'
                      : `${unreadNotifications.length} Comunicados Disponíveis`}
                  </Text>
                  <View style={styles.notificationNoticeBadge}>
                    <Text style={styles.notificationNoticeBadgeText}>NOVO</Text>
                  </View>
                </View>
                <Text style={styles.notificationNoticeSubtitle} numberOfLines={1}>
                  {unreadNotifications[0].title}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#D97706" />
            </TouchableOpacity>
          )}

          {/* Card Principal de Identificação */}
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Identificação do Cliente</Text>

            {/* Campo Mandatório: CPF / CNPJ */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>CPF ou CNPJ do Titular *</Text>
                {isSearchingRbx && (
                  <View style={styles.searchingRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.searchingText}>Consultando RBX...</Text>
                  </View>
                )}
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons name="card-outline" size={18} color={colors.primary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { fontWeight: '600' }]}
                  placeholder="000.000.000-00 ou CNPJ"
                  placeholderTextColor={colors.textMuted}
                  value={cpfCnpj}
                  onChangeText={handleCpfChange}
                  keyboardType="numeric"
                  maxLength={18}
                />
                {cpfCnpj.replace(/\D/g, '').length >= 11 && (
                  <TouchableOpacity
                    onPress={() => consultarRbx(cpfCnpj)}
                    style={styles.searchDocBtn}
                  >
                    <Ionicons name="search" size={16} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Card de Cliente Verificado no RBX */}
            {rbxVerifiedClient && (
              <View style={styles.rbxVerifiedCard}>
                <View style={styles.rbxVerifiedHeader}>
                  <Ionicons name="checkmark-circle" size={18} color="#059669" />
                  <Text style={styles.rbxVerifiedTitle}>Titular Localizado no ERP</Text>
                  <View
                    style={[
                      styles.connectionBadge,
                      rbxVerifiedClient.conexao === 'online'
                        ? styles.connOnline
                        : styles.connAlert,
                    ]}
                  >
                    <Text
                      style={[
                        styles.connBadgeText,
                        rbxVerifiedClient.conexao === 'online'
                          ? styles.connTextOnline
                          : styles.connTextAlert,
                      ]}
                    >
                      {rbxVerifiedClient.conexao === 'online'
                        ? 'ONLINE'
                        : rbxVerifiedClient.conexao === 'reducao'
                        ? 'REDUÇÃO'
                        : 'BLOQUEADO'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.rbxClientName}>{rbxVerifiedClient.nome}</Text>
                <View style={styles.rbxDetailsRow}>
                  <Text style={styles.rbxDetailText}>
                    Código: <Text style={styles.rbxDetailBold}>#{rbxVerifiedClient.codigo}</Text>
                  </Text>
                  <Text style={styles.rbxDetailText}>
                    • Plano: <Text style={styles.rbxDetailBold}>{rbxVerifiedClient.contrato}</Text>
                  </Text>
                  {rbxVerifiedClient.cidade && (
                    <Text style={styles.rbxDetailText}>
                      • <Text style={styles.rbxDetailBold}>{rbxVerifiedClient.cidade}</Text>
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Erro de busca no RBX */}
            {rbxError && (
              <View style={styles.rbxErrorCard}>
                <Ionicons name="alert-circle-outline" size={18} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rbxErrorText}>{rbxError}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedDept('commercial');
                      setActiveOption('chat');
                      setRbxError(null);
                    }}
                    style={styles.commercialOptionBtn}
                  >
                    <Text style={styles.commercialOptionText}>
                      Quero ser cliente (Falar com Comercial) →
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* AS 3 OPÇÕES NA TELA INICIAL */}
            <Text style={[styles.sectionTitle, { marginTop: 18, marginBottom: 10 }]}>
              O que você deseja fazer?
            </Text>

            <View style={styles.optionsRow}>
              {/* Opção 1: Atendimento */}
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  activeOption === 'chat' && styles.optionButtonActive,
                ]}
                onPress={() => handleSelectOption('chat')}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.optionIconContainer,
                    activeOption === 'chat' && styles.optionIconContainerActive,
                  ]}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={22}
                    color={activeOption === 'chat' ? colors.primary : colors.textSecondary}
                  />
                </View>
                <Text
                  style={[
                    styles.optionTitle,
                    activeOption === 'chat' && styles.optionTitleActive,
                  ]}
                >
                  Atendimento
                </Text>
              </TouchableOpacity>

              {/* Opção 2: Segunda via de boleto */}
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  activeOption === 'financial' && styles.optionButtonActive,
                ]}
                onPress={() => handleSelectOption('financial')}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.optionIconContainer,
                    activeOption === 'financial' && styles.optionIconContainerActive,
                  ]}
                >
                  <Ionicons
                    name="barcode-outline"
                    size={22}
                    color={activeOption === 'financial' ? colors.primary : colors.textSecondary}
                  />
                </View>
                <Text
                  style={[
                    styles.optionTitle,
                    activeOption === 'financial' && styles.optionTitleActive,
                  ]}
                >
                  2ª Via Boleto
                </Text>
              </TouchableOpacity>

              {/* Opção 3: Desbloqueio em confiança */}
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  activeOption === 'unlock' && styles.optionButtonActive,
                ]}
                onPress={() => handleSelectOption('unlock')}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.optionIconContainer,
                    activeOption === 'unlock' && styles.optionIconContainerActive,
                  ]}
                >
                  <Ionicons
                    name="flash-outline"
                    size={22}
                    color={activeOption === 'unlock' ? colors.primary : colors.textSecondary}
                  />
                </View>
                <Text
                  style={[
                    styles.optionTitle,
                    activeOption === 'unlock' && styles.optionTitleActive,
                  ]}
                >
                  Desbloqueio
                </Text>
              </TouchableOpacity>
            </View>

            {/* CONTEÚDO DA OPÇÃO 1: ATENDIMENTO */}
            {activeOption === 'chat' && (
              <View style={styles.optionContentSection}>
                {/* Campo do Nome: inicia SEMPRE em branco */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.inputLabel}>Quem está falando? (Opcional)</Text>
                    <Text style={styles.inputHint}>Em branco: usa o titular</Text>
                  </View>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder={
                        rbxVerifiedClient
                          ? `Nome do solicitante (Padrão: ${rbxVerifiedClient.nome})`
                          : 'Seu nome (caso não seja o titular)'
                      }
                      placeholderTextColor={colors.textMuted}
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                    />
                  </View>
                  <Text style={styles.nameNotice}>
                    💡 Caso informe outro nome, o atendimento será vinculado ao CPF mas ficará registrado quem solicitou.
                  </Text>
                </View>

                {/* Seleção de Departamento */}
                <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Departamento</Text>
                <View style={styles.deptGrid}>
                  {DEPARTMENTS.map((dept) => {
                    const isSelected = selectedDept === dept.id;
                    return (
                      <TouchableOpacity
                        key={dept.id}
                        style={[styles.deptItem, isSelected && styles.deptItemSelected]}
                        onPress={() => setSelectedDept(dept.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={dept.icon as any}
                          size={18}
                          color={isSelected ? colors.primary : colors.textSecondary}
                        />
                        <Text style={[styles.deptLabel, isSelected && styles.deptLabelSelected]}>
                          {dept.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Botão de Iniciar Atendimento */}
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    (!cpfCnpj.replace(/\D/g, '') || cpfCnpj.replace(/\D/g, '').length < 11) &&
                      styles.submitButtonDisabled,
                  ]}
                  onPress={() => handleStartChat(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitButtonText}>Iniciar Atendimento</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            )}

            {/* CONTEÚDO DA OPÇÃO 2: SEGUNDA VIA DE BOLETO */}
            {activeOption === 'financial' && (
              <View style={styles.optionContentSection}>
                <View style={styles.financialHeader}>
                  <Text style={styles.financialSectionTitle}>Faturas no ERP RBX</Text>
                  <TouchableOpacity
                    onPress={() => fetchFinancialDocs()}
                    disabled={loadingFinancial}
                    style={styles.refreshFinBtn}
                  >
                    <Ionicons
                      name="refresh"
                      size={16}
                      color={colors.primary}
                      style={loadingFinancial ? { transform: [{ rotate: '45deg' }] } : {}}
                    />
                    <Text style={styles.refreshFinText}>Atualizar</Text>
                  </TouchableOpacity>
                </View>

                {loadingFinancial ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.loadingText}>Buscando faturas no RBX...</Text>
                  </View>
                ) : financialDocs.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="checkmark-done-circle-outline" size={40} color="#059669" />
                    <Text style={styles.emptyTitle}>Nenhuma fatura em aberto!</Text>
                    <Text style={styles.emptySubtitle}>
                      Todas as mensalidades do titular estão em dia.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.docsList}>
                    {financialDocs.map((doc) => {
                      const isOverdue = doc.status === 'vencido';
                      const isLoadingPix = loadingPixDocId === doc.id;
                      const isLoadingBoleto = loadingBoletoDocId === doc.id;

                      return (
                        <View key={doc.id} style={styles.docCard}>
                          <View style={styles.docCardHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.docHistoric} numberOfLines={1}>
                                {doc.historic || `Documento #${doc.documentNumber || doc.id}`}
                              </Text>
                              <Text style={styles.docDueDate}>
                                Vencimento: <Text style={{ fontWeight: '700' }}>{doc.dueDate}</Text>
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.docBadge,
                                isOverdue ? styles.docBadgeOverdue : styles.docBadgeOpen,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.docBadgeText,
                                  isOverdue ? styles.docBadgeTextOverdue : styles.docBadgeTextOpen,
                                ]}
                              >
                                {isOverdue ? 'VENCIDO' : 'EM ABERTO'}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.docValueRow}>
                            <Text style={styles.docValueLabel}>Valor:</Text>
                            <Text style={styles.docValueText}>
                              R$ {doc.value.toFixed(2).replace('.', ',')}
                            </Text>
                          </View>

                          {/* Botões de Ação na Fatura: PIX (com QR Code) e Boleto PDF oficial */}
                          <View style={styles.docActionsRow}>
                            <TouchableOpacity
                              style={styles.pixBtn}
                              onPress={() => handleOpenPixModal(doc)}
                              disabled={isLoadingPix}
                              activeOpacity={0.7}
                            >
                              {isLoadingPix ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                              ) : (
                                <>
                                  <Ionicons name="qr-code" size={16} color={colors.primary} />
                                  <Text style={styles.pixBtnText}>Pagar com PIX</Text>
                                </>
                              )}
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.boletoBtn}
                              onPress={() => handleOpenBoleto(doc)}
                              disabled={isLoadingBoleto}
                              activeOpacity={0.7}
                            >
                              {isLoadingBoleto ? (
                                <ActivityIndicator size="small" color="#475569" />
                              ) : (
                                <>
                                  <Ionicons name="document-text-outline" size={16} color="#475569" />
                                  <Text style={styles.boletoBtnText}>Abrir PDF</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* CONTEÚDO DA OPÇÃO 3: DESBLOQUEIO EM CONFIANÇA */}
            {activeOption === 'unlock' && (
              <View style={styles.optionContentSection}>
                <View style={styles.unlockCard}>
                  <View style={styles.unlockHeader}>
                    <View style={styles.unlockIconBg}>
                      <Ionicons name="shield-checkmark-outline" size={24} color="#2563EB" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.unlockTitle}>Desbloqueio em Confiança (48h)</Text>
                      <Text style={styles.unlockSubtitle}>
                        Liberação imediata temporária caso esteja bloqueado ou com velocidade reduzida.
                      </Text>
                    </View>
                  </View>

                  {unlockSuccessMsg ? (
                    <View style={styles.unlockSuccessBox}>
                      <Ionicons name="checkmark-circle" size={24} color="#059669" />
                      <Text style={styles.unlockSuccessText}>{unlockSuccessMsg}</Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.unlockInfoBox}>
                        <Text style={styles.unlockInfoTitle}>Como funciona o desbloqueio:</Text>
                        <Text style={styles.unlockInfoItem}>
                          • A internet é liberada na velocidade máxima por 48 horas.
                        </Text>
                        <Text style={styles.unlockInfoItem}>
                          • Dá tempo para o banco compensar o pagamento da fatura.
                        </Text>
                        <Text style={styles.unlockInfoItem}>
                          • O registro é integrado diretamente com o ERP RBX.
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.unlockButton,
                          (!rbxVerifiedClient || isProcessingUnlock) && styles.submitButtonDisabled,
                        ]}
                        onPress={handleRequestUnlock}
                        disabled={!rbxVerifiedClient || isProcessingUnlock}
                        activeOpacity={0.8}
                      >
                        {isProcessingUnlock ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons name="flash" size={18} color="#FFFFFF" />
                            <Text style={styles.unlockButtonText}>Solicitar Desbloqueio de 48h</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL DE PAGAMENTO VIA PIX COM QR CODE OFICIAL DA V2 DO RBX */}
      <Modal
        visible={!!pixModalData}
        transparent
        animationType="fade"
        onRequestClose={() => setPixModalData(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="qr-code" size={22} color={colors.primary} />
                <Text style={styles.modalTitle}>Pagamento via PIX</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPixModalData(null)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {pixModalData && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
                <View style={styles.modalDocInfo}>
                  <Text style={styles.modalDocHistoric}>
                    {pixModalData.doc.historic || `Documento #${pixModalData.doc.documentNumber || pixModalData.doc.id}`}
                  </Text>
                  <View style={styles.modalValueRow}>
                    <Text style={styles.modalValueLabel}>Valor a pagar:</Text>
                    <Text style={styles.modalValueText}>
                      R$ {pixModalData.doc.value.toFixed(2).replace('.', ',')}
                    </Text>
                  </View>
                  <Text style={styles.modalDueDate}>
                    Vencimento: {pixModalData.doc.dueDate}
                  </Text>
                </View>

                {/* QR Code Oficial da V2 do RBX */}
                {pixModalData.qrCodeBase64 ? (
                  <View style={styles.qrCodeWrapper}>
                    <Text style={styles.qrCodeInstruction}>
                      Aponte a câmera do aplicativo do seu banco:
                    </Text>
                    <View style={styles.qrCodeFrame}>
                      <Image
                        source={{ uri: `data:image/png;base64,${pixModalData.qrCodeBase64}` }}
                        style={styles.qrCodeImage}
                        resizeMode="contain"
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.qrCodePlaceholder}>
                    <Ionicons name="information-circle-outline" size={28} color="#2563EB" />
                    <Text style={styles.qrCodePlaceholderText}>
                      Utilize a chave Pix Copia e Cola abaixo para realizar o pagamento.
                    </Text>
                  </View>
                )}

                {/* Chave Pix Copia e Cola */}
                {pixModalData.pixCode ? (
                  <View style={styles.pixCopiaColaSection}>
                    <Text style={styles.pixCopiaColaLabel}>Pix Copia e Cola:</Text>
                    <View style={styles.pixCodeBox}>
                      <Text style={styles.pixCodeText} numberOfLines={2}>
                        {pixModalData.pixCode}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.copyPixModalBtn, pixCopiedModal && styles.copyPixModalBtnSuccess]}
                      onPress={handleCopyPixFromModal}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={pixCopiedModal ? 'checkmark-circle' : 'copy'}
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.copyPixModalBtnText}>
                        {pixCopiedModal ? 'Código Pix Copiado!' : 'Copiar Código Pix'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.modalDoneBtn}
                  onPress={() => setPixModalData(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalDoneBtnText}>Fechar</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL DE COMUNICADO / NOTIFICAÇÃO EM MASSA */}
      <Modal
        visible={!!activeNotification}
        transparent
        animationType="slide"
        onRequestClose={handleCloseNotification}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.notificationModalContainer}>
            {/* Header com Ícone e Fechar */}
            <View style={styles.notificationModalHeader}>
              <View style={styles.notificationModalBadgeRow}>
                <View style={styles.notificationHeaderIconBg}>
                  <Ionicons name="megaphone" size={22} color="#D97706" />
                </View>
                <View>
                  <Text style={styles.notificationModalTag}>COMUNICADO IMPORTANTE</Text>
                  {activeNotification?.department ? (
                    <Text style={styles.notificationModalDept}>
                      {activeNotification.department}
                    </Text>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity
                onPress={handleCloseNotification}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {activeNotification && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.notificationModalScroll}
              >
                {/* Título do Comunicado */}
                <Text style={styles.notificationModalTitle}>
                  {activeNotification.title}
                </Text>

                {/* Conteúdo / Mensagem */}
                <View style={styles.notificationMessageCard}>
                  <Text style={styles.notificationModalMessage}>
                    {activeNotification.message}
                  </Text>
                </View>

                {/* Se a campanha tem ação de atendimento, mostra o botão primário "Iniciar Atendimento" */}
                {activeNotification.actionType === 'chat_and_view' ? (
                  <View style={styles.notificationActionsCol}>
                    <TouchableOpacity
                      style={styles.notificationStartChatBtn}
                      onPress={handleStartChatFromNotification}
                      disabled={loadingNotificationAction}
                      activeOpacity={0.8}
                    >
                      {loadingNotificationAction ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="chatbubbles" size={20} color="#FFFFFF" />
                          <Text style={styles.notificationStartChatBtnText}>
                            Iniciar Atendimento
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.notificationDismissBtn}
                      onPress={handleCloseNotification}
                      disabled={loadingNotificationAction}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={18}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.notificationDismissBtnText}>
                        Apenas Visualizar
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.notificationActionsCol}>
                    <TouchableOpacity
                      style={styles.notificationStartChatBtn}
                      onPress={handleCloseNotification}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.notificationStartChatBtnText}>
                        Entendido
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL DE HISTÓRICO DE ATENDIMENTOS ENCERRADOS */}
      <Modal
        visible={showHistoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowHistoryModal(false);
          setSelectedHistorySession(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.historyModalContainer}>
            {/* Header */}
            <View style={styles.historyModalHeader}>
              <View style={styles.historyModalTitleRow}>
                {selectedHistorySession ? (
                  <TouchableOpacity
                    onPress={() => setSelectedHistorySession(null)}
                    style={styles.historyBackBtn}
                  >
                    <Ionicons name="arrow-back" size={20} color={colors.text} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.historyModalIconBg}>
                    <Ionicons name="file-tray-full" size={20} color={colors.primary} />
                  </View>
                )}
                <View>
                  <Text style={styles.historyModalTitle}>
                    {selectedHistorySession
                      ? `Atendimento #${selectedHistorySession.id.slice(-6)}`
                      : 'Histórico de Atendimentos'}
                  </Text>
                  <Text style={styles.historyModalSubtitle}>
                    {selectedHistorySession
                      ? selectedHistorySession.department || 'Atendimento Geral'
                      : `${closedSessions.length} atendimento(s) finalizado(s)`}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setShowHistoryModal(false);
                  setSelectedHistorySession(null);
                }}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Conteúdo: Lista de atendimentos ou Detalhes/mensagens do atendimento selecionado */}
            {selectedHistorySession ? (
              <View style={styles.historyDetailContainer}>
                <View style={styles.historyDetailMetaCard}>
                  <View style={styles.historyMetaRow}>
                    <Text style={styles.historyMetaLabel}>Protocolo:</Text>
                    <Text style={styles.historyMetaValue}>{selectedHistorySession.id}</Text>
                  </View>
                  <View style={styles.historyMetaRow}>
                    <Text style={styles.historyMetaLabel}>Data:</Text>
                    <Text style={styles.historyMetaValue}>
                      {new Date(selectedHistorySession.createdAt).toLocaleDateString()} às{' '}
                      {new Date(selectedHistorySession.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={styles.historyMetaRow}>
                    <Text style={styles.historyMetaLabel}>Atendente:</Text>
                    <Text style={styles.historyMetaValue}>
                      {selectedHistorySession.operator?.name || 'Equipe SOL'}
                    </Text>
                  </View>
                  <View style={styles.historyMetaRow}>
                    <Text style={styles.historyMetaLabel}>Status:</Text>
                    <View style={styles.historyStatusBadge}>
                      <Text style={styles.historyStatusBadgeText}>Finalizado</Text>
                    </View>
                  </View>
                </View>

                {loadingHistoryMessages ? (
                  <View style={styles.historyLoadingBox}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.historyLoadingText}>Carregando histórico de mensagens...</Text>
                  </View>
                ) : historyMessages.length === 0 ? (
                  <View style={styles.historyEmptyBox}>
                    <Ionicons name="chatbubble-ellipses-outline" size={32} color={colors.textMuted} />
                    <Text style={styles.historyEmptyText}>Nenhuma mensagem arquivada neste atendimento.</Text>
                  </View>
                ) : (
                  <ScrollView
                    style={styles.historyMessagesScroll}
                    contentContainerStyle={styles.historyMessagesList}
                    showsVerticalScrollIndicator={false}
                  >
                    {historyMessages.map((msg) => {
                      const isClient = msg.senderType === 'client';
                      const isSystem = msg.senderType === 'system';
                      return (
                        <View
                          key={msg.id}
                          style={[
                            styles.historyMsgBubble,
                            isClient && styles.historyMsgClient,
                            isSystem && styles.historyMsgSystem,
                          ]}
                        >
                          <Text
                            style={[
                              styles.historyMsgSender,
                              isClient && styles.historyMsgSenderClient,
                              isSystem && styles.historyMsgSenderSystem,
                            ]}
                          >
                            {msg.senderName || (isClient ? 'Você' : 'Sistema')}
                          </Text>
                          <Text
                            style={[
                              styles.historyMsgText,
                              isClient && styles.historyMsgTextClient,
                              isSystem && styles.historyMsgTextSystem,
                            ]}
                          >
                            {msg.content}
                          </Text>
                          <Text
                            style={[
                              styles.historyMsgTime,
                              isClient && styles.historyMsgTimeClient,
                              isSystem && styles.historyMsgTimeSystem,
                            ]}
                          >
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            ) : (
              <ScrollView
                style={styles.historyListScroll}
                contentContainerStyle={styles.historyListContent}
                showsVerticalScrollIndicator={false}
              >
                {closedSessions.map((sess) => (
                  <TouchableOpacity
                    key={sess.id}
                    style={styles.historyItemCard}
                    onPress={() => handleOpenHistorySession(sess)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.historyItemHeader}>
                      <View style={styles.historyItemIconBg}>
                        <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                      </View>
                      <View style={styles.historyItemMain}>
                        <Text style={styles.historyItemTitle}>
                          {sess.department || 'Atendimento Geral'}
                        </Text>
                        <Text style={styles.historyItemSub}>
                          {new Date(sess.createdAt).toLocaleDateString()} às{' '}
                          {new Date(sess.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {sess.operator?.name ? ` • Atendente: ${sess.operator.name}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal de Conexão com Servidor (Híbrido) */}
      <ServerConfigModal
        visible={showServerModal}
        onClose={() => setShowServerModal(false)}
        onConnected={(company) => {
          setConnectedServerCompany(company);
          fetchClientNotifications();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  serverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 14,
    alignSelf: 'center',
    maxWidth: '90%',
  },
  serverPillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  serverPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
  },
  resumeContainer: {
    marginBottom: 16,
  },
  resumeBanner: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resumeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  resumeText: {
    fontSize: 13,
    color: '#1E40AF',
    fontWeight: '600',
    flex: 1,
  },
  resumeAction: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
  },
  discardSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  discardSessionText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  inputGroup: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  inputHint: {
    fontSize: 11,
    color: colors.textMuted,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchingText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  searchDocBtn: {
    padding: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  nameNotice: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 15,
  },
  rbxVerifiedCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  rbxVerifiedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rbxVerifiedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    flex: 1,
  },
  connectionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  connOnline: {
    backgroundColor: '#DCFCE7',
  },
  connAlert: {
    backgroundColor: '#FEF3C7',
  },
  connBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  connTextOnline: {
    color: '#15803D',
  },
  connTextAlert: {
    color: '#B45309',
  },
  rbxClientName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#14532D',
    marginTop: 4,
  },
  rbxDetailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 3,
  },
  rbxDetailText: {
    fontSize: 11,
    color: '#166534',
  },
  rbxDetailBold: {
    fontWeight: '700',
  },
  rbxErrorCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  rbxErrorText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  commercialOptionBtn: {
    marginTop: 6,
  },
  commercialOptionText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
  },
  // AS 3 OPÇÕES
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  optionButton: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionButtonActive: {
    backgroundColor: '#EFF6FF',
    borderColor: colors.primary,
  },
  optionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  optionIconContainerActive: {
    backgroundColor: '#DBEAFE',
  },
  optionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  optionTitleActive: {
    color: colors.primary,
  },
  optionContentSection: {
    marginTop: 4,
  },
  deptGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  deptItem: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
  },
  deptItemSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: colors.primary,
  },
  deptLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  deptLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // SEÇÃO FINANCEIRA
  financialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  financialSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  refreshFinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  refreshFinText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  docsList: {
    gap: 10,
  },
  docCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
  },
  docCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  docHistoric: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  docDueDate: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  docBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  docBadgeOpen: {
    backgroundColor: '#EFF6FF',
  },
  docBadgeOverdue: {
    backgroundColor: '#FEE2E2',
  },
  docBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  docBadgeTextOpen: {
    color: '#1E40AF',
  },
  docBadgeTextOverdue: {
    color: '#991B1B',
  },
  docValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  docValueLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  docValueText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  docActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pixBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 10,
  },
  pixBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  boletoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 10,
  },
  boletoBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  // SEÇÃO DESBLOQUEIO
  unlockCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
  },
  unlockHeader: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  unlockIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  unlockSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  unlockInfoBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    gap: 4,
  },
  unlockInfoTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  unlockInfoItem: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  unlockButton: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  unlockButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  unlockSuccessBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  unlockSuccessText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
    textAlign: 'center',
    lineHeight: 18,
  },
  // ESTILOS DO MODAL PIX COM QR CODE
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  modalCloseBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  modalScroll: {
    padding: 20,
    alignItems: 'center',
  },
  modalDocInfo: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  modalDocHistoric: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  modalValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalValueLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  modalValueText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  modalDueDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  qrCodeWrapper: {
    alignItems: 'center',
    marginBottom: 18,
    width: '100%',
  },
  qrCodeInstruction: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
    textAlign: 'center',
  },
  qrCodeFrame: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  qrCodeImage: {
    width: 200,
    height: 200,
    backgroundColor: '#FFFFFF',
  },
  qrCodePlaceholder: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    width: '100%',
  },
  qrCodePlaceholderText: {
    fontSize: 12,
    color: '#1E40AF',
    textAlign: 'center',
    lineHeight: 16,
  },
  pixCopiaColaSection: {
    width: '100%',
    marginBottom: 16,
  },
  pixCopiaColaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  pixCodeBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  pixCodeText: {
    fontSize: 11,
    color: '#334155',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  copyPixModalBtn: {
    backgroundColor: colors.primary,
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  copyPixModalBtnSuccess: {
    backgroundColor: '#059669',
  },
  copyPixModalBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalDoneBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalDoneBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  // ESTILOS DO BANNER DE COMUNICADO EM DESTAQUE (HOME)
  notificationNoticeBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#D97706',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  notificationNoticeIconBg: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationNoticeContent: {
    flex: 1,
  },
  notificationNoticeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  notificationNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  notificationNoticeBadge: {
    backgroundColor: '#D97706',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  notificationNoticeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  notificationNoticeSubtitle: {
    fontSize: 12,
    color: '#B45309',
  },

  // ESTILOS DO MODAL DE COMUNICADO/CAMPANHA
  notificationModalContainer: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  notificationModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 16,
  },
  notificationModalBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  notificationHeaderIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationModalTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.8,
  },
  notificationModalDept: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 1,
  },
  notificationModalScroll: {
    paddingBottom: 10,
  },
  notificationModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 24,
    marginBottom: 14,
  },
  notificationMessageCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 20,
  },
  notificationModalMessage: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
  },
  notificationActionsCol: {
    gap: 10,
    width: '100%',
  },
  notificationStartChatBtn: {
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  notificationStartChatBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  notificationDismissBtn: {
    backgroundColor: '#F1F5F9',
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  notificationDismissBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  // Estilos do Histórico de Atendimentos
  historyBtnBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  historyBtnIconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBtnTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
  },
  historyBtnSubtitle: {
    fontSize: 11,
    color: '#3B82F6',
    marginTop: 1,
  },
  historyBtnAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyBtnActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  historyModalContainer: {
    backgroundColor: '#FFFFFF',
    width: '92%',
    maxHeight: '85%',
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  historyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  historyModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  historyBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyModalIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  historyModalSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  historyListScroll: {
    maxHeight: 450,
  },
  historyListContent: {
    padding: 16,
    gap: 10,
  },
  historyItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  historyItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyItemIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyItemMain: {
    flex: 1,
  },
  historyItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  historyItemSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  historyDetailContainer: {
    padding: 16,
    maxHeight: 500,
  },
  historyDetailMetaCard: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    marginBottom: 14,
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyMetaLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  historyMetaValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  historyStatusBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#065F46',
  },
  historyLoadingBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  historyLoadingText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  historyEmptyBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  historyEmptyText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  historyMessagesScroll: {
    maxHeight: 340,
  },
  historyMessagesList: {
    gap: 10,
    paddingBottom: 10,
  },
  historyMsgBubble: {
    maxWidth: '82%',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignSelf: 'flex-start',
  },
  historyMsgClient: {
    backgroundColor: '#DBEAFE',
    alignSelf: 'flex-end',
  },
  historyMsgSystem: {
    backgroundColor: '#FEF3C7',
    alignSelf: 'center',
    maxWidth: '90%',
  },
  historyMsgSender: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  historyMsgSenderClient: {
    color: '#1D4ED8',
    textAlign: 'right',
  },
  historyMsgSenderSystem: {
    color: '#B45309',
    textAlign: 'center',
  },
  historyMsgText: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 18,
  },
  historyMsgTextClient: {
    color: '#1E3A8A',
  },
  historyMsgTextSystem: {
    color: '#92400E',
    textAlign: 'center',
  },
  historyMsgTime: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  historyMsgTimeClient: {
    color: '#60A5FA',
  },
  historyMsgTimeSystem: {
    color: '#D97706',
    alignSelf: 'center',
  },
});

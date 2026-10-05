import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, Message, ConversationSession } from '../types/chat';
import { colors } from '../theme/colors';
import { ChatMessageItem } from '../components/ChatMessageItem';
import { ChatInputBar } from '../components/ChatInputBar';
import { chatSocket } from '../services/chatSocket';
import { storage } from '../services/storage';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export const ChatScreen: React.FC<Props> = ({ route, navigation }) => {
  const { client, session: initialSession } = route.params;
  const insets = useSafeAreaInsets();

  const [session, setSession] = useState<ConversationSession>(
    initialSession || {
      id: 'conv-' + Date.now(),
      clientId: client.id,
      clientName: client.name,
      status: 'waiting',
      createdAt: new Date().toISOString(),
    }
  );

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'sys-start',
      conversationId: session.id,
      senderId: 'system',
      senderType: 'system',
      senderName: 'Sistema',
      content: `Olá, ${client.name}! Sua solicitação foi recebida. Um operador logo irá atender você.`,
      timestamp: new Date().toISOString(),
      status: 'delivered',
    },
  ]);

  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Save session in storage
    storage.saveCurrentSession(session);

    // Connect to WebSocket / real-time service
    chatSocket.connect(session.id, client.id, client.name, client.department);

    const unsubMsg = chatSocket.onMessage((newMsg) => {
      if (newMsg.conversationId && newMsg.conversationId !== session.id) {
        return;
      }

      setIsTyping(false);
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      if (newMsg.senderType === 'operator' && newMsg.senderName) {
        setSession((prev) => {
          const updatedSession: ConversationSession = {
            ...prev,
            status: 'active',
            operator: {
              id: newMsg.senderId,
              name: newMsg.senderName,
            },
          };
          storage.saveCurrentSession(updatedSession);
          return updatedSession;
        });
      }
    });

    const unsubAssigned = chatSocket.onOperatorAssigned((operatorId, operatorName) => {
      setSession((prev) => {
        const updatedSession: ConversationSession = {
          ...prev,
          status: 'active',
          operator: {
            id: operatorId,
            name: operatorName,
          },
        };
        storage.saveCurrentSession(updatedSession);
        return updatedSession;
      });
    });

    // Sincroniza dados do operador com o servidor Go caso a sessão já possua operador atribuído
    const checkServerSession = async () => {
      try {
        const host = typeof window !== 'undefined' && window.location?.hostname === 'localhost' ? 'localhost' : '10.12.199.3';
        const res = await fetch(`http://${host}:8080/api/conversations/${session.id}`);
        if (res.ok) {
          const conv = await res.json();
          if (conv.operator && conv.operator.name) {
            setSession((prev) => {
              const updated: ConversationSession = { ...prev, status: conv.status, operator: conv.operator };
              storage.saveCurrentSession(updated);
              return updated;
            });
          }
        }
      } catch {}
    };
    checkServerSession();

    const unsubStatus = chatSocket.onStatus((connected) => {
      setIsConnected(connected);
    });

    const unsubTyping = chatSocket.onTyping((typing, senderName) => {
      setIsTyping(typing);
      setTypingUser(senderName);
    });

    // Keyboard visibility listeners
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    const unsubClosed = chatSocket.onChatClosed((reason) => {
      const closedSession: ConversationSession = {
        ...session,
        status: 'closed',
      };
      setSession(closedSession);
      storage.saveCurrentSession(closedSession);

      const sysMsg: Message = {
        id: 'sys-closed-' + Date.now(),
        conversationId: session.id,
        senderId: 'system',
        senderType: 'system',
        senderName: 'Atendimento',
        content: reason || 'Atendimento encerrado com sucesso! Agradecemos o seu contato. Para falar com a equipe novamente, basta enviar uma nova mensagem abaixo.',
        timestamp: new Date().toISOString(),
        status: 'delivered',
      };
      setMessages((prev) => [...prev, sysMsg]);
    });

    return () => {
      unsubMsg();
      unsubAssigned();
      unsubStatus();
      unsubTyping();
      unsubClosed();
      showSub.remove();
      hideSub.remove();
    };
  }, [session.id]);

  const handleSendMessage = (text: string) => {
    let currentConvId = session.id;

    // Se o atendimento anterior estiver fechado, cria um NOVO chamado automaticamente (estilo WhatsApp)
    if (session.status === 'closed') {
      const newConvId = 'conv-' + Date.now();
      currentConvId = newConvId;

      const newSession: ConversationSession = {
        id: newConvId,
        clientId: client.id,
        clientName: client.name,
        status: 'waiting',
        createdAt: new Date().toISOString(),
      };
      setSession(newSession);
      storage.saveCurrentSession(newSession);

      // Reconecta o socket para a nova sala
      chatSocket.disconnect();
      chatSocket.connect(newConvId, client.id, client.name, client.department);

      const sysRestartMsg: Message = {
        id: 'sys-start-' + Date.now(),
        conversationId: newConvId,
        senderId: 'system',
        senderType: 'system',
        senderName: 'Sistema',
        content: 'Novo chamado aberto. Um operador irá lhe atender em instantes.',
        timestamp: new Date().toISOString(),
        status: 'delivered',
      };
      setMessages((prev) => [...prev, sysRestartMsg]);
    }

    const newMsg: Message = {
      id: 'msg-' + Date.now(),
      conversationId: currentConvId,
      senderId: client.id,
      senderType: 'client',
      senderName: client.name,
      content: text,
      timestamp: new Date().toISOString(),
      status: 'sent',
    };

    setMessages((prev) => [...prev, newMsg]);
    chatSocket.sendMessage(newMsg);
  };

  const handleTypingStatus = (typing: boolean) => {
    chatSocket.sendTyping(session.id, client.id, typing);
  };

  const handleFinishChat = () => {
    Alert.alert(
      'Encerrar Atendimento',
      'Deseja realmente finalizar este atendimento?',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Encerrar',
          style: 'destructive',
          onPress: async () => {
            const closedSession: ConversationSession = {
              ...session,
              status: 'closed',
            };
            setSession(closedSession);
            await storage.saveCurrentSession(closedSession);

            // Avisa o servidor via REST se possível
            try {
              const host = chatSocket.getConnected() ? '10.12.199.3' : 'localhost';
              await fetch(`http://${host}:8080/api/conversations/${session.id}/close`, { method: 'POST' });
            } catch {}

            const sysCloseMsg: Message = {
              id: 'sys-closed-' + Date.now(),
              conversationId: session.id,
              senderId: 'system',
              senderType: 'system',
              senderName: 'Sistema',
              content: 'Você encerrou este atendimento. Suas mensagens permanecem salvas como histórico.',
              timestamp: new Date().toISOString(),
              status: 'delivered',
            };
            setMessages((prev) => [...prev, sysCloseMsg]);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Custom Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.avatar}>
            <Ionicons
              name={session.operator ? 'person' : 'headset'}
              size={20}
              color={colors.primary}
            />
            <View
              style={[
                styles.statusDot,
                isConnected ? (session.status === 'active' ? styles.statusOnline : styles.statusWaiting) : styles.statusOffline,
              ]}
            />
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.operatorName} numberOfLines={1}>
              {session.operator ? session.operator.name : 'Suporte SOL'}
            </Text>
            <Text style={styles.operatorStatus}>
              {!isConnected
                ? 'Conectando ao servidor Go...'
                : session.status === 'active'
                ? (session.operator ? `Atendido por ${session.operator.name}` : 'Atendimento em andamento')
                : 'Aguardando operador na fila...'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.endChatButton}
            onPress={handleFinishChat}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle-outline" size={24} color={colors.danger} />
          </TouchableOpacity>
        </View>

        {/* Message Feed */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatMessageItem message={item} />}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />

        {/* Typing indicator */}
        {isTyping && (
          <View style={styles.typingBanner}>
            <View style={styles.typingDot} />
            <Text style={styles.typingText}>
              {typingUser ? `${typingUser} está digitando...` : 'Digitando...'}
            </Text>
          </View>
        )}

        {/* Input Bar positioned above keyboard */}
        <View
          style={{
            paddingBottom: isKeyboardVisible ? 0 : Math.max(insets.bottom, 4),
          }}
        >
          <ChatInputBar
            onSendMessage={handleSendMessage}
            onTyping={handleTypingStatus}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  statusOnline: {
    backgroundColor: colors.online,
  },
  statusWaiting: {
    backgroundColor: colors.warning,
  },
  statusOffline: {
    backgroundColor: colors.danger,
  },
  headerInfo: {
    flex: 1,
  },
  operatorName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  operatorStatus: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  endChatButton: {
    padding: 4,
  },
  messageList: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  typingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
    gap: 6,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  typingText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
});

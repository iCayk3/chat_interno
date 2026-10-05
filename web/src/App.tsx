import React, { useState, useEffect, useRef } from 'react';
import type { Conversation, Message, ConversationStatus } from './types/chat';
import { api } from './services/api';
import { operatorSocket } from './services/operatorSocket';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { CustomerInfoSidebar } from './components/CustomerInfoSidebar';

export const App: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<ConversationStatus>('waiting');
  const [searchTerm, setSearchTerm] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isClientTyping, setIsClientTyping] = useState(false);

  // Ref sempre atualizada para evitar stale closures em listeners de WebSocket
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Carrega lista de conversas
  const loadConversations = async () => {
    try {
      const data = await api.getConversations();
      setConversations(data);

      // Se não há conversa selecionada e temos atendimento na fila ou ativo, seleciona automaticamente
      if (!selectedIdRef.current && data.length > 0) {
        const waiting = data.find(c => c.status === 'waiting') || data[0];
        setSelectedId(waiting.id);
      }
    } catch (e) {
      console.warn('Erro ao carregar conversas do servidor:', e);
    }
  };

  useEffect(() => {
    loadConversations();

    // Conecta o WebSocket do operador
    operatorSocket.connect();

    const unsubStatus = operatorSocket.onStatus((status) => {
      setIsConnected(status);
    });

    const unsubMessage = operatorSocket.onMessage((newMsg) => {
      // Se a mensagem pertencer à conversa atualmente aberta no chat, adiciona instantaneamente
      if (selectedIdRef.current === newMsg.conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }

      // Atualiza a lista lateral para refletir contadores e novas mensagens
      loadConversations();
    });

    const unsubTyping = operatorSocket.onTyping((payload) => {
      if (payload.conversationId === selectedIdRef.current && payload.senderId !== 'op-01') {
        setIsClientTyping(payload.isTyping);
      }
    });

    const unsubAction = operatorSocket.onAction((action) => {
      if (action.type === 'new_chat_waiting' || action.type === 'operator_assigned' || action.type === 'chat_closed') {
        loadConversations();
      }
    });

    // Polling de segurança a cada 6 segundos para sincronizar fila
    const interval = setInterval(loadConversations, 6000);

    return () => {
      unsubStatus();
      unsubMessage();
      unsubTyping();
      unsubAction();
      clearInterval(interval);
      operatorSocket.disconnect();
    };
  }, []);

  // Quando o operador troca de conversa selecionada
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    // Informa ao WebSocket a sala atual sem derrubar a conexão
    operatorSocket.switchConversation(selectedId);
    setIsClientTyping(false);

    // Carrega o histórico de mensagens da conversa
    api.getMessages(selectedId)
      .then(setMessages)
      .catch((err) => console.error('Erro ao buscar histórico de mensagens:', err));
  }, [selectedId]);

  const selectedConversation = conversations.find((c) => c.id === selectedId) || null;

  const handleSendMessage = (text: string) => {
    if (!selectedId) return;

    const opMsg: Message = {
      id: 'op-msg-' + Date.now(),
      conversationId: selectedId,
      senderId: 'op-01',
      senderType: 'operator',
      senderName: 'Marcos Suporte',
      content: text,
      timestamp: new Date().toISOString(),
      status: 'delivered',
    };

    setMessages((prev) => [...prev, opMsg]);
    operatorSocket.sendMessage(selectedId, text);
  };

  const handleAssignOperator = async () => {
    if (!selectedId) return;
    try {
      const updated = await api.assignOperator(selectedId, 'op-01', 'Marcos Suporte');
      setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setActiveTab('active');
    } catch (e) {
      console.error(e);
    }
  };

  const handleCloseChat = async () => {
    if (!selectedId) return;
    if (!window.confirm('Deseja realmente encerrar este atendimento? Ele será arquivado no histórico.')) return;

    try {
      await api.closeConversation(selectedId);
      await loadConversations();
      setActiveTab('closed');
    } catch (e) {
      console.error(e);
    }
  };

  const handleTyping = (typing: boolean) => {
    if (!selectedId) return;
    operatorSocket.sendTyping(selectedId, typing);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100">
      {/* 1. Barra Lateral de Conversas e Histórico */}
      <Sidebar
        conversations={conversations}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          // Atualiza a aba se o item selecionado estiver em outra
          const found = conversations.find(c => c.id === id);
          if (found && found.status !== activeTab) {
            setActiveTab(found.status);
          }
        }}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          // Ao mudar de aba, seleciona o primeiro item daquela aba se houver
          const firstInTab = conversations.find(c => c.status === tab);
          if (firstInTab) {
            setSelectedId(firstInTab.id);
          } else {
            setSelectedId(null);
          }
        }}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        isConnected={isConnected}
      />

      {/* 2. Área Central de Chat / Histórico em Tempo Real */}
      <ChatArea
        conversation={selectedConversation}
        messages={messages}
        onSendMessage={handleSendMessage}
        onAssign={handleAssignOperator}
        onCloseChat={handleCloseChat}
        onTyping={handleTyping}
        isClientTyping={isClientTyping}
      />

      {/* 3. Painel Lateral com Detalhes do Cliente e Consulta a APIs */}
      {selectedConversation && (
        <CustomerInfoSidebar conversation={selectedConversation} />
      )}
    </div>
  );
};

export default App;

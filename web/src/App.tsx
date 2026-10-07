import React, { useState, useEffect, useRef } from 'react';
import type { Conversation, Message, ConversationStatus } from './types/chat';
import type { CrmMenuId, UserRole, AuthUser } from './types/crm';
import { api } from './services/api';
import { operatorSocket } from './services/operatorSocket';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { CustomerInfoSidebar } from './components/CustomerInfoSidebar';
import { LoginScreen } from './components/auth/LoginScreen';

// CRM Views
import { CrmSidebar } from './components/crm/CrmSidebar';
import { DashboardView } from './components/crm/DashboardView';
import { IntegracoesView } from './components/crm/IntegracoesView';
import { AtendentesView } from './components/crm/AtendentesView';
import { DepartamentosView } from './components/crm/DepartamentosView';
import { RelatoriosView } from './components/crm/RelatoriosView';
import { ConsultaAtendimentosView } from './components/crm/ConsultaAtendimentosView';
import { MensagensRapidasView } from './components/crm/MensagensRapidasView';
import { AuditoriaView } from './components/crm/AuditoriaView';
import { CanaisView } from './components/crm/CanaisView';
import { FluxoConfiguracoesView } from './components/crm/FluxoConfiguracoesView';
import { CampanhasView } from './components/crm/CampanhasView';
import { DadosEmpresaView } from './components/crm/DadosEmpresaView';
import { ChavesAcessoView } from './components/crm/ChavesAcessoView';
import { UsuariosGerenciaView } from './components/crm/UsuariosGerenciaView';
import { MeusDadosView } from './components/crm/MeusDadosView';
import { ConfigRedeView } from './components/crm/ConfigRedeView';
import { MeuPerfilModal } from './components/crm/MeuPerfilModal';
import { NovoAtendimentoModal } from './components/chat/NovoAtendimentoModal';
import { isSameDepartment } from './utils/rbac';

export const App: React.FC = () => {
  // Auth & Session State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => api.getStoredUser());

  // CRM Navigation State
  const [activeMenu, setActiveMenu] = useState<CrmMenuId>('atendimento_chat');
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const stored = api.getStoredUser();
    return stored?.role || 'admin';
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isNovoAtendimentoOpen, setIsNovoAtendimentoOpen] = useState(false);

  // Chat & Helpdesk State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<ConversationStatus>('waiting');
  const [searchTerm, setSearchTerm] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isClientTyping, setIsClientTyping] = useState(false);

  // Ref sempre sincronizada com o estado para evitar stale closures em listeners de WebSocket
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    setUserRole(user.role);
    operatorSocket.setOperator(user.id, user.name);
    if (user.role === 'operador') {
      setActiveMenu('atendimento_chat');
    } else {
      setActiveMenu('dashboard');
    }
  };

  const handleLogout = () => {
    api.clearSession();
    setCurrentUser(null);
    setSelectedId(null);
    setMessages([]);
    operatorSocket.disconnect();
  };

  // Validação proativa de sessão no mount e escuta para expiração de token (401)
  useEffect(() => {
    if (currentUser) {
      api.getMe().catch((err) => {
        console.warn('Sessão expirada ou inválida ao iniciar:', err);
        handleLogout();
      });
    }

    const handleAuthExpired = () => {
      handleLogout();
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
  }, []);

  // Carrega lista de conversas
  const loadConversations = async () => {
    try {
      const data = await api.getConversations();
      setConversations(data);

      // Se não há conversa selecionada e temos atendimento na fila ou ativo, seleciona automaticamente
      if (!selectedIdRef.current && data.length > 0) {
        const waiting = data.find((c) => c.status === 'waiting') || data[0];
        setSelectedId(waiting.id);
      }
    } catch (e) {
      console.warn('Erro ao carregar conversas do servidor:', e);
    }
  };

  useEffect(() => {
    if (!currentUser) return;

    operatorSocket.setOperator(currentUser.id, currentUser.name);
    loadConversations();

    // Conecta o WebSocket do operador
    operatorSocket.connect();

    const unsubStatus = operatorSocket.onStatus((status) => {
      setIsConnected(status);
    });

    const unsubMessage = operatorSocket.onMessage((newMsg) => {
      // Se a mensagem pertencer à conversa atualmente aberta no chat, adiciona instantaneamente
      if (selectedIdRef.current && selectedIdRef.current.trim() === newMsg.conversationId?.trim()) {
        setIsClientTyping(false);
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }

      // Atualiza a lista lateral para refletir contadores e novas mensagens
      loadConversations();
    });

    const unsubTyping = operatorSocket.onTyping((payload) => {
      if (payload.conversationId === selectedIdRef.current && payload.senderId !== currentUser.id) {
        setIsClientTyping(payload.isTyping);
      }
    });

    const unsubAction = operatorSocket.onAction((action) => {
      if (
        action.type === 'new_chat_waiting' ||
        action.type === 'conversation_updated' ||
        action.type === 'operator_assigned' ||
        action.type === 'chat_closed'
      ) {
        loadConversations();
      } else if (action.type === 'conversations_cleared') {
        setConversations([]);
        setSelectedId(null);
        setMessages([]);
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
  }, [currentUser]);

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

  // Conversas visíveis para o usuário atual conforme seu papel (Anti-IDOR / RBAC)
  const visibleConversations = conversations.filter((c) => {
    if (userRole === 'operador') {
      // Na fila de espera, o operador visualiza atendimentos do seu departamento para assumir
      if (c.status === 'waiting') {
        return !currentUser?.department || isSameDepartment(c.department, currentUser.department);
      }
      // Em atendimentos ativos ou finalizados, visualiza somente aquilo a que pertence ao seu usuário
      return c.operator?.id === currentUser?.id;
    }

    if (userRole === 'gestor') {
      // O gestor só pode enxergar dados sobre a sua equipe (atendimentos do setor dele)
      const gestorDept = currentUser?.department;
      if (!gestorDept) return true;
      return isSameDepartment(c.department, gestorDept);
    }

    // Administrador visualiza todos os atendimentos
    return true;
  });

  const selectedConversation = visibleConversations.find((c) => c.id === selectedId) || null;
  const waitingCount = visibleConversations.filter((c) => c.status === 'waiting').length;

  // Sincroniza seleção quando o perfil de acesso é alternado
  useEffect(() => {
    if (selectedId && !visibleConversations.some((c) => c.id === selectedId)) {
      const firstAvailable = visibleConversations.find((c) => c.status === activeTab) || visibleConversations[0];
      setSelectedId(firstAvailable ? firstAvailable.id : null);
    }
  }, [userRole, activeTab, selectedId, visibleConversations]);

  const handleSendMessage = (text: string) => {
    if (!selectedId || !currentUser) return;

    const opMsg: Message = {
      id: 'op-msg-' + Date.now(),
      conversationId: selectedId,
      senderId: currentUser.id,
      senderType: 'operator',
      senderName: currentUser.name,
      content: text,
      timestamp: new Date().toISOString(),
      status: 'delivered',
    };

    setMessages((prev) => [...prev, opMsg]);
    operatorSocket.sendMessage(opMsg);
  };

  const handleAssignOperator = async () => {
    if (!selectedId || !currentUser) return;
    try {
      const updated = await api.assignOperator(selectedId, currentUser.id, currentUser.name);
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

  const handleResetAll = async () => {
    if (!window.confirm('Deseja realmente zerar todos os atendimentos e limpar o histórico para iniciar testes do zero?')) {
      return;
    }
    try {
      await api.resetAll();
      setConversations([]);
      setSelectedId(null);
      setMessages([]);
      await loadConversations();
    } catch (e) {
      console.error('Erro ao resetar histórico:', e);
    }
  };

  const handleTyping = (typing: boolean) => {
    if (!selectedId) return;
    operatorSocket.sendTyping(selectedId, typing);
  };

  const handleSelectMenu = (menu: CrmMenuId) => {
    if (menu === 'meu_perfil') {
      setIsProfileModalOpen(true);
    } else {
      setActiveMenu(menu);
    }
  };

  // Renderizador da Área Central com base no Menu selecionado
  const renderMainContent = () => {
    // RBAC Route Guard: Garante que o operador nunca acesse telas restritas
    if (userRole === 'operador') {
      const allowedOperatorMenus: CrmMenuId[] = ['atendimento_chat', 'atendimento_mensagens', 'meus_dados'];
      if (!allowedOperatorMenus.includes(activeMenu)) {
        return (
          <div className="flex-1 h-full flex items-center justify-center bg-slate-50 p-6 text-center">
            <div className="max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto font-bold text-lg">
                !
              </div>
              <h2 className="text-lg font-bold text-slate-800">Acesso Restrito</h2>
              <p className="text-sm text-slate-500">
                Seu perfil de <strong>Operador</strong> possui acesso restrito ao Atendimento de Chat, Mensagens Rápidas e Meus Dados.
              </p>
              <button
                onClick={() => setActiveMenu('atendimento_chat')}
                className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors"
              >
                Voltar ao Atendimento
              </button>
            </div>
          </div>
        );
      }
    }

    // RBAC Route Guard para Gestor: Sem acesso a dados sensíveis/fiscais, tokens, canais ou gerência geral
    if (userRole === 'gestor') {
      const adminOnlyMenus: CrmMenuId[] = [
        'empresa_dados',
        'usuarios_gerencia',
        'atendimento_auditoria',
        'atendimento_canais',
        'integracoes_gerenciar',
        'integracoes_chaves',
      ];
      if (adminOnlyMenus.includes(activeMenu)) {
        return (
          <div className="flex-1 h-full flex items-center justify-center bg-slate-50 p-6 text-center">
            <div className="max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto font-bold text-lg">
                !
              </div>
              <h2 className="text-lg font-bold text-slate-800">Permissão Exclusiva de Administrador</h2>
              <p className="text-sm text-slate-500">
                Como <strong>Gestor</strong>, você gerencia exclusivamente a sua equipe, monitora os atendimentos e relatórios do seu setor. Configurações de canais, dados fiscais, chaves de API e gerência geral são restritas ao Administrador.
              </p>
              <button
                onClick={() => setActiveMenu('dashboard')}
                className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors"
              >
                Ir para o Dashboard
              </button>
            </div>
          </div>
        );
      }
    }

    switch (activeMenu) {
      case 'dashboard':
        return (
          <DashboardView
            conversations={visibleConversations}
            onNavigateToChat={() => setActiveMenu('atendimento_chat')}
            onNavigateToIntegrations={() => setActiveMenu('integracoes_gerenciar')}
            userRole={userRole}
            currentUser={currentUser}
          />
        );

      case 'integracoes_gerenciar':
        return <IntegracoesView />;

      case 'integracoes_chaves':
        return <ChavesAcessoView />;

      case 'empresa_dados':
        return <DadosEmpresaView />;

      case 'usuarios_gerencia':
        return <UsuariosGerenciaView />;

      case 'empresa_atendentes':
        return (
          <AtendentesView
            userRole={userRole}
            currentUser={currentUser}
            conversations={conversations}
          />
        );

      case 'empresa_departamentos':
        return <DepartamentosView userRole={userRole} currentUser={currentUser} />;

      case 'empresa_atendimentos':
        return <ConsultaAtendimentosView userRole={userRole} currentUser={currentUser} />;

      case 'empresa_relatorios':
      case 'relatorios':
        return <RelatoriosView userRole={userRole} currentUser={currentUser} />;

      case 'atendimento_mensagens':
        return <MensagensRapidasView />;

      case 'atendimento_auditoria':
        return <AuditoriaView />;

      case 'atendimento_canais':
        return <CanaisView />;

      case 'atendimento_fluxo':
      case 'atendimento_automacoes':
        return <FluxoConfiguracoesView userRole={userRole} currentUser={currentUser} />;

      case 'atendimento_campanhas':
        return <CampanhasView userRole={userRole} currentUser={currentUser} />;

      case 'config_rede':
        return <ConfigRedeView userRole={userRole} currentUser={currentUser} />;

      case 'meus_dados':
        return (
          <MeusDadosView
            userRole={userRole}
            currentUser={currentUser}
            onUserUpdated={(updated) => setCurrentUser(updated)}
          />
        );

      case 'atendimento_chat':
      default:
        return (
          <div className="flex-1 h-full flex overflow-hidden">
            {/* 1. Lista lateral de Atendimentos (Fila / Ativos / Finalizados) */}
            <Sidebar
              conversations={visibleConversations}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                const found = visibleConversations.find((c) => c.id === id);
                if (found && found.status !== activeTab) {
                  setActiveTab(found.status);
                }
              }}
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                const firstInTab = visibleConversations.find((c) => c.status === tab);
                if (firstInTab) {
                  setSelectedId(firstInTab.id);
                } else {
                  setSelectedId(null);
                }
              }}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              isConnected={isConnected}
              onResetAll={handleResetAll}
              onOpenNewChat={() => setIsNovoAtendimentoOpen(true)}
              userRole={userRole}
              currentUser={currentUser}
            />

            {/* 2. Área Central de Conversa em Tempo Real */}
            <ChatArea
              conversation={selectedConversation}
              messages={messages}
              onSendMessage={handleSendMessage}
              onAssign={handleAssignOperator}
              onCloseChat={handleCloseChat}
              onTyping={handleTyping}
              isClientTyping={isClientTyping}
            />

            {/* 3. Painel Lateral com Detalhes do Cliente e Consulta a APIs / ERP */}
            {selectedConversation && (
              <CustomerInfoSidebar
                conversation={selectedConversation}
                onSendPixToChat={(pixCode) =>
                  handleSendMessage(`Segue o código PIX Copia e Cola referente à sua fatura:\n\n${pixCode}`)
                }
              />
            )}
          </div>
        );
    }
  };

  // Se não autenticado, exibe a tela de login
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans antialiased text-slate-800">
      {/* Menu Principal do CRM (Imagem Mestre) */}
      <CrmSidebar
        activeMenu={activeMenu}
        onSelectMenu={handleSelectMenu}
        waitingQueueCount={waitingCount}
        userRole={userRole}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Conteúdo Dinâmico Selecionado */}
      <div className="flex-1 h-full overflow-hidden flex flex-col">
        {renderMainContent()}
      </div>

      {/* Modal de Perfil do Operador / Gestor */}
      <MeuPerfilModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        userRole={userRole}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Modal de Iniciar Atendimento Avulso (Outbound) */}
      <NovoAtendimentoModal
        isOpen={isNovoAtendimentoOpen}
        onClose={() => setIsNovoAtendimentoOpen(false)}
        currentUser={currentUser}
        onSuccess={(newConv) => {
          setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== newConv.id)]);
          setActiveTab('active');
          setSelectedId(newConv.id);
          setActiveMenu('atendimento_chat');
        }}
      />
    </div>
  );
};

export default App;

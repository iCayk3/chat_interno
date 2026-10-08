import React, { useState, useEffect } from 'react';
import {
  Workflow,
  Settings,
  Bot,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  X,
  Play,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Send,
  CornerDownRight,
  Smartphone,
  Clock,
} from 'lucide-react';
import type { ChatSettings, FlowNode, FlowActionType, UserRole, AuthUser } from '../../types/crm';
import { api } from '../../services/api';

interface FluxoConfiguracoesViewProps {
  userRole?: UserRole;
  currentUser?: AuthUser | null;
}

export const FluxoConfiguracoesView: React.FC<FluxoConfiguracoesViewProps> = ({
  userRole = 'admin',
}) => {
  const [activeTab, setActiveTab] = useState<'fluxo' | 'mensagens' | 'ia'>('fluxo');
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Controle de edição de nós da árvore
  const [editingNode, setEditingNode] = useState<FlowNode | null>(null);
  const [parentNodeForNewChild, setParentNodeForNewChild] = useState<FlowNode | null>(null);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Record<string, boolean>>({});
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Simulador de Chat em tempo real
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simulatorMessages, setSimulatorMessages] = useState<
    Array<{ id: string; sender: 'bot' | 'user' | 'system'; text: string; options?: FlowNode[] }>
  >([]);
  const [currentSimulatorNode, setCurrentSimulatorNode] = useState<FlowNode | null>(null);
  const [simulatorInput, setSimulatorInput] = useState('');

  // Carrega configurações do PostgreSQL
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao carregar configurações do servidor');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (updatedSettings?: ChatSettings) => {
    const toSave = updatedSettings || settings;
    if (!toSave) return;

    setIsSaving(true);
    setSaveSuccess(null);
    setErrorMessage(null);
    try {
      await api.saveSettings(toSave);
      setSettings({ ...toSave });
      setSaveSuccess('Configurações e fluxo salvos com sucesso no PostgreSQL!');
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar alterações no banco');
    } finally {
      setIsSaving(false);
    }
  };

  // Restaura o fluxo para o padrão idêntico ao da imagem
  const handleResetToDefault = () => {
    if (!window.confirm('Tem certeza de que deseja restaurar o fluxo para o modelo padrão da central?')) {
      return;
    }
    loadSettings();
  };

  // Funções de manipulação recursiva da árvore de fluxo
  const updateNodeInTree = (root: FlowNode, updated: FlowNode): FlowNode => {
    if (root.id === updated.id) {
      return { ...updated, children: updated.children || root.children };
    }
    if (!root.children) return root;
    return {
      ...root,
      children: root.children.map((child) => updateNodeInTree(child, updated)),
    };
  };

  const deleteNodeFromTree = (root: FlowNode, idToDelete: string): FlowNode => {
    if (!root.children) return root;
    return {
      ...root,
      children: root.children
        .filter((child) => child.id !== idToDelete)
        .map((child) => deleteNodeFromTree(child, idToDelete)),
    };
  };

  const addChildNodeToTree = (root: FlowNode, parentId: string, newChild: FlowNode): FlowNode => {
    if (root.id === parentId) {
      return {
        ...root,
        children: [...(root.children || []), newChild],
      };
    }
    if (!root.children) return root;
    return {
      ...root,
      children: root.children.map((child) => addChildNodeToTree(child, parentId, newChild)),
    };
  };

  const handleSaveNodeEdit = (nodeData: FlowNode) => {
    if (!settings?.chatbotFlow) return;
    const newRoot = updateNodeInTree(settings.chatbotFlow, nodeData);
    const newSettings = { ...settings, chatbotFlow: newRoot };
    setSettings(newSettings);
    setEditingNode(null);
  };

  const handleAddChild = (parentId: string, childData: Omit<FlowNode, 'id'>) => {
    if (!settings?.chatbotFlow) return;
    const newId = `node-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const fullChild: FlowNode = { ...childData, id: newId, children: [] };
    const newRoot = addChildNodeToTree(settings.chatbotFlow, parentId, fullChild);
    setSettings({ ...settings, chatbotFlow: newRoot });
    setParentNodeForNewChild(null);
  };

  const handleDeleteNode = (idToDelete: string) => {
    if (!settings?.chatbotFlow) return;
    if (idToDelete === settings.chatbotFlow.id) {
      alert('O nó raiz (Mensagem Inicial) não pode ser excluído.');
      return;
    }
    if (!window.confirm('Excluir esta opção e todos os seus sub-níveis?')) return;
    const newRoot = deleteNodeFromTree(settings.chatbotFlow, idToDelete);
    setSettings({ ...settings, chatbotFlow: newRoot });
  };

  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodeIds((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // --- LÓGICA DO SIMULADOR DE CHAT ---
  const startSimulator = () => {
    if (!settings?.chatbotFlow) return;
    const root = settings.chatbotFlow;
    setCurrentSimulatorNode(root);
    setSimulatorMessages([
      {
        id: 'msg-start',
        sender: 'bot',
        text: root.message || 'Olá! Escolha uma opção abaixo:',
        options: root.children,
      },
    ]);
    setIsSimulatorOpen(true);
  };

  const handleSelectOptionInSimulator = (option: FlowNode) => {
    // 1. Mensagem enviada pelo cliente (escolha)
    const userMsg = {
      id: `usr-${Date.now()}`,
      sender: 'user' as const,
      text: option.title,
    };

    // 2. Resposta do bot baseada na ação do nó
    let botReplyText = option.message || `Você escolheu: ${option.title}`;
    let nextOptions: FlowNode[] | undefined = undefined;

    if (option.action === 'submenu' && option.children && option.children.length > 0) {
      nextOptions = option.children;
    } else if (option.action === 'transfer') {
      botReplyText = `${option.message || 'Transferindo você para a nossa equipe de atendimento...'}\n\n[Sistema: Ticket enviado para a fila do setor ${option.department || 'Geral'}]`;
    } else if (option.action === 'close') {
      botReplyText = `${option.message || ''}\n\n🔔 ${settings?.closeMessage || 'Atendimento encerrado com sucesso!'}`;
    } else if (option.action === 'erp') {
      botReplyText = `${option.message || 'Consulta realizada no ERP com sucesso!'}`;
    }

    const botMsg = {
      id: `bot-${Date.now()}`,
      sender: 'bot' as const,
      text: botReplyText,
      options: nextOptions,
    };

    setSimulatorMessages((prev) => [...prev, userMsg, botMsg]);
    setCurrentSimulatorNode(option);
  };

  const handleSendSimulatorInput = () => {
    if (!simulatorInput.trim()) return;
    const input = simulatorInput.trim();
    setSimulatorInput('');

    // Tenta encontrar por número ou texto correspondente nos filhos do nó atual
    if (currentSimulatorNode?.children) {
      const match = currentSimulatorNode.children.find(
        (child) =>
          child.title.toLowerCase().startsWith(input.toLowerCase()) ||
          child.title.includes(input)
      );
      if (match) {
        handleSelectOptionInSimulator(match);
        return;
      }
    }

    // Mensagem de usuário genérica
    setSimulatorMessages((prev) => [
      ...prev,
      { id: `usr-${Date.now()}`, sender: 'user', text: input },
      {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: 'Não compreendi essa opção. Por favor, escolha um dos botões abaixo ou digite o número correspondente:',
        options: currentSimulatorNode?.children,
      },
    ]);
  };

  if (isLoading) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-slate-50 text-slate-500 space-y-3">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Carregando configurações de fluxo...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-slate-50/70">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Workflow className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Fluxo de Atendimento & Configurações
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  {userRole === 'admin' ? 'PostgreSQL • Administrador' : 'PostgreSQL • Gestor'}
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                Personalize as mensagens do sistema, a mensagem de encerramento e desenhe o fluxo do chatbot visualmente.
              </p>
            </div>
          </div>
        </div>

        {/* Abas e Ações */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('fluxo')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === 'fluxo'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              Árvore de Fluxo
            </button>
            <button
              onClick={() => setActiveTab('mensagens')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === 'mensagens'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Mensagens & Encerramento
            </button>
            <button
              onClick={() => setActiveTab('ia')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === 'ia'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              Agente IA
            </button>
          </div>

          <button
            onClick={startSimulator}
            className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs"
            title="Abrir simulador do aplicativo no celular"
          >
            <Play className="w-3.5 h-3.5 fill-indigo-700" />
            Testar no Simulador
          </button>

          <button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Salvando...' : 'Salvar no Banco'}
          </button>
        </div>
      </div>

      {/* Alertas de Notificação */}
      {saveSuccess && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center gap-2 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {saveSuccess}
        </div>
      )}
      {errorMessage && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 flex items-center gap-2 text-xs font-medium text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Conteúdo Principal conforme Aba */}
      <div className="flex-1 overflow-hidden relative">
        {/* ABA 1: ÁRVORE VISUAL DO FLUXO (ESTILO MINDMAP DA IMAGEM) */}
        {activeTab === 'fluxo' && (
          <div className="h-full flex flex-col">
            {/* Barra de Ferramentas da Árvore */}
            <div className="bg-white/80 backdrop-blur-xs border-b border-slate-200/80 px-6 py-2 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-700">Legenda de Ações:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200">
                  💬 Submenu
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
                  👤 Transferir p/ Atendente
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
                  ⚡ Consulta ERP (Boleto/Promessa)
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-medium border border-rose-200">
                  👋 Encerrar Atendimento
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.1))}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 border border-slate-200"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="w-12 text-center font-mono font-semibold text-slate-700">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 border border-slate-200"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomLevel(1)}
                  className="px-2 py-1 hover:bg-slate-100 rounded-lg text-slate-600 border border-slate-200 font-medium"
                >
                  Reset
                </button>
                <button
                  onClick={handleResetToDefault}
                  className="px-2.5 py-1 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 flex items-center gap-1"
                  title="Restaurar fluxo padrão da imagem"
                >
                  <RotateCcw className="w-3 h-3" />
                  Modelo Padrão
                </button>
              </div>
            </div>

            {/* Canvas Visual com os nós interativos */}
            <div className="flex-1 overflow-auto p-8 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]">
              <div
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'top left',
                  transition: 'transform 0.15s ease-out',
                }}
                className="inline-block min-w-full"
              >
                {settings?.chatbotFlow && (
                  <VisualTreeNode
                    node={settings.chatbotFlow}
                    level={0}
                    branchColor="#2563EB"
                    isCollapsed={!!collapsedNodeIds[settings.chatbotFlow.id]}
                    onToggleCollapse={() => toggleCollapse(settings.chatbotFlow!.id)}
                    onEditNode={(node) => setEditingNode(node)}
                    onAddChild={(node) => setParentNodeForNewChild(node)}
                    onDeleteNode={(id) => handleDeleteNode(id)}
                    collapsedMap={collapsedNodeIds}
                    onToggleCollapseMap={toggleCollapse}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: MENSAGENS DO SISTEMA & ENCERRAMENTO */}
        {activeTab === 'mensagens' && settings && (
          <div className="h-full overflow-y-auto p-6 md:p-8 space-y-6 max-w-4xl mx-auto">
            {/* Bloco 1: Mensagem de Encerramento (Destaque conforme solicitação do usuário) */}
            <div className="bg-white rounded-2xl border-2 border-blue-500/30 p-6 shadow-sm space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-600 animate-pulse" />
                    <h2 className="text-base font-bold text-slate-900">
                      Mensagem de Encerramento do Atendimento
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Esta é a mensagem exata exibida no aplicativo do cliente quando o atendente encerra a conversa no CRM ou quando o bot fecha o fluxo.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
                  Mobile & Web Integrados
                </span>
              </div>

              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={settings.closeMessage}
                  onChange={(e) => setSettings({ ...settings, closeMessage: e.target.value })}
                  placeholder="Ex: Atendimento encerrado com sucesso! Agradecemos o seu contato..."
                  className="w-full text-sm p-3.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-800 placeholder-slate-400 font-medium"
                />
                <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-600">Modelos Rápidos:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          closeMessage:
                            'Atendimento encerrado com sucesso! Agradecemos o seu contato. Caso precise de mais ajuda, basta nos enviar uma nova mensagem.',
                        })
                      }
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-medium"
                    >
                      Padrão Cordial
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          closeMessage:
                            'Seu atendimento foi concluído! Como avalia nossa atenção hoje? Envie uma nota de 1 a 5 para continuarmos melhorando.',
                        })
                      }
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-medium"
                    >
                      Com Pesquisa CSAT
                    </button>
                  </div>
                  <span className="font-mono text-slate-400">
                    {settings.closeMessage.length} / 1000 caracteres
                  </span>
                </div>
              </div>

              {/* Prévia visual de como o cliente vê no celular */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">
                  Prévia no App Mobile (Balão do Sistema):
                </span>
                <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0 font-bold text-xs">
                    SOL
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Atendimento SOL</span>
                      <span className="text-[10px] text-slate-400">Agora</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      {settings.closeMessage || 'Atendimento encerrado com sucesso!'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloco 2: Mensagem de Boas-Vindas Inicial */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Mensagem Inicial de Boas-Vindas
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Primeira mensagem automática enviada quando o cliente abre um novo atendimento pelo aplicativo.
                </p>
              </div>

              <textarea
                rows={3}
                value={settings.welcomeMessage}
                onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
                className="w-full text-sm p-3.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-800"
              />
            </div>

            {/* Bloco 3: Mensagem de Transferência para Atendente */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Mensagem de Encaminhamento para a Fila Humana
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enviada pelo bot assim que o cliente seleciona "Falar com Atendente" ou quando o fluxo faz o transbordo.
                </p>
              </div>

              <textarea
                rows={3}
                value={settings.queueTransferMessage}
                onChange={(e) => setSettings({ ...settings, queueTransferMessage: e.target.value })}
                className="w-full text-sm p-3.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-800"
              />
            </div>

            {/* Bloco 4: Fora do Horário de Atendimento */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Mensagem Fora do Expediente
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Disparada automaticamente quando o cliente envia mensagem fora do horário comercial.
                </p>
              </div>

              <textarea
                rows={3}
                value={settings.outOfHoursMessage}
                onChange={(e) => setSettings({ ...settings, outOfHoursMessage: e.target.value })}
                className="w-full text-sm p-3.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-800"
              />
            </div>

            {/* Bloco 5: Inatividade e Transbordo no Chatbot */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Inatividade e Transbordo no Chatbot
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Se o cliente iniciar o atendimento no bot e não selecionar nenhuma opção dentro do prazo, ele será transferido automaticamente para a fila humana do setor configurado.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200">
                  Transbordo Automático
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tempo Limite de Inatividade (Minutos):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={settings.botTimeoutMinutes ?? 3}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        botTimeoutMinutes: Math.max(1, parseInt(e.target.value) || 3),
                      })
                    }
                    className="w-full text-sm p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-800 font-medium"
                    placeholder="3"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Padrão: 3 minutos antes da transferência automática para a fila.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Setor Padrão para Transbordo:
                  </label>
                  <select
                    value={settings.botFallbackDept || 'Suporte Técnico'}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        botFallbackDept: e.target.value,
                      })
                    }
                    className="w-full text-sm p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-800 font-medium bg-white"
                  >
                    <option value="Suporte Técnico">Suporte Técnico</option>
                    <option value="Comercial">Comercial</option>
                    <option value="Financeiro">Financeiro</option>
                    <option value="Atendimento Geral">Atendimento Geral</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Padrão: Suporte Técnico. Setor que receberá o atendimento na fila.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => handleSave()}
                disabled={isSaving}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl flex items-center gap-2 shadow-xs transition-colors"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Salvando...' : 'Salvar Todas as Mensagens'}
              </button>
            </div>
          </div>
        )}

        {/* ABA 3: AGENTE DE INTELIGÊNCIA ARTIFICIAL */}
        {activeTab === 'ia' && settings && (
          <div className="h-full overflow-y-auto p-6 md:p-8 space-y-6 max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      Agente de Inteligência Artificial para Atendimento
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Habilite a IA para conversar com o cliente de forma autônoma e responder dúvidas antes de passar para a fila humana.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.aiEnabled}
                    onChange={(e) => setSettings({ ...settings, aiEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Instruções do Sistema (System Prompt da IA):
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Defina como a IA deve se comportar, o tom de voz da empresa e as regras de negócio.
                  </p>
                  <textarea
                    rows={6}
                    value={settings.aiPrompt}
                    onChange={(e) => setSettings({ ...settings, aiPrompt: e.target.value })}
                    placeholder="Você é o assistente virtual da SOL CRM..."
                    className="w-full text-sm p-3.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 text-slate-800 font-mono text-xs leading-relaxed"
                  />
                </div>

                <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-200 text-xs text-purple-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    Transbordo Inteligente
                  </div>
                  <p>
                    Se o cliente solicitar falar com atendente ou se a IA não souber responder com precisão, a conversa é imediatamente encaminhada para os operadores com o resumo da conversa em andamento.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => handleSave()}
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm rounded-xl flex items-center gap-2 shadow-xs transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Salvar Configurações da IA
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE EDIÇÃO DE NÓ */}
      {editingNode && (
        <NodeEditModal
          node={editingNode}
          onClose={() => setEditingNode(null)}
          onSave={handleSaveNodeEdit}
        />
      )}

      {/* MODAL DE ADICIONAR SUB-NÓ (FILHO) */}
      {parentNodeForNewChild && (
        <NodeAddModal
          parentNode={parentNodeForNewChild}
          onClose={() => setParentNodeForNewChild(null)}
          onAdd={(data) => handleAddChild(parentNodeForNewChild.id, data)}
        />
      )}

      {/* DRAWER DO SIMULADOR MOBILE */}
      {isSimulatorOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-800">
            {/* Header do Celular Simulado */}
            <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold tracking-wide">
                  Simulador de Chat Mobile (Cliente)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={startSimulator}
                  className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                  title="Reiniciar conversa"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsSimulatorOpen(false)}
                  className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tela de Mensagens do Chat */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950">
              <div className="text-center my-2">
                <span className="text-[10px] text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                  Central de Atendimento SOL Telecom
                </span>
              </div>

              {simulatorMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] text-xs p-3 rounded-2xl ${
                      msg.sender === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-xs'
                        : 'bg-slate-800 text-slate-200 border border-slate-700/80 rounded-tl-xs shadow-xs'
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  </div>

                  {/* Se houver opções clicáveis */}
                  {msg.options && msg.options.length > 0 && (
                    <div className="mt-2 space-y-1.5 w-[85%]">
                      {msg.options.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => handleSelectOptionInSimulator(opt)}
                          className="w-full text-left text-xs px-3 py-2 bg-slate-900 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 border border-slate-700 hover:border-blue-500 rounded-xl flex items-center justify-between transition-all group font-medium"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span>{opt.emoji || '💬'}</span>
                            <span className="truncate">{opt.title}</span>
                          </span>
                          <CornerDownRight className="w-3 h-3 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Barra de Envio do Celular */}
            <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={simulatorInput}
                onChange={(e) => setSimulatorInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendSimulatorInput()}
                placeholder="Digite o número ou responda..."
                className="flex-1 bg-slate-950 text-xs text-white placeholder-slate-500 px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSendSimulatorInput}
                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- COMPONENTE DO NÓ DA ÁRVORE VISUAL (RECURSIVO) ---
interface VisualTreeNodeProps {
  node: FlowNode;
  level: number;
  branchColor?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onEditNode: (node: FlowNode) => void;
  onAddChild: (node: FlowNode) => void;
  onDeleteNode: (id: string) => void;
  collapsedMap: Record<string, boolean>;
  onToggleCollapseMap: (id: string) => void;
}

const BRANCH_COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#E11D48', '#0891B2'];

const VisualTreeNode: React.FC<VisualTreeNodeProps> = ({
  node,
  level,
  branchColor = '#2563EB',
  isCollapsed,
  onToggleCollapse,
  onEditNode,
  onAddChild,
  onDeleteNode,
  collapsedMap,
  onToggleCollapseMap,
}) => {
  const hasChildren = node.children && node.children.length > 0;

  // Cor do badge de ação
  const getActionBadge = (action: FlowActionType, dept?: string) => {
    switch (action) {
      case 'submenu':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
            💬 Opções
          </span>
        );
      case 'transfer':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
            👤 Atendente {dept ? `(${dept})` : ''}
          </span>
        );
      case 'close':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-200">
            👋 Encerrar
          </span>
        );
      case 'erp':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-200">
            ⚡ ERP {node.erpAction ? `[${node.erpAction}]` : ''}
          </span>
        );
      case 'ai':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold border border-purple-200">
            🤖 Resposta IA
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center my-2 select-none">
      {/* CARD DO NÓ */}
      <div className="relative group">
        <div
          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border bg-white shadow-xs transition-all hover:shadow-md ${
            level === 0
              ? 'border-blue-600 bg-blue-50/40 min-w-[210px]'
              : 'border-slate-300 hover:border-slate-400 min-w-[190px]'
          }`}
          style={{ borderLeftWidth: 4, borderLeftColor: branchColor }}
        >
          {/* Emoji */}
          <span className="text-base shrink-0">{node.emoji || '💬'}</span>

          {/* Conteúdo Central */}
          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800 truncate" title={node.title}>
                {node.title}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1 truncate">
              {getActionBadge(node.action, node.department)}
            </div>
          </div>

          {/* Botões de Ação do Nó no Hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEditNode(node)}
              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600"
              title="Editar texto e comportamento"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => onAddChild(node)}
              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-emerald-600"
              title="Adicionar sub-opção filha"
            >
              <Plus className="w-3 h-3" />
            </button>
            {level > 0 && (
              <button
                onClick={() => onDeleteNode(node.id)}
                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-rose-600"
                title="Excluir nó"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Botão de Expandir / Recolher se tiver filhos */}
          {hasChildren && (
            <button
              onClick={onToggleCollapse}
              className="ml-1 w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[10px] font-bold text-slate-600 flex items-center justify-center shrink-0"
              title={isCollapsed ? 'Expandir sub-níveis' : 'Recolher sub-níveis'}
            >
              {isCollapsed ? '+' : '−'}
            </button>
          )}
        </div>
      </div>

      {/* RAMIFICAÇÕES E FILHOS (CONECTOR HORIZONTAL COM LINHAS CURVAS) */}
      {hasChildren && !isCollapsed && (
        <div className="flex items-center relative pl-8">
          {/* Linha horizontal inicial saindo do nó pai */}
          <div
            className="absolute left-0 top-1/2 w-8 h-[2px] -translate-y-1/2"
            style={{ backgroundColor: branchColor }}
          />

          {/* Lista de Filhos alinhados verticalmente */}
          <div className="flex flex-col relative py-2">
            {/* Linha vertical conectora de todos os filhos */}
            {node.children!.length > 1 && (
              <div
                className="absolute left-0 top-6 bottom-6 w-[2px]"
                style={{ backgroundColor: branchColor }}
              />
            )}

            {node.children!.map((child, idx) => {
              const childColor =
                level === 0 ? BRANCH_COLORS[idx % BRANCH_COLORS.length] : branchColor;
              return (
                <div key={child.id} className="relative pl-6">
                  {/* Linha conectora curva/horizontal para este filho específico */}
                  <div
                    className="absolute left-0 top-1/2 w-6 h-[2px] -translate-y-1/2"
                    style={{ backgroundColor: branchColor }}
                  />
                  <VisualTreeNode
                    node={child}
                    level={level + 1}
                    branchColor={childColor}
                    isCollapsed={!!collapsedMap[child.id]}
                    onToggleCollapse={() => onToggleCollapseMap(child.id)}
                    onEditNode={onEditNode}
                    onAddChild={onAddChild}
                    onDeleteNode={onDeleteNode}
                    collapsedMap={collapsedMap}
                    onToggleCollapseMap={onToggleCollapseMap}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// --- MODAL DE EDIÇÃO DE NÓ ---
interface NodeEditModalProps {
  node: FlowNode;
  onClose: () => void;
  onSave: (node: FlowNode) => void;
}

const NodeEditModal: React.FC<NodeEditModalProps> = ({ node, onClose, onSave }) => {
  const [title, setTitle] = useState(node.title);
  const [emoji, setEmoji] = useState(node.emoji || '💬');
  const [message, setMessage] = useState(node.message || '');
  const [action, setAction] = useState<FlowActionType>(node.action || 'submenu');
  const [department, setDepartment] = useState(node.department || 'Suporte Técnico');
  const [erpAction, setErpAction] = useState(node.erpAction || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      ...node,
      title: title.trim(),
      emoji: emoji.trim(),
      message: message.trim(),
      action,
      department: action === 'transfer' ? department : undefined,
      erpAction: action === 'erp' ? erpAction : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Editar Opção do Fluxo</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-1">
              <label className="font-bold text-slate-700 block mb-1">Ícone / Emoji</label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-full p-2.5 text-center text-base rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="col-span-3">
              <label className="font-bold text-slate-700 block mb-1">Título da Opção</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: 1 - 2ª VIA DE BOLETO"
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold text-slate-800"
                required
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Ação ao Selecionar</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as FlowActionType)}
              className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-slate-800 font-medium"
            >
              <option value="submenu">💬 Abrir Submenu com Mais Opções</option>
              <option value="transfer">👤 Transferir para Atendente Humano</option>
              <option value="erp">⚡ Executar Consulta no Sistema ERP</option>
              <option value="ai">🤖 Delegar Resposta para Agente IA</option>
              <option value="close">👋 Encerrar Atendimento</option>
            </select>
          </div>

          {action === 'transfer' && (
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Departamento de Destino
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
              >
                <option value="Suporte Técnico">Suporte Técnico</option>
                <option value="Financeiro">Financeiro</option>
                <option value="Comercial">Comercial</option>
                <option value="Atendimento Geral">Atendimento Geral</option>
              </select>
            </div>
          )}

          {action === 'erp' && (
            <div>
              <label className="font-bold text-slate-700 block mb-1">Ação Integrada no ERP</label>
              <select
                value={erpAction}
                onChange={(e) => setErpAction(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
              >
                <option value="2via_boleto">2ª Via de Boleto / Código PIX</option>
                <option value="promessa_pagamento">Promessa de Pagamento (Desbloqueio 48h)</option>
                <option value="consulta_status_os">Consulta de Ordem de Serviço</option>
                <option value="teste_sinal_onu">Teste de Sinal de Fibra / Roteador</option>
              </select>
            </div>
          )}

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Mensagem de Resposta do Bot
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensagem que o bot enviará para o cliente ao clicar nesta opção..."
              className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- MODAL DE ADICIONAR SUB-NÓ (FILHO) ---
interface NodeAddModalProps {
  parentNode: FlowNode;
  onClose: () => void;
  onAdd: (data: Omit<FlowNode, 'id'>) => void;
}

const NodeAddModal: React.FC<NodeAddModalProps> = ({ parentNode, onClose, onAdd }) => {
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('💬');
  const [message, setMessage] = useState('');
  const [action, setAction] = useState<FlowActionType>('submenu');
  const [department, setDepartment] = useState('Suporte Técnico');
  const [erpAction, setErpAction] = useState('2via_boleto');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      emoji: emoji.trim(),
      message: message.trim(),
      action,
      department: action === 'transfer' ? department : undefined,
      erpAction: action === 'erp' ? erpAction : undefined,
      children: [],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Nova Sub-opção</h3>
            <p className="text-xs text-slate-500">
              Adicionando opção abaixo de: <strong>{parentNode.title}</strong>
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-1">
              <label className="font-bold text-slate-700 block mb-1">Ícone</label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-full p-2.5 text-center text-base rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="col-span-3">
              <label className="font-bold text-slate-700 block mb-1">Título da Opção</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: 3 - FALAR COM ATENDENTE"
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-semibold text-slate-800"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Ação ao Clicar</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as FlowActionType)}
              className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 bg-white"
            >
              <option value="submenu">💬 Submenu com Mais Opções</option>
              <option value="transfer">👤 Transferir para Fila de Atendente</option>
              <option value="erp">⚡ Consulta Integrada no ERP</option>
              <option value="ai">🤖 Agente de Inteligência Artificial</option>
              <option value="close">👋 Encerrar Atendimento</option>
            </select>
          </div>

          {action === 'transfer' && (
            <div>
              <label className="font-bold text-slate-700 block mb-1">Departamento</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 bg-white"
              >
                <option value="Suporte Técnico">Suporte Técnico</option>
                <option value="Financeiro">Financeiro</option>
                <option value="Comercial">Comercial</option>
                <option value="Atendimento Geral">Atendimento Geral</option>
              </select>
            </div>
          )}

          {action === 'erp' && (
            <div>
              <label className="font-bold text-slate-700 block mb-1">Ação no ERP</label>
              <select
                value={erpAction}
                onChange={(e) => setErpAction(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 bg-white"
              >
                <option value="2via_boleto">2ª Via de Boleto / Código PIX</option>
                <option value="promessa_pagamento">Promessa de Pagamento (Desbloqueio 48h)</option>
                <option value="consulta_status_os">Consulta de Ordem de Serviço</option>
              </select>
            </div>
          )}

          <div>
            <label className="font-bold text-slate-700 block mb-1">Resposta do Bot</label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensagem enviada ao cliente..."
              className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-xs"
            >
              Criar Opção
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  MessageSquare,
  Globe,
  Send,
  ExternalLink,
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Copy,
  Check,
  Server,
  Key,
  Phone,
  Radio,
  Sliders,
  HelpCircle,
  X,
  Link2,
  LogOut,
  Trash2,
} from 'lucide-react';
import { api } from '../../services/api';
import type {
  TelegramConfig,
  WhatsAppOfficialConfig,
  WhatsAppEvolutionConfig,
  EvolutionInstance,
} from '../../types/crm';

export const CanaisView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'evolution' | 'whatsapp_official' | 'telegram' | 'mobile_web'>('evolution');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // WhatsApp Evolution
  const [evoForm, setEvoForm] = useState<WhatsAppEvolutionConfig>({
    enabled: true,
    serverUrl: 'http://45.166.31.237:8080',
    apiKey: 'rr66oi90rr66oi90',
    instanceName: 'solprovedorgroup',
    webhookUrl: '',
    status: 'connected',
  });
  const [evoInstances, setEvoInstances] = useState<EvolutionInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState<boolean>(false);
  const [newInstanceName, setNewInstanceName] = useState<string>('');
  const [showNewInstanceModal, setShowNewInstanceModal] = useState<boolean>(false);
  const [qrCodeData, setQrCodeData] = useState<{ base64?: string; pairingCode?: string; code?: string } | null>(null);
  const [activeQrInstanceName, setActiveQrInstanceName] = useState<string>('');
  const [qrModalOpen, setQrModalOpen] = useState<boolean>(false);
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [evoWebhookInput, setEvoWebhookInput] = useState<string>('');

  // WhatsApp Oficial Meta
  const [waOfficialForm, setWaOfficialForm] = useState<WhatsAppOfficialConfig>({
    enabled: false,
    phoneNumberId: '',
    wabaId: '',
    accessToken: '',
    verifyToken: 'sol_token_oficial_2026',
    displayPhoneNumber: '',
    status: 'disconnected',
  });
  const [testingWaOfficial, setTestingWaOfficial] = useState<boolean>(false);

  // Telegram
  const [telegramForm, setTelegramForm] = useState<TelegramConfig>({
    enabled: false,
    botToken: '',
    botName: '',
    botUsername: '',
    webhookUrl: '',
    status: 'disconnected',
  });
  const [testingTelegram, setTestingTelegram] = useState<boolean>(false);
  const [telegramWebhookInput, setTelegramWebhookInput] = useState<string>('');

  // Configuração do Servidor do App Mobile & QR Code
  const [mobileServerUrl, setMobileServerUrl] = useState<string>(() => {
    return window.location.origin.includes(':5173')
      ? `http://${window.location.hostname}:8080`
      : window.location.origin;
  });
  const [serverHealthStatus, setServerHealthStatus] = useState<{ ok: boolean; companyName?: string } | null>(null);
  const [testingHealth, setTestingHealth] = useState<boolean>(false);

  const testMobileServerHealth = async (overrideUrl?: string) => {
    const target = (overrideUrl || mobileServerUrl).trim().replace(/\/+$/, '');
    if (!target) return;
    setTestingHealth(true);
    try {
      const res = await fetch(`${target}/api/health`);
      if (res.ok) {
        const data = await res.json();
        setServerHealthStatus({ ok: true, companyName: data.companyName });
        showMsg('success', `Servidor online e acessível! Empresa: ${data.companyName || 'Identificada'}`);
      } else {
        setServerHealthStatus({ ok: false });
        showMsg('error', `Servidor respondeu com código HTTP ${res.status}`);
      }
    } catch {
      setServerHealthStatus({ ok: false });
      showMsg('error', 'Não foi possível alcançar o servidor na URL informada.');
    } finally {
      setTestingHealth(false);
    }
  };

  // Copied helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const showMsg = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Carregar dados iniciais
  const loadInitialData = async () => {
    setLoading(true);
    try {
      const config = await api.getChannelsConfig();

      if (config.whatsappEvolution) {
        setEvoForm((prev) => ({
          ...prev,
          ...config.whatsappEvolution,
          serverUrl: config.whatsappEvolution.serverUrl || 'http://45.166.31.237:8080',
          apiKey: config.whatsappEvolution.apiKey || 'rr66oi90rr66oi90',
        }));
        setEvoWebhookInput(config.whatsappEvolution.webhookUrl || `http://${window.location.hostname || 'localhost'}:8080/api/webhooks/evolution`);
      }

      if (config.whatsappOfficial) {
        setWaOfficialForm((prev) => ({
          ...prev,
          ...config.whatsappOfficial,
        }));
      }

      if (config.telegram) {
        setTelegramForm((prev) => ({
          ...prev,
          ...config.telegram,
        }));
        setTelegramWebhookInput(config.telegram.webhookUrl || '');
      }

      // Carrega instâncias do Evolution
      loadEvolutionInstances();
    } catch (err: any) {
      showMsg('error', err.message || 'Erro ao carregar dados dos canais');
    } finally {
      setLoading(false);
    }
  };

  const loadEvolutionInstances = async () => {
    setLoadingInstances(true);
    try {
      const list = await api.fetchEvolutionInstances();
      setEvoInstances(list || []);
    } catch (err: any) {
      console.warn('Erro ao listar instâncias do Evolution:', err);
    } finally {
      setLoadingInstances(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // --- Handlers Evolution API ---
  const handleSaveEvolution = async () => {
    setSaving(true);
    try {
      const res = await api.saveEvolutionConfig(evoForm);
      if (res.success) {
        showMsg('success', 'Configurações da Evolution API salvas com sucesso!');
        loadEvolutionInstances();
      }
    } catch (err: any) {
      showMsg('error', err.message || 'Erro ao salvar Evolution API');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenQRCode = async (instanceName: string) => {
    setActiveQrInstanceName(instanceName);
    setQrModalOpen(true);
    setQrLoading(true);
    setQrCodeData(null);
    try {
      const data = await api.getEvolutionQRCode(instanceName);
      setQrCodeData(data);
    } catch (err: any) {
      showMsg('error', err.message || 'Falha ao buscar QR Code da instância');
    } finally {
      setQrLoading(false);
    }
  };

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) {
      showMsg('error', 'Digite um nome para a instância.');
      return;
    }
    const cleanName = newInstanceName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setSaving(true);
    try {
      await api.createEvolutionInstance(cleanName);
      showMsg('success', `Instância "${cleanName}" criada com sucesso! Abrindo QR Code...`);
      setShowNewInstanceModal(false);
      setNewInstanceName('');
      await loadEvolutionInstances();
      // Abre o QR code imediatamente para o usuário escanear com o novo número
      handleOpenQRCode(cleanName);
    } catch (err: any) {
      showMsg('error', err.message || 'Erro ao criar instância no Evolution');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutInstance = async (instanceName: string) => {
    if (!window.confirm(`Deseja desconectar a sessão do WhatsApp na instância "${instanceName}"? O número atual será desvinculado para escanear um novo QR Code.`)) {
      return;
    }
    setSaving(true);
    try {
      await api.logoutEvolutionInstance(instanceName);
      showMsg('success', `Instância "${instanceName}" desconectada! Gerando novo QR Code...`);
      await loadEvolutionInstances();
      handleOpenQRCode(instanceName);
    } catch (err: any) {
      showMsg('error', err.message || 'Erro ao desconectar instância');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInstance = async (instanceName: string) => {
    if (!window.confirm(`Tem certeza que deseja EXCLUIR a instância "${instanceName}" do servidor Evolution?`)) {
      return;
    }
    setSaving(true);
    try {
      await api.deleteEvolutionInstance(instanceName);
      showMsg('success', `Instância "${instanceName}" excluída com sucesso!`);
      if (evoForm.instanceName === instanceName) {
        setEvoForm((prev) => ({ ...prev, instanceName: '' }));
      }
      loadEvolutionInstances();
    } catch (err: any) {
      showMsg('error', err.message || 'Erro ao excluir instância');
    } finally {
      setSaving(false);
    }
  };

  const handleSetupEvoWebhook = async (instanceName: string) => {
    setSaving(true);
    try {
      const currentHost = window.location.hostname || 'localhost';
      const defaultWebhook = evoWebhookInput.trim() || `http://${currentHost}:8080/api/webhooks/evolution`;
      const res = await api.setupEvolutionWebhook(defaultWebhook, instanceName);
      if (res.success) {
        showMsg('success', `Webhook registrado no Evolution para a instância "${instanceName}"!`);
      }
    } catch (err: any) {
      showMsg('error', err.message || 'Erro ao registrar Webhook no Evolution');
    } finally {
      setSaving(false);
    }
  };

  // --- Handlers WhatsApp Oficial Meta ---
  const handleSaveWaOfficial = async () => {
    setSaving(true);
    try {
      const res = await api.saveWhatsAppOfficialConfig(waOfficialForm);
      if (res.success) {
        showMsg('success', 'Configurações do WhatsApp Oficial Meta salvas com sucesso!');
      }
    } catch (err: any) {
      showMsg('error', err.message || 'Erro ao salvar WhatsApp Oficial');
    } finally {
      setSaving(false);
    }
  };

  const handleTestWaOfficial = async () => {
    setTestingWaOfficial(true);
    try {
      const res = await api.testWhatsAppOfficial();
      if (res.success) {
        setWaOfficialForm((prev) => ({
          ...prev,
          displayPhoneNumber: res.displayPhoneNumber,
          status: 'connected',
        }));
        showMsg('success', `Conexão bem-sucedida! Número Meta: ${res.displayPhoneNumber}`);
      }
    } catch (err: any) {
      showMsg('error', err.message || 'Falha ao testar credenciais do WhatsApp Oficial');
    } finally {
      setTestingWaOfficial(false);
    }
  };

  // --- Handlers Telegram ---
  const handleSaveTelegram = async () => {
    setSaving(true);
    try {
      const res = await api.saveTelegramConfig(telegramForm);
      if (res.success) {
        showMsg('success', 'Configurações do Telegram salvas com sucesso!');
      }
    } catch (err: any) {
      showMsg('error', err.message || 'Erro ao salvar Telegram');
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      const res = await api.testTelegram();
      if (res.success) {
        setTelegramForm((prev) => ({
          ...prev,
          botName: res.botName,
          botUsername: res.botUsername,
          status: 'connected',
        }));
        showMsg('success', `Bot verificado com sucesso: ${res.botName} (@${res.botUsername})`);
      }
    } catch (err: any) {
      showMsg('error', err.message || 'Falha ao verificar Bot Token do Telegram');
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleSetupTelegramWebhook = async () => {
    if (!telegramWebhookInput.trim()) {
      showMsg('error', 'Informe a URL do webhook público do seu servidor.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.setupTelegramWebhook(telegramWebhookInput.trim());
      if (res.success) {
        setTelegramForm((prev) => ({ ...prev, webhookUrl: telegramWebhookInput.trim() }));
        showMsg('success', res.message || 'Webhook do Telegram ativado com sucesso!');
      }
    } catch (err: any) {
      showMsg('error', err.message || 'Erro ao registrar Webhook no Telegram');
    } finally {
      setSaving(false);
    }
  };

  // Status visual cards
  const summaryChannels = [
    {
      id: 'evolution',
      name: 'WhatsApp (Evolution API)',
      sub: evoInstances.length > 0 ? `${evoInstances.length} instância(s) detectada(s)` : 'Servidor dedicado',
      badge: evoForm.enabled ? 'Ativo' : 'Pausado',
      badgeColor: evoForm.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
      icon: MessageSquare,
      color: '#16A34A',
    },
    {
      id: 'whatsapp_official',
      name: 'WhatsApp Oficial (Meta Cloud)',
      sub: waOfficialForm.displayPhoneNumber ? waOfficialForm.displayPhoneNumber : 'Meta Graph API',
      badge: waOfficialForm.enabled ? 'Ativo' : 'Configurar',
      badgeColor: waOfficialForm.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
      icon: MessageSquare,
      color: '#059669',
    },
    {
      id: 'telegram',
      name: 'Telegram Bot',
      sub: telegramForm.botUsername ? `@${telegramForm.botUsername}` : 'BotFather API',
      badge: telegramForm.enabled ? 'Ativo' : 'Configurar',
      badgeColor: telegramForm.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
      icon: Send,
      color: '#0284C7',
    },
    {
      id: 'mobile_web',
      name: 'App Mobile SOL & Web',
      sub: 'WebSockets nativos Go',
      badge: 'Conectado',
      badgeColor: 'bg-blue-100 text-blue-700',
      icon: Smartphone,
      color: '#2563EB',
    },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <span>Canais de Atendimento Omnichannel</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
              Unificado
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Receba mensagens do <strong>WhatsApp (Oficial e Evolution)</strong>, <strong>Telegram</strong> e <strong>App Mobile</strong> em uma fila centralizada de operadores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadInitialData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>Atualizar Status</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {summaryChannels.map((c) => {
          const Icon = c.icon;
          const isCurrent = activeTab === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id as any)}
              className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-3 ${
                isCurrent
                  ? 'bg-white border-blue-500 shadow-sm ring-2 ring-blue-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
              }`}
            >
              <div className="flex items-start justify-between w-full">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                  style={{ backgroundColor: c.color }}
                >
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.badgeColor}`}>
                  {c.badge}
                </span>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-xs truncate">{c.name}</h3>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">{c.sub}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-2 pt-2 gap-1 text-xs font-semibold text-slate-600">
        <button
          onClick={() => setActiveTab('evolution')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
            activeTab === 'evolution'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-lg'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-emerald-600" />
          <span>WhatsApp Evolution (Não Oficial)</span>
          <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 text-[10px]">Evo v2</span>
        </button>

        <button
          onClick={() => setActiveTab('whatsapp_official')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
            activeTab === 'whatsapp_official'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Radio className="w-4 h-4 text-blue-600" />
          <span>WhatsApp Oficial (Meta Cloud API)</span>
          <span className="px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800 text-[10px]">Graph API</span>
        </button>

        <button
          onClick={() => setActiveTab('telegram')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
            activeTab === 'telegram'
              ? 'border-sky-600 text-sky-700 bg-sky-50/50 rounded-t-lg'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Send className="w-4 h-4 text-sky-600" />
          <span>Telegram Bot</span>
          <span className="px-1.5 py-0.2 rounded-md bg-sky-100 text-sky-800 text-[10px]">BotFather</span>
        </button>

        <button
          onClick={() => setActiveTab('mobile_web')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
            activeTab === 'mobile_web'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Smartphone className="w-4 h-4 text-indigo-600" />
          <span>App Mobile & Web Widget</span>
        </button>
      </div>

      {/* Tab 1: WhatsApp Evolution */}
      {activeTab === 'evolution' && (
        <div className="bg-white p-6 rounded-b-xl border border-slate-200 shadow-2xs space-y-6">
          {/* Info Banner */}
          <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                <Server className="w-4.5 h-4.5" />
              </div>
              <div>
                <h4 className="font-bold text-emerald-950 text-sm">Servidor Evolution API Configurado</h4>
                <p className="text-xs text-emerald-800/80 mt-0.5 leading-relaxed">
                  Conexão direta com seu servidor Evolution API em <strong>{evoForm.serverUrl}</strong>.
                  Permite conectar números via QR Code, receber mensagens instantaneamente e responder aos clientes pela interface do operador.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowNewInstanceModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Instância</span>
              </button>
              <button
                onClick={loadEvolutionInstances}
                disabled={loadingInstances}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 font-medium text-xs transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingInstances ? 'animate-spin' : ''}`} />
                <span>Recarregar</span>
              </button>
            </div>
          </div>

          {/* Form de Conexão com o Servidor Evolution */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-slate-800 text-sm">Parâmetros do Servidor Evolution</h3>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={evoForm.enabled}
                  onChange={(e) => setEvoForm({ ...evoForm, enabled: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span>Canal Habilitado</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  URL Base do Servidor Evolution
                </label>
                <div className="relative">
                  <Server className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={evoForm.serverUrl}
                    onChange={(e) => setEvoForm({ ...evoForm, serverUrl: e.target.value })}
                    placeholder="http://45.166.31.237:8080"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chave Global da API (API Key)
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={evoForm.apiKey}
                    onChange={(e) => setEvoForm({ ...evoForm, apiKey: e.target.value })}
                    placeholder="rr66oi90rr66oi90"
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Instância Padrão de Envio
                </label>
                <input
                  type="text"
                  value={evoForm.instanceName}
                  onChange={(e) => setEvoForm({ ...evoForm, instanceName: e.target.value })}
                  placeholder="solprovedorgroup"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveEvolution}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-xs transition-colors"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Salvar Configuração do Servidor</span>
              </button>
            </div>
          </div>

          {/* Instâncias Conectadas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Instâncias do WhatsApp no Servidor</h3>
                <p className="text-xs text-slate-500">
                  Instâncias ativas escutando e conectadas ao número de WhatsApp da sua empresa.
                </p>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {evoInstances.length} encontrada(s)
              </span>
            </div>

            {loadingInstances ? (
              <div className="p-8 text-center border border-slate-200 rounded-xl bg-slate-50/50">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500">Buscando instâncias no servidor Evolution...</p>
              </div>
            ) : evoInstances.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/30 space-y-3">
                <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-xs text-slate-600 font-medium">Nenhuma instância cadastrada no momento.</div>
                <button
                  onClick={() => setShowNewInstanceModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Criar Primeira Instância</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {evoInstances.map((inst) => {
                  const isOpen = inst.connectionStatus === 'open';
                  const isConnecting = inst.connectionStatus === 'connecting';
                  const cleanPhone = inst.ownerJid ? inst.ownerJid.replace('@s.whatsapp.net', '') : '';

                  return (
                    <div
                      key={inst.name}
                      className={`p-4 rounded-xl border transition-all space-y-3 ${
                        isOpen
                          ? 'border-emerald-200 bg-emerald-50/20'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0 ${
                              isOpen ? 'bg-emerald-600' : 'bg-slate-400'
                            }`}
                          >
                            <Phone className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                              <span>{inst.name}</span>
                              {inst.name === evoForm.instanceName && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                                  Padrão
                                </span>
                              )}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {inst.profileName || 'Perfil sem nome'}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                            isOpen
                              ? 'bg-emerald-100 text-emerald-800'
                              : isConnecting
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isOpen ? 'bg-emerald-500' : isConnecting ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                          />
                          {isOpen ? 'Conectado (Open)' : isConnecting ? 'Conectando...' : 'Desconectado'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1 font-mono text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-sans">Número WhatsApp:</span>
                          <span className="font-semibold text-slate-800">
                            {cleanPhone ? `+${cleanPhone}` : 'Não vinculado'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-sans">Integração:</span>
                          <span className="text-slate-600">{inst.integration || 'WHATSAPP-BAILEYS'}</span>
                        </div>
                      </div>

                      <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                        <button
                          onClick={() => handleOpenQRCode(inst.name)}
                          className="flex-1 min-w-[130px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs transition-colors"
                        >
                          <QrCode className="w-3.5 h-3.5 text-slate-500" />
                          <span>{isOpen ? 'Ver QR Code' : 'Escanear QR Code'}</span>
                        </button>

                        <button
                          onClick={() => handleSetupEvoWebhook(inst.name)}
                          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition-colors shadow-2xs"
                          title="Configurar Webhook para esta instância enviar mensagens direto para o sistema"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Webhook</span>
                        </button>

                        {isOpen && (
                          <button
                            onClick={() => handleLogoutInstance(inst.name)}
                            disabled={saving}
                            className="p-2 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors"
                            title="Desconectar este número para escanear com outro celular"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteInstance(inst.name)}
                          disabled={saving}
                          className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Excluir esta instância do servidor"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Configuração de Webhook do Evolution */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-3 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Link2 className="w-4 h-4 text-emerald-600" />
              <span>URL de Webhook das Instâncias do Evolution</span>
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              O Evolution API encaminhará as mensagens recebidas para a URL do seu servidor backend Go.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={evoWebhookInput}
                onChange={(e) => setEvoWebhookInput(e.target.value)}
                placeholder="http://localhost:8080/api/webhooks/evolution"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-emerald-500 focus:outline-none"
              />
              <button
                onClick={() => handleSetupEvoWebhook(evoForm.instanceName)}
                disabled={saving || !evoForm.instanceName}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition-colors shrink-0 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ativar na Instância Padrão</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: WhatsApp Oficial Meta Cloud API */}
      {activeTab === 'whatsapp_official' && (
        <div className="bg-white p-6 rounded-b-xl border border-slate-200 shadow-2xs space-y-6">
          <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200/80 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0 mt-0.5">
              <Radio className="w-4.5 h-4.5" />
            </div>
            <div>
              <h4 className="font-bold text-blue-950 text-sm">WhatsApp Business Cloud API (Oficial da Meta)</h4>
              <p className="text-xs text-blue-800/80 mt-0.5 leading-relaxed">
                Integração direta com os servidores oficiais da Meta (Facebook Developers).
                Garante alta taxa de entrega, templates aprovados e selo de verificação oficial da empresa.
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-slate-800 text-sm">Credenciais da Meta Cloud API</h3>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={waOfficialForm.enabled}
                  onChange={(e) => setWaOfficialForm({ ...waOfficialForm, enabled: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span>Canal Oficial Habilitado</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Identificação do Número de Telefone (Phone Number ID)
                </label>
                <input
                  type="text"
                  value={waOfficialForm.phoneNumberId}
                  onChange={(e) => setWaOfficialForm({ ...waOfficialForm, phoneNumberId: e.target.value })}
                  placeholder="ex: 104829104829104"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Encontrado no painel da Meta for Developers &gt; WhatsApp &gt; Configuração da API.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ID da Conta do WhatsApp Business (WABA ID)
                </label>
                <input
                  type="text"
                  value={waOfficialForm.wabaId}
                  onChange={(e) => setWaOfficialForm({ ...waOfficialForm, wabaId: e.target.value })}
                  placeholder="ex: 204918204918204"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Token de Acesso Permanente do Sistema (Access Token)
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={waOfficialForm.accessToken}
                    onChange={(e) => setWaOfficialForm({ ...waOfficialForm, accessToken: e.target.value })}
                    placeholder="EAAG..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Token de usuário do sistema gerado no Gerenciador de Negócios da Meta com permissões <code>whatsapp_business_messaging</code> e <code>whatsapp_business_management</code>.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Token de Verificação do Webhook (Verify Token)
                </label>
                <input
                  type="text"
                  value={waOfficialForm.verifyToken}
                  onChange={(e) => setWaOfficialForm({ ...waOfficialForm, verifyToken: e.target.value })}
                  placeholder="sol_token_oficial_2026"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Número de Exibição Confirmado
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled
                    value={waOfficialForm.displayPhoneNumber || 'Aguardando validação'}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-500 bg-slate-50 font-mono"
                  />
                  <button
                    onClick={handleTestWaOfficial}
                    disabled={testingWaOfficial || !waOfficialForm.phoneNumberId || !waOfficialForm.accessToken}
                    className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    {testingWaOfficial ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>Testar Credenciais</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveWaOfficial}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Salvar Configuração Meta</span>
              </button>
            </div>
          </div>

          {/* Instruções para o Webhook da Meta */}
          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 space-y-3">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600" />
              <span>Como configurar o Webhook no portal Meta for Developers:</span>
            </h4>
            <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                Acesse o portal da Meta em <strong>developers.facebook.com</strong> no seu App &gt; WhatsApp &gt; Configuração.
              </li>
              <li>
                Em <strong>URL de retorno de chamada (Callback URL)</strong>, informe:
                <div className="mt-1 flex items-center gap-2">
                  <code className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-800 font-mono text-[11px] select-all">
                    https://seu-dominio.com/api/webhooks/whatsapp-official
                  </code>
                  <button
                    onClick={() => copyToClipboard('https://seu-dominio.com/api/webhooks/whatsapp-official', 'meta_url')}
                    className="p-1 rounded hover:bg-slate-200 text-slate-500"
                    title="Copiar URL"
                  >
                    {copiedKey === 'meta_url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </li>
              <li>
                Em <strong>Token de verificação</strong>, insira o mesmo token configurado acima:
                <span className="font-mono font-bold text-slate-800 ml-1">{waOfficialForm.verifyToken}</span>
              </li>
              <li>
                Nos campos de webhook a assinar, marque o campo <strong>messages</strong>.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Tab 3: Telegram Bot */}
      {activeTab === 'telegram' && (
        <div className="bg-white p-6 rounded-b-xl border border-slate-200 shadow-2xs space-y-6">
          <div className="p-4 rounded-xl bg-sky-50/80 border border-sky-200/80 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center text-white shrink-0 mt-0.5">
              <Send className="w-4.5 h-4.5" />
            </div>
            <div>
              <h4 className="font-bold text-sky-950 text-sm">Bot Oficial do Telegram</h4>
              <p className="text-xs text-sky-800/80 mt-0.5 leading-relaxed">
                Permita que clientes iniciem chamados e recebam faturas diretamente através do Telegram Bot da sua empresa, criado gratuitamente via <strong>@BotFather</strong>.
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-slate-800 text-sm">Parâmetros do Telegram Bot</h3>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={telegramForm.enabled}
                  onChange={(e) => setTelegramForm({ ...telegramForm, enabled: e.target.checked })}
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <span>Canal Telegram Habilitado</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Token da API do Bot (Bot Token fornecido pelo @BotFather)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={telegramForm.botToken}
                      onChange={(e) => setTelegramForm({ ...telegramForm, botToken: e.target.value })}
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleTestTelegram}
                    disabled={testingTelegram || !telegramForm.botToken}
                    className="px-3.5 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    {testingTelegram ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>Testar Bot</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Bot Identificado
                </label>
                <input
                  type="text"
                  disabled
                  value={telegramForm.botName || 'Não identificado'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome de Usuário (@username)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled
                    value={telegramForm.botUsername ? `@${telegramForm.botUsername}` : 'Não identificado'}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 bg-slate-50 font-mono"
                  />
                  {telegramForm.botUsername && (
                    <a
                      href={`https://t.me/${telegramForm.botUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg border border-slate-200 text-sky-600 hover:bg-sky-50 transition-colors"
                      title="Abrir no Telegram"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveTelegram}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs shadow-xs transition-colors"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Salvar Configuração do Telegram</span>
              </button>
            </div>
          </div>

          {/* Webhook do Telegram */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Link2 className="w-4 h-4 text-sky-600" />
              <span>Registro de Webhook Automático no Telegram</span>
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              O Telegram enviará as mensagens dos clientes para a URL informada abaixo. Certifique-se de que seu servidor possua uma URL pública com HTTPS (ou utilize Cloudflare Tunnel / Ngrok para desenvolvimento).
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={telegramWebhookInput}
                onChange={(e) => setTelegramWebhookInput(e.target.value)}
                placeholder="https://seu-dominio.com/api/webhooks/telegram"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-sky-500 focus:outline-none"
              />
              <button
                onClick={handleSetupTelegramWebhook}
                disabled={saving || !telegramWebhookInput.trim()}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs transition-colors shrink-0 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Registrar Webhook no Telegram</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: App Mobile & Web Widget */}
      {activeTab === 'mobile_web' && (
        <div className="bg-white p-6 rounded-b-xl border border-slate-200 shadow-2xs space-y-6">
          {/* Header explicativo do App Mobile */}
          <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">Central de Pareamento & Distribuição do App Mobile</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Conecte os celulares dos clientes ao seu servidor com 1 toque (App Universal) ou gere um build exclusivo (White-Label).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold flex items-center gap-1.5 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Hub WebSocket Ativo (/ws)
              </span>
            </div>
          </div>

          {/* Configuração do Endereço Público do Servidor */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600" />
                <span>Endereço Público do Servidor (Base URL do App)</span>
              </label>
              <div className="flex items-center gap-3">
                {serverHealthStatus && (
                  <span className={`text-xs font-semibold flex items-center gap-1.5 ${serverHealthStatus.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {serverHealthStatus.ok ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Online ({serverHealthStatus.companyName || 'Ativo'})</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        <span>Inacessível</span>
                      </>
                    )}
                  </span>
                )}
                <button
                  onClick={() => testMobileServerHealth()}
                  disabled={testingHealth}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {testingHealth ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Testar Acessibilidade (/api/health)</span>
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Informe o endereço público ou domínio pelo qual o aplicativo dos clientes acessará este servidor (ex: <code>https://chat.suaempresa.com.br</code> ou <code>http://45.166.31.237:8080</code>).
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={mobileServerUrl}
                onChange={(e) => setMobileServerUrl(e.target.value)}
                placeholder="https://chat.suaempresa.com.br ou http://seu-ip:8080"
                className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => copyToClipboard(mobileServerUrl, 'mobile_server_url')}
                className="px-3.5 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {copiedKey === 'mobile_server_url' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-400" />}
                <span>{copiedKey === 'mobile_server_url' ? 'Copiado!' : 'Copiar URL'}</span>
              </button>
            </div>
          </div>

          {/* Grid dos 2 Modelos: Universal vs White-Label */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Modelo 1: App Universal / Pareamento por QR Code */}
            <div className="border-2 border-blue-100 rounded-xl p-5 space-y-4 bg-gradient-to-b from-blue-50/30 to-white flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-blue-600" />
                    <h4 className="font-bold text-slate-800 text-sm">Modelo 1: Pareamento por QR Code (App Universal)</h4>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                    Sem Compilação
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Os clientes baixam o <strong>aplicativo padrão na loja</strong> e apontam a câmera para este QR Code. A base do servidor é gravada instantaneamente no celular.
                </p>

                {/* Exibição do QR Code */}
                <div className="my-4 text-center">
                  <div className="w-56 h-56 mx-auto p-2.5 rounded-2xl bg-white border-2 border-blue-200/60 shadow-md flex items-center justify-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                        `solchat://connect?server=${encodeURIComponent(mobileServerUrl.trim())}`
                      )}`}
                      alt="QR Code de Conexão do Servidor"
                      className="w-full h-full object-contain rounded-lg"
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 mt-2 block font-mono">
                    solchat://connect?server={encodeURIComponent(mobileServerUrl.trim())}
                  </span>
                </div>

                {/* Passos didáticos para os clientes */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider">Como orientar seu cliente:</div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <span>Cliente instala o aplicativo <strong>SOL Central</strong> pela Play Store / App Store.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <span>Abre o app e aponta a câmera para este <strong>QR Code</strong> (ou clica no link direto abaixo).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <span>O celular conecta à sua base para sempre e já libera o autoatendimento e o chat com atendentes!</span>
                  </div>
                </div>
              </div>

              {/* Botões de Ação do Pareamento */}
              <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-2">
                <button
                  onClick={() => copyToClipboard(`solchat://connect?server=${encodeURIComponent(mobileServerUrl.trim())}`, 'deep_link')}
                  className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  {copiedKey === 'deep_link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedKey === 'deep_link' ? 'Link Copiado!' : 'Copiar Link de Pareamento'}</span>
                </button>
                <a
                  href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(
                    `solchat://connect?server=${encodeURIComponent(mobileServerUrl.trim())}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors text-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Imprimir / Salvar Imagem</span>
                </a>
              </div>
            </div>

            {/* Modelo 2: Build White-Label Exclusivo */}
            <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50/50 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-bold text-slate-800 text-sm">Modelo 2: Compilação White-Label (App Exclusivo)</h4>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    Marca Própria
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Caso deseje publicar um aplicativo próprio na Google Play / App Store com o nome e o logotipo da sua empresa, gere o build informando a variável de ambiente abaixo. A URL ficará <strong>fixada no código binário</strong> e os clientes entrarão direto sem nenhuma etapa de configuração.
                </p>

                {/* Bloco de Código de Build */}
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Comando de Compilação Local (APK Android Release):
                    </label>
                    <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[11px] relative flex items-center justify-between group">
                      <span className="break-all select-all">
                        EXPO_PUBLIC_API_URL="{mobileServerUrl.trim()}" npx expo run:android --variant release
                      </span>
                      <button
                        onClick={() => copyToClipboard(`EXPO_PUBLIC_API_URL="${mobileServerUrl.trim()}" npx expo run:android --variant release`, 'cmd_local')}
                        className="ml-2 p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shrink-0 cursor-pointer"
                        title="Copiar comando"
                      >
                        {copiedKey === 'cmd_local' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Comando EAS Cloud Build (Produção / Play Store):
                    </label>
                    <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[11px] relative flex items-center justify-between group">
                      <span className="break-all select-all">
                        EXPO_PUBLIC_API_URL="{mobileServerUrl.trim()}" eas build --platform android --profile production
                      </span>
                      <button
                        onClick={() => copyToClipboard(`EXPO_PUBLIC_API_URL="${mobileServerUrl.trim()}" eas build --platform android --profile production`, 'cmd_eas')}
                        className="ml-2 p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shrink-0 cursor-pointer"
                        title="Copiar comando"
                      >
                        {copiedKey === 'cmd_eas' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-[11px] text-slate-500 bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                  <div>✓ <strong>Zero configuração para o cliente:</strong> Baixou na Play Store, abre direto no chat.</div>
                  <div>✓ <strong>Identidade visual completa:</strong> Nome, cores e ícone da empresa na tela do celular.</div>
                  <div>✓ <strong>Segurança reforçada:</strong> URL criptografada dentro do binário assinado.</div>
                </div>
              </div>

              {/* Botão para copiar variável de ambiente */}
              <div className="pt-2">
                <button
                  onClick={() => copyToClipboard(`EXPO_PUBLIC_API_URL="${mobileServerUrl.trim()}"`, 'env_var')}
                  className="w-full py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedKey === 'env_var' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  <span>{copiedKey === 'env_var' ? 'Variável Copiada!' : 'Copiar Variável EXPO_PUBLIC_API_URL'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Widget Web do Assinante */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Widget Web do Assinante (Para Site ou Central Web)</h3>
                <span className="text-[11px] text-purple-600 font-semibold">
                  Script pronto para incorporar na sua Central do Assinante
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Incorpore o chat de atendimento em qualquer página web ou Central do Assinante adicionando a tag de script abaixo antes do fechamento de <code>&lt;/body&gt;</code>.
            </p>
            <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[11px] relative flex items-center justify-between group">
              <span className="break-all select-all">
                {`<script src="${mobileServerUrl.trim()}/widget.js" async></script>`}
              </span>
              <button
                onClick={() => copyToClipboard(`<script src="${mobileServerUrl.trim()}/widget.js" async></script>`, 'widget_tag')}
                className="ml-2 p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shrink-0 cursor-pointer"
                title="Copiar tag do widget"
              >
                {copiedKey === 'widget_tag' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: QR Code Evolution API */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">QR Code do WhatsApp</h3>
                  {activeQrInstanceName && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      Instância: {activeQrInstanceName}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setQrModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center space-y-3">
              <p className="text-xs text-slate-500 leading-relaxed">
                Abra o WhatsApp no seu smartphone, vá em <strong>Aparelhos conectados</strong> e aponte a câmera para escanear:
              </p>

              {qrLoading ? (
                <div className="w-56 h-56 mx-auto rounded-xl border border-slate-200 flex flex-col items-center justify-center bg-slate-50 gap-2">
                  <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin" />
                  <span className="text-xs text-slate-500 font-medium">Gerando QR Code...</span>
                </div>
              ) : qrCodeData?.base64 ? (
                <div className="w-60 h-60 mx-auto p-2 rounded-xl border-2 border-emerald-500/30 bg-white shadow-inner flex items-center justify-center">
                  <img
                    src={qrCodeData.base64.startsWith('data:') ? qrCodeData.base64 : `data:image/png;base64,${qrCodeData.base64}`}
                    alt="WhatsApp QR Code"
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>
              ) : qrCodeData?.code ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-xs text-slate-400 font-medium">Código de Pareamento:</span>
                  <div className="text-lg font-mono font-bold text-emerald-700 tracking-wider">
                    {qrCodeData.code}
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50 space-y-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <div>
                    <p className="text-xs text-slate-700 font-medium">Esta instância já está conectada a um WhatsApp!</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Para conectar outro número, desconecte a sessão atual primeiro.</p>
                  </div>
                  <button
                    onClick={() => handleLogoutInstance(activeQrInstanceName)}
                    disabled={saving}
                    className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Desconectar e Ler Novo Número</span>
                  </button>
                </div>
              )}

              {qrCodeData?.pairingCode && (
                <div className="text-xs text-slate-500">
                  Código de emparelhamento: <strong className="font-mono text-slate-800">{qrCodeData.pairingCode}</strong>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={() => handleOpenQRCode(activeQrInstanceName)}
                disabled={qrLoading}
                className="flex-1 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${qrLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
              <button
                onClick={() => setQrModalOpen(false)}
                className="flex-1 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar Nova Instância Evolution */}
      {showNewInstanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-sm">Criar Instância no Evolution</h3>
              </div>
              <button
                onClick={() => setShowNewInstanceModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome da Nova Instância
                </label>
                <input
                  type="text"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="ex: suporte_sol, vendas_sol"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-mono focus:border-emerald-500 focus:outline-none"
                  autoFocus
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Apenas letras minúsculas, números, hífen e sublinhado.
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowNewInstanceModal(false)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateInstance}
                disabled={saving || !newInstanceName.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-xs"
              >
                {saving ? 'Criando...' : 'Criar Instância'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

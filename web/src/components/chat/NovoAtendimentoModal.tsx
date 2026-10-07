import React, { useState, useEffect } from 'react';
import {
  X,
  MessageSquare,
  Radio,
  Send,
  Smartphone,
  Search,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  User,
  Phone,
  FileText,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { api } from '../../services/api';
import type { AuthUser } from '../../types/crm';
import type { Conversation, WhatsAppTemplate } from '../../types/chat';

interface NovoAtendimentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  onSuccess: (newConv: Conversation) => void;
}

export const NovoAtendimentoModal: React.FC<NovoAtendimentoModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSuccess,
}) => {
  const [channel, setChannel] = useState<'whatsapp_evolution' | 'whatsapp_official' | 'telegram' | 'mobile'>('whatsapp_evolution');
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [department, setDepartment] = useState('Suporte Técnico');
  const [initialMessage, setInitialMessage] = useState('');
  
  // WhatsApp Oficial Templates
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
  const [templateParams, setTemplateParams] = useState<string[]>([]);

  // RBX search
  const [searchingRbx, setSearchingRbx] = useState(false);
  const [rbxFeedback, setRbxFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Status de envio
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carrega templates ao abrir ou ao alternar para WhatsApp Oficial
  useEffect(() => {
    if (isOpen && channel === 'whatsapp_official' && templates.length === 0) {
      loadTemplates();
    }
  }, [isOpen, channel]);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const list = await api.getWhatsAppOfficialTemplates();
      setTemplates(list);
      if (list.length > 0 && !selectedTemplateName) {
        setSelectedTemplateName(list[0].name);
        initTemplateParams(list[0]);
      }
    } catch (err: any) {
      console.error('Erro ao carregar templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.name === selectedTemplateName) || null;

  const initTemplateParams = (tmpl: WhatsAppTemplate) => {
    const initialValues = tmpl.paramLabels.map((label) => {
      const lower = label.toLowerCase();
      if (lower.includes('cliente') || lower.includes('nome')) return clientName || '';
      if (lower.includes('atendente') || lower.includes('operador')) return currentUser?.name || '';
      if (lower.includes('setor') || lower.includes('departamento') || lower.includes('motivo')) return department || '';
      return '';
    });
    setTemplateParams(initialValues);
  };

  const handleSelectTemplate = (name: string) => {
    setSelectedTemplateName(name);
    const tmpl = templates.find((t) => t.name === name);
    if (tmpl) {
      initTemplateParams(tmpl);
    }
  };

  // Atualiza parâmetro específico do template
  const handleParamChange = (index: number, val: string) => {
    setTemplateParams((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  // Preview do texto renderizado do template
  const getRenderedPreview = () => {
    if (!selectedTemplate) return '';
    let text = selectedTemplate.bodyText;
    templateParams.forEach((val, idx) => {
      const placeholder = `{{${idx + 1}}}`;
      text = text.replace(placeholder, val || `[${selectedTemplate.paramLabels[idx] || `Parâmetro ${idx + 1}`}]`);
    });
    return text;
  };

  // Busca rápida de cliente no RBX pelo CPF/CNPJ
  const handleSearchRbx = async () => {
    const cleanDoc = cpfCnpj.replace(/\D/g, '');
    if (!cleanDoc) {
      setRbxFeedback({ type: 'error', msg: 'Informe o CPF/CNPJ para buscar no RBX.' });
      return;
    }
    setSearchingRbx(true);
    setRbxFeedback(null);
    try {
      const client = await api.searchRbxCustomer(cleanDoc);
      if (client && client.nome) {
        setClientName(client.nome);
        const contactPhone = client.celular || client.telefone || '';
        if (contactPhone) {
          setPhone(contactPhone);
        }
        setRbxFeedback({
          type: 'success',
          msg: `Cliente encontrado: ${client.nome} (${client.cidade || 'RBX'})`,
        });
        // Atualiza sugestão de nome no template se já selecionado
        if (selectedTemplate && templateParams.length > 0) {
          handleParamChange(0, client.nome);
        }
      } else {
        setRbxFeedback({ type: 'error', msg: 'Cliente não localizado no RBX com este documento.' });
      }
    } catch (e: any) {
      setRbxFeedback({ type: 'error', msg: e.message || 'Cliente não encontrado no RBX.' });
    } finally {
      setSearchingRbx(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clientName.trim()) {
      setError('Por favor, informe o nome do cliente.');
      return;
    }

    if (!phone.trim()) {
      setError('Por favor, informe o telefone/WhatsApp do destinatário.');
      return;
    }

    if (channel === 'whatsapp_official') {
      if (!selectedTemplateName) {
        setError('Na API Oficial da Meta é obrigatório selecionar um Template autorizado para iniciar a conversa.');
        return;
      }
    } else {
      if (!initialMessage.trim()) {
        setError('Por favor, redija a mensagem inicial para o cliente.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await api.startOutboundConversation({
        channel,
        channelId: phone.trim(),
        clientName: clientName.trim(),
        contactName: clientName.trim(),
        cpfCnpj: cpfCnpj.trim() || undefined,
        department,
        operatorId: currentUser?.id || 'usr-admin-01',
        operatorName: currentUser?.name || 'Atendente SOL',
        initialMessage: channel !== 'whatsapp_official' ? initialMessage.trim() : undefined,
        templateName: channel === 'whatsapp_official' ? selectedTemplateName : undefined,
        templateLanguage: 'pt_BR',
        templateParams: channel === 'whatsapp_official' ? templateParams : undefined,
      });

      onSuccess(res.conversation);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Falha ao iniciar atendimento avulso.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-scaleIn">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-blue-50/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Iniciar Atendimento Avulso
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">Outbound</span>
              </h2>
              <p className="text-xs text-slate-500">
                Selecione o canal de envio e conecte-se ativamente com o cliente
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Formulário */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* 1. SELEÇÃO DO CANAL */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
              1. Selecione o Canal de Atendimento
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* WhatsApp Evolution (Não Oficial) */}
              <div
                onClick={() => setChannel('whatsapp_evolution')}
                className={`cursor-pointer p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between ${
                  channel === 'whatsapp_evolution'
                    ? 'border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-500/10'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">WhatsApp Evolution</div>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                        API Aberta / Não Oficial
                      </span>
                    </div>
                  </div>
                  {channel === 'whatsapp_evolution' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Permite redigir <strong>texto livre</strong> e iniciar o contato direto sem restrição de templates.
                </p>
              </div>

              {/* WhatsApp Oficial (Meta Cloud API) */}
              <div
                onClick={() => {
                  setChannel('whatsapp_official');
                  if (templates.length === 0) loadTemplates();
                }}
                className={`cursor-pointer p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between ${
                  channel === 'whatsapp_official'
                    ? 'border-green-600 bg-green-50/50 shadow-sm shadow-green-600/10'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-green-100 text-green-800 flex items-center justify-center">
                      <Radio className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">WhatsApp Oficial</div>
                      <span className="text-[10px] font-semibold text-green-800 bg-green-100 px-1.5 py-0.2 rounded">
                        Meta Cloud API
                      </span>
                    </div>
                  </div>
                  {channel === 'whatsapp_official' && <CheckCircle2 className="w-5 h-5 text-green-700" />}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Regulamentado pela Meta. O 1º contato exige <strong>Template autorizado</strong> para abrir a janela de 24h.
                </p>
              </div>

              {/* Telegram Bot */}
              <div
                onClick={() => setChannel('telegram')}
                className={`cursor-pointer p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between ${
                  channel === 'telegram'
                    ? 'border-sky-500 bg-sky-50/50 shadow-sm shadow-sky-500/10'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                      <Send className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Telegram Bot</div>
                      <span className="text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.2 rounded">
                        Telegram API
                      </span>
                    </div>
                  </div>
                  {channel === 'telegram' && <CheckCircle2 className="w-5 h-5 text-sky-600" />}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Envio livre de mensagens diretas usando o Chat ID do cliente no Telegram.
                </p>
              </div>

              {/* App SOL Mobile */}
              <div
                onClick={() => setChannel('mobile')}
                className={`cursor-pointer p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between ${
                  channel === 'mobile'
                    ? 'border-blue-500 bg-blue-50/50 shadow-sm shadow-blue-500/10'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">App SOL Mobile</div>
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
                        App do Cliente
                      </span>
                    </div>
                  </div>
                  {channel === 'mobile' && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Cria a conversa vinculada ao CPF do cliente com envio de push notification nativa.
                </p>
              </div>
            </div>
          </div>

          {/* 2. DADOS DO CLIENTE / DESTINATÁRIO */}
          <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                2. Identificação do Cliente
              </label>
              <span className="text-[11px] text-slate-400">Preencha ou consulte no RBX</span>
            </div>

            {/* Busca no RBX por CPF */}
            <div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={cpfCnpj}
                    onChange={(e) => setCpfCnpj(e.target.value)}
                    placeholder="CPF/CNPJ (ex: 46234390200) para busca rápida no ERP"
                    className="w-full pl-3 pr-9 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  {cpfCnpj && (
                    <button
                      type="button"
                      onClick={() => setCpfCnpj('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSearchRbx}
                  disabled={searchingRbx}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-sm"
                >
                  {searchingRbx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Buscar no RBX
                </button>
              </div>
              {rbxFeedback && (
                <div
                  className={`mt-1.5 text-[11px] flex items-center gap-1.5 ${
                    rbxFeedback.type === 'success' ? 'text-emerald-700 font-medium' : 'text-rose-600'
                  }`}
                >
                  {rbxFeedback.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {rbxFeedback.msg}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Nome do Cliente */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome do Cliente / Titular <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    if (selectedTemplate && templateParams.length > 0) {
                      handleParamChange(0, e.target.value);
                    }
                  }}
                  placeholder="Ex: Adriana Silva da Costa"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Telefone / Identificador */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {channel === 'telegram'
                    ? 'Chat ID ou Telefone Telegram'
                    : 'Telefone / WhatsApp com DDD'} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={channel === 'telegram' ? 'Ex: 123456789' : 'Ex: 91985427427 ou (91) 98542-7427'}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              {/* Setor / Departamento */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Setor Responsável
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-500 appearance-none"
                  >
                    <option value="Suporte Técnico">Suporte Técnico</option>
                    <option value="Financeiro">Financeiro</option>
                    <option value="Comercial">Comercial</option>
                    <option value="Atendimento Geral">Atendimento Geral</option>
                  </select>
                </div>
              </div>

              {/* Atendente Atribuído */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Atendente Atribuído
                </label>
                <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-600 flex items-center justify-between">
                  <span>{currentUser?.name || 'Administrador'}</span>
                  <span className="text-[10px] text-blue-600 font-semibold uppercase bg-blue-50 px-1.5 py-0.5 rounded">
                    Ativo Imediato
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. CONTEÚDO DO ATENDIMENTO (CONDICIONAL POR CANAL) */}
          <div>
            {channel === 'whatsapp_official' ? (
              /* --- MODO API OFICIAL (TEMPLATES OBRIGATÓRIOS) --- */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-green-700" />
                    3. Seleção de Template Autorizado (Meta WhatsApp)
                  </label>
                  <span className="text-[11px] text-green-800 font-semibold bg-green-100 px-2 py-0.5 rounded-full">
                    Aprovado pela Meta
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Regra Oficial da Meta Cloud API:</strong> O primeiro contato com um cliente fora da janela de 24h
                    requer o disparo de um <em>Message Template</em> autorizado. Após o cliente responder no WhatsApp, a conversa
                    fica liberada para qualquer mensagem de texto livre!
                  </div>
                </div>

                {loadingTemplates ? (
                  <div className="p-6 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    Carregando templates autorizados da Meta...
                  </div>
                ) : (
                  <>
                    {/* Seletor do Template */}
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Escolha o Template Aprovado
                      </label>
                      <select
                        value={selectedTemplateName}
                        onChange={(e) => handleSelectTemplate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-green-600 font-medium"
                      >
                        {templates.map((t) => (
                          <option key={t.name} value={t.name}>
                            {t.name} - ({t.category} / {t.language})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Preenchimento das Variáveis / Parâmetros do Template */}
                    {selectedTemplate && selectedTemplate.paramLabels.length > 0 && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                        <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          Preencha as variáveis do template selecionado:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedTemplate.paramLabels.map((label, idx) => (
                            <div key={idx}>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                {`{{${idx + 1}}}`} - {label}
                              </label>
                              <input
                                type="text"
                                value={templateParams[idx] || ''}
                                onChange={(e) => handleParamChange(idx, e.target.value)}
                                placeholder={`Valor para {{${idx + 1}}}`}
                                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-green-600"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pré-visualização do Template renderizado */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center justify-between">
                        <span>Prévia de como o cliente receberá no WhatsApp:</span>
                        <span className="text-[11px] text-slate-400">Tempo real</span>
                      </label>
                      <div className="p-4 rounded-xl bg-[#e5ddd5] border border-slate-300 relative overflow-hidden">
                        <div className="max-w-md bg-white rounded-lg p-3 shadow-sm text-xs text-slate-800 space-y-2 border-l-4 border-emerald-500">
                          <div className="font-semibold text-emerald-800 text-[11px] flex items-center justify-between">
                            <span>SOL Telecomunicações</span>
                            <span className="text-[10px] text-slate-400">Agora</span>
                          </div>
                          <p className="whitespace-pre-line leading-relaxed text-slate-700">
                            {getRenderedPreview()}
                          </p>
                          <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            Mensagem Oficial Verificada
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* --- MODO LIVRE (EVOLUTION, TELEGRAM, MOBILE) --- */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    3. Mensagem Inicial para o Cliente (Texto Livre)
                  </label>
                  <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-100 px-2 py-0.5 rounded-full">
                    Sem restrição de templates
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Canal com autonomia total. Você pode digitar e enviar qualquer mensagem inicial que desejar!
                  </span>
                </div>

                <div>
                  <textarea
                    rows={4}
                    required
                    value={initialMessage}
                    onChange={(e) => setInitialMessage(e.target.value)}
                    placeholder={`Olá ${clientName ? clientName.split(' ')[0] : 'Cliente'}, tudo bem? Aqui é o atendente ${
                      currentUser?.name || 'da equipe SOL'
                    }. Estou entrando em contato para dar início ao seu atendimento sobre...`}
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                  />
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                    <span>Dica: Uma mensagem clara e cordial melhora a taxa de resposta do cliente.</span>
                    <span>{initialMessage.length} caracteres</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Rodapé com Ações */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/25 transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Disparando e Abrindo Atendimento...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Iniciar Atendimento e Abrir Chat
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

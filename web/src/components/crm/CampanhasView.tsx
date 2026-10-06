import React, { useState, useEffect } from 'react';
import {
  Plus,
  Users,
  Shield,
  Tag,
  Send,
  Smartphone,
  CheckCircle2,
  X,
  MessageSquare,
  Eye,
  Settings,
  RefreshCw,
  Loader2,
  Network,
  Layers,
} from 'lucide-react';
import type { UserRole, AuthUser, Campaign, DeviceRegistration, RBXCustomerGroup, NetworkOlt } from '../../types/crm';
import { isSameDepartment } from '../../utils/rbac';
import { api } from '../../services/api';

interface CampanhasViewProps {
  userRole?: UserRole;
  currentUser?: AuthUser | null;
}

export const CampanhasView: React.FC<CampanhasViewProps> = ({ userRole, currentUser }) => {
  const isGestor = userRole === 'gestor';
  const gestorDept = currentUser?.department || 'Suporte Técnico';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [devices, setDevices] = useState<DeviceRegistration[]>([]);
  const [rbxGroups, setRbxGroups] = useState<RBXCustomerGroup[]>([]);
  const [networkTree, setNetworkTree] = useState<NetworkOlt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCamp, setSelectedCamp] = useState<Campaign | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);
  const [cpfsInput, setCpfsInput] = useState('');

  // Carrega campanhas, dispositivos cadastrados, grupos do RBX e topologia de rede
  const loadData = async () => {
    setLoading(true);
    try {
      const [camps, devs, groups, netTree] = await Promise.all([
        api.listCampaigns().catch(() => []),
        api.listDevices().catch(() => []),
        api.getRbxGroups().catch(() => []),
        api.getNetworkTree().catch(() => []),
      ]);
      setCampaigns(camps);
      setDevices(devs);
      setRbxGroups(groups);
      setNetworkTree(netTree);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const visibleCampaigns = campaigns.filter((c) => {
    if (isGestor && gestorDept) {
      return isSameDepartment(c.department, gestorDept);
    }
    return true;
  });

  const handleOpenConfigure = (camp: Campaign) => {
    const rbxGroupsInitial =
      camp.targetRbxGroups && camp.targetRbxGroups.length > 0
        ? camp.targetRbxGroups
        : camp.targetRbxGroup
        ? [camp.targetRbxGroup]
        : [];

    const rbxGroupNamesInitial =
      camp.targetRbxGroupNames && camp.targetRbxGroupNames.length > 0
        ? camp.targetRbxGroupNames
        : camp.targetRbxGroupName
        ? [camp.targetRbxGroupName]
        : [];

    setSelectedCamp({
      ...camp,
      targetOlt: camp.targetOlt || (camp.targetOlts ? camp.targetOlts.join(', ') : ''),
      targetPon: camp.targetPon || (camp.targetPons ? camp.targetPons.join(', ') : ''),
      targetCto: camp.targetCto || (camp.targetCtos ? camp.targetCtos.join(', ') : ''),
      targetRbxGroup: camp.targetRbxGroup || (rbxGroupsInitial[0] || ''),
      targetRbxGroupName: camp.targetRbxGroupName || (rbxGroupNamesInitial[0] || ''),
      targetRbxGroups: rbxGroupsInitial,
      targetRbxGroupNames: rbxGroupNamesInitial,
    });
    setCpfsInput((camp.targetCpfs || []).join('\n'));
    setIsNew(false);
    setIsEditing(true);
    setDispatchSuccess(null);
  };

  const handleOpenNew = () => {
    const newCamp: Campaign = {
      id: '',
      title: '',
      message: '',
      department: isGestor ? gestorDept : 'Suporte Técnico',
      targetType: 'specific',
      targetCpfs: [],
      targetOlt: '',
      targetPon: '',
      targetCto: '',
      targetOlts: [],
      targetPons: [],
      targetCtos: [],
      targetRbxGroup: '',
      targetRbxGroupName: '',
      targetRbxGroups: [],
      targetRbxGroupNames: [],
      target: 'Clientes específicos para teste',
      actionType: 'chat_and_view',
      chatInitialMsg: 'Olá! Recebi a notificação e gostaria de falar com um atendente.',
      status: 'rascunho',
      sentCount: 0,
      deliveredRate: '100%',
      createdAt: new Date().toISOString(),
    };
    setSelectedCamp(newCamp);
    setCpfsInput('');
    setIsNew(true);
    setIsEditing(true);
    setDispatchSuccess(null);
  };

  const toggleGroup = (code: string, name: string) => {
    if (!selectedCamp) return;
    const currentCodes = selectedCamp.targetRbxGroups || [];
    const isSelected = currentCodes.includes(code);

    const updatedCodes = isSelected
      ? currentCodes.filter((c) => c !== code)
      : [...currentCodes, code];

    const currentNames = selectedCamp.targetRbxGroupNames || [];
    const updatedNames = isSelected
      ? currentNames.filter((n) => n !== name)
      : [...currentNames, name];

    setSelectedCamp({
      ...selectedCamp,
      targetRbxGroups: updatedCodes,
      targetRbxGroupNames: updatedNames,
      targetRbxGroup: updatedCodes[0] || '',
      targetRbxGroupName: updatedNames[0] || '',
    });
  };

  const handleSelectAllGroups = () => {
    if (!selectedCamp) return;
    const allCodes = rbxGroups.map((g) => g.codigo);
    const allNames = rbxGroups.map((g) => g.nome);
    setSelectedCamp({
      ...selectedCamp,
      targetRbxGroups: allCodes,
      targetRbxGroupNames: allNames,
      targetRbxGroup: allCodes[0] || '',
      targetRbxGroupName: allNames[0] || '',
    });
  };

  const handleClearAllGroups = () => {
    if (!selectedCamp) return;
    setSelectedCamp({
      ...selectedCamp,
      targetRbxGroups: [],
      targetRbxGroupNames: [],
      targetRbxGroup: '',
      targetRbxGroupName: '',
    });
  };

  const toggleItemInCsv = (field: 'targetOlt' | 'targetPon' | 'targetCto', item: string) => {
    if (!selectedCamp) return;
    const currentList = (selectedCamp[field] || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const exists = currentList.includes(item.toUpperCase());
    const updatedList = exists
      ? currentList.filter((s) => s !== item.toUpperCase())
      : [...currentList, item.toUpperCase()];
    setSelectedCamp({
      ...selectedCamp,
      [field]: updatedList.join(', '),
    });
  };

  const handleSave = async () => {
    if (!selectedCamp) return;
    if (!selectedCamp.title.trim()) {
      alert('Informe o título da campanha.');
      return;
    }
    if (!selectedCamp.message.trim()) {
      alert('Informe o texto da mensagem do comunicado.');
      return;
    }

    // Processa CPFs se for segmentado
    const cpfs = cpfsInput
      .split(/[\n,;]+/)
      .map((c) => c.replace(/\D/g, '').trim())
      .filter((c) => c.length >= 11);

    // Separa OLTs, PONs e CTOs digitadas (suporte a 1 ou múltiplas)
    const olts = (selectedCamp.targetOlt || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const pons = (selectedCamp.targetPon || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const ctos = (selectedCamp.targetCto || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    // Grupos do RBX selecionados
    const selectedGroupCodes = selectedCamp.targetRbxGroups || [];
    const groupNames = selectedGroupCodes.map((code) => {
      const found = rbxGroups.find((g) => g.codigo === code);
      return found ? found.nome : code;
    });

    // Processa descrição amigável do público
    let targetDescription = 'Público específico';
    if (selectedCamp.targetType === 'all') {
      targetDescription = `Todos os clientes com o app (${devices.length} aparelhos)`;
    } else if (selectedCamp.targetType === 'specific') {
      targetDescription =
        cpfs.length > 0
          ? `${cpfs.length} cliente(s) selecionado(s) por CPF/CNPJ`
          : 'Público específico';
    } else if (selectedCamp.targetType === 'network') {
      const parts = [];
      if (olts.length > 0) parts.push(`OLT: ${olts.join(', ')}`);
      if (pons.length > 0) parts.push(`PON: ${pons.join(', ')}`);
      if (ctos.length > 0) parts.push(`CTO: ${ctos.join(', ')}`);
      targetDescription = parts.length > 0 ? `Rede FTTH (${parts.join(' • ')})` : 'Infraestrutura de Rede';
    } else if (selectedCamp.targetType === 'rbx_group') {
      if (groupNames.length === 1) {
        targetDescription = `Grupo RBX: ${groupNames[0]}`;
      } else if (groupNames.length > 1) {
        targetDescription = `${groupNames.length} Grupos RBX (${groupNames.slice(0, 3).join(', ')}${groupNames.length > 3 ? '...' : ''})`;
      } else {
        targetDescription = 'Nenhum grupo RBX selecionado';
      }
    }

    const updated: Campaign = {
      ...selectedCamp,
      targetCpfs: cpfs,
      targetOlt: olts.join(', '),
      targetPon: pons.join(', '),
      targetCto: ctos.join(', '),
      targetOlts: olts,
      targetPons: pons,
      targetCtos: ctos,
      targetRbxGroup: selectedGroupCodes[0] || '',
      targetRbxGroupName: groupNames[0] || '',
      targetRbxGroups: selectedGroupCodes,
      targetRbxGroupNames: groupNames,
      target: targetDescription,
    };

    try {
      const saved = await api.saveCampaign(updated);
      setSelectedCamp(saved);
      setIsNew(false);
      await loadData();
      alert('Campanha salva com sucesso!');
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar campanha.');
    }
  };

  const handleDispatch = async () => {
    if (!selectedCamp) return;
    if (
      !window.confirm(
        `Confirma o DISPARO EM MASSA da campanha "${selectedCamp.title}" para os clientes do público-alvo?`
      )
    ) {
      return;
    }

    setIsDispatching(true);
    setDispatchSuccess(null);
    try {
      // Salva antes se estiver com alterações
      await handleSave();
      const res = await api.dispatchCampaign(selectedCamp.id);
      setDispatchSuccess(res.message);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao disparar campanha.');
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Campanhas & Disparos em Massa
            </h1>
            <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wide">
              App Mobile
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure comunicados massivos de rede, ofertas e avisos de cobrança enviados diretamente para o app do cliente.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition-colors"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenNew}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Campanha</span>
          </button>
        </div>
      </div>

      {/* Banner de Dispositivos Conectados ao App */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800">
              Dispositivos Vinculados a CPFs no Aplicativo
            </h4>
            <p className="text-[11px] text-slate-500">
              O aplicativo registra automaticamente o ID do aparelho vinculado ao CPF consultado pelo cliente.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs shrink-0 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200/60">
          <div>
            <span className="text-[10px] text-slate-400 block font-semibold">Total de Aparelhos</span>
            <span className="font-bold text-blue-600 text-sm">{devices.length}</span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div>
            <span className="text-[10px] text-slate-400 block font-semibold">Android</span>
            <span className="font-semibold text-slate-700">
              {devices.filter((d) => d.platform === 'android').length}
            </span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div>
            <span className="text-[10px] text-slate-400 block font-semibold">iOS</span>
            <span className="font-semibold text-slate-700">
              {devices.filter((d) => d.platform === 'ios').length}
            </span>
          </div>
        </div>
      </div>

      {isGestor && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs text-blue-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Visão de Gestor de Equipe:</strong> Exibindo apenas disparos associados ao seu setor (<strong>{gestorDept}</strong>).
            </span>
          </div>
        </div>
      )}

      {/* Grid de Cards de Campanhas (Clicáveis!) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleCampaigns.map((camp) => (
          <div
            key={camp.id}
            onClick={() => handleOpenConfigure(camp)}
            className="group bg-white p-5 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer space-y-3 relative active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold flex items-center gap-1">
                    <Tag className="w-3 h-3 text-slate-400" />
                    {camp.department}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {camp.actionType === 'chat_and_view' ? '💬 Permite Chat' : '👀 Informativo'}
                  </span>
                </div>
                <h3 className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors truncate">
                  {camp.title}
                </h3>
                <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                  <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{camp.target}</span>
                </span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  camp.status === 'ativa'
                    ? 'bg-blue-100 text-blue-700'
                    : camp.status === 'concluida'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {camp.status === 'ativa' ? 'Ativa' : camp.status === 'concluida' ? 'Concluída' : 'Rascunho'}
              </span>
            </div>

            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
              {camp.message}
            </p>

            <div className="p-3 bg-slate-50 rounded-lg grid grid-cols-3 gap-2 text-xs border border-slate-100">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold">Enviadas</span>
                <span className="font-bold text-slate-800">{camp.sentCount}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold">Entrega</span>
                <span className="font-bold text-emerald-600">{camp.deliveredRate}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold">Público</span>
                <span className="text-slate-600 font-medium truncate block">
                  {camp.targetType === 'all'
                    ? 'Geral'
                    : camp.targetType === 'network'
                    ? 'Rede FTTH'
                    : camp.targetType === 'rbx_group'
                    ? camp.targetRbxGroups && camp.targetRbxGroups.length > 1
                      ? `${camp.targetRbxGroups.length} Grupos RBX`
                      : `RBX: ${camp.targetRbxGroupName || camp.targetRbxGroup || 'Grupo'}`
                    : 'Segmentado'}
                </span>
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between text-xs text-blue-600 font-semibold group-hover:underline">
              <span>Configurar & Disparar</span>
              <Settings className="w-3.5 h-3.5 text-blue-500" />
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Configuração e Disparo de Campanha */}
      {isEditing && selectedCamp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-600" />
                  <span>{isNew ? 'Criar Nova Campanha' : 'Configuração & Disparo da Campanha'}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure o conteúdo do comunicado e os clientes-alvo que receberão a notificação no celular.
                </p>
              </div>
              <button
                onClick={() => setIsEditing(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {dispatchSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold">{dispatchSuccess}</span>
                </div>
              )}

              {/* Título & Departamento */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Título da Notificação *
                  </label>
                  <input
                    type="text"
                    value={selectedCamp.title}
                    onChange={(e) =>
                      setSelectedCamp({ ...selectedCamp, title: e.target.value })
                    }
                    placeholder="Ex: Aviso de Manutenção Preventiva"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Departamento Responsável
                  </label>
                  <select
                    value={selectedCamp.department}
                    onChange={(e) =>
                      setSelectedCamp({ ...selectedCamp, department: e.target.value })
                    }
                    disabled={isGestor}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white disabled:opacity-60"
                  >
                    <option value="Suporte Técnico">Suporte Técnico</option>
                    <option value="Financeiro">Financeiro</option>
                    <option value="Comercial">Comercial</option>
                    <option value="Atendimento Geral">Atendimento Geral</option>
                  </select>
                </div>
              </div>

              {/* Mensagem / Comunicado */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Texto do Comunicado / Mensagem *
                </label>
                <textarea
                  rows={4}
                  value={selectedCamp.message}
                  onChange={(e) =>
                    setSelectedCamp({ ...selectedCamp, message: e.target.value })
                  }
                  placeholder="Digite a mensagem completa que será exibida para o cliente no aplicativo..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white resize-none"
                />
              </div>

              {/* Tipo de Ação ao Clicar na Notificação */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <label className="text-xs font-bold text-slate-800 block">
                  Ação ao Receber a Notificação no Celular:
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      selectedCamp.actionType === 'chat_and_view'
                        ? 'bg-blue-50/70 border-blue-400 text-blue-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionType"
                      checked={selectedCamp.actionType === 'chat_and_view'}
                      onChange={() =>
                        setSelectedCamp({ ...selectedCamp, actionType: 'chat_and_view' })
                      }
                      className="mt-0.5 text-blue-600"
                    />
                    <div>
                      <span className="font-bold text-xs block flex items-center gap-1">
                        <MessageSquare className="w-3 h-3 text-blue-600" />
                        Permitir Iniciar Atendimento
                      </span>
                      <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                        O cliente pode clicar em "Iniciar Atendimento" para falar diretamente com o operador sobre o assunto.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      selectedCamp.actionType === 'view_only'
                        ? 'bg-blue-50/70 border-blue-400 text-blue-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionType"
                      checked={selectedCamp.actionType === 'view_only'}
                      onChange={() =>
                        setSelectedCamp({ ...selectedCamp, actionType: 'view_only' })
                      }
                      className="mt-0.5 text-blue-600"
                    />
                    <div>
                      <span className="font-bold text-xs block flex items-center gap-1">
                        <Eye className="w-3 h-3 text-slate-500" />
                        Apenas Informativo
                      </span>
                      <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                        O cliente apenas lê o comunicado e clica em "Entendido / Fechar".
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Segmentação do Público-Alvo (Target) */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    Definição do Público-Alvo (Clientes Alvos):
                  </label>
                  <span className="text-[10px] text-slate-500">
                    {devices.length} aparelhos registrados
                  </span>
                </div>

                <div className="space-y-2">
                  <label
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs ${
                      selectedCamp.targetType === 'specific'
                        ? 'bg-blue-50 border-blue-300 font-bold text-blue-800'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="targetType"
                      checked={selectedCamp.targetType === 'specific'}
                      onChange={() =>
                        setSelectedCamp({ ...selectedCamp, targetType: 'specific' })
                      }
                      className="text-blue-600"
                    />
                    <span>Por CPF/CNPJ específico (Recomendado para primeira leva de testes)</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs ${
                      selectedCamp.targetType === 'network'
                        ? 'bg-blue-50 border-blue-300 font-bold text-blue-800'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="targetType"
                      checked={selectedCamp.targetType === 'network'}
                      onChange={() =>
                        setSelectedCamp({ ...selectedCamp, targetType: 'network' })
                      }
                      className="text-blue-600"
                    />
                    <span className="flex items-center gap-1.5">
                      <Network className="w-3.5 h-3.5 text-blue-600" />
                      Por Infraestrutura de Rede FTTH (OLT / PON / CTO)
                    </span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs ${
                      selectedCamp.targetType === 'rbx_group'
                        ? 'bg-blue-50 border-blue-300 font-bold text-blue-800'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="targetType"
                      checked={selectedCamp.targetType === 'rbx_group'}
                      onChange={() =>
                        setSelectedCamp({ ...selectedCamp, targetType: 'rbx_group' })
                      }
                      className="text-blue-600"
                    />
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      Por Grupo de Clientes do ERP RBXSoft
                    </span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs ${
                      selectedCamp.targetType === 'all'
                        ? 'bg-blue-50 border-blue-300 font-bold text-blue-800'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="targetType"
                      checked={selectedCamp.targetType === 'all'}
                      onChange={() =>
                        setSelectedCamp({ ...selectedCamp, targetType: 'all' })
                      }
                      className="text-blue-600"
                    />
                    <span>Todos os clientes com o aplicativo instalado ({devices.length} aparelhos)</span>
                  </label>
                </div>

                {/* Sub-configuração: CPFs Específicos */}
                {selectedCamp.targetType === 'specific' && (
                  <div className="pt-2 space-y-1.5 border-t border-slate-200">
                    <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>CPFs/CNPJs Alvos (separados por vírgula ou um por linha):</span>
                      <span className="text-[10px] text-blue-600 font-mono">
                        {
                          cpfsInput
                            .split(/[\n,;]+/)
                            .filter((c) => c.replace(/\D/g, '').length >= 11).length
                        }{' '}
                        CPF(s) informado(s)
                      </span>
                    </label>
                    <textarea
                      rows={3}
                      value={cpfsInput}
                      onChange={(e) => setCpfsInput(e.target.value)}
                      placeholder="Ex: 123.456.789-00, 987.654.321-99 ou um CPF por linha..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 resize-none"
                    />
                    <p className="text-[10px] text-slate-400">
                      💡 Quando o cliente com o CPF informado estiver com o app aberto ou entrar no app, o comunicado será entregue instantaneamente.
                    </p>
                  </div>
                )}

                {/* Sub-configuração: Infraestrutura de Rede FTTH (1 ou mais OLTs, PONs e CTOs) */}
                {selectedCamp.targetType === 'network' && (
                  <div className="pt-2 space-y-2.5 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Network className="w-4 h-4 text-blue-600" />
                        <span>Filtro por Equipamentos FTTH (1 ou mais permitidos)</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">
                        Separe por vírgula para múltiplos
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Informe uma ou mais OLTs, PONs ou CTOs separadas por vírgula. Os clientes com equipamentos em qualquer uma das OLTs/CTOs informadas receberão o comunicado.
                    </p>

                    {/* Extração e visualização dos elementos cadastrados na topologia */}
                    {(() => {
                      const registeredOlts = networkTree.map((o) => o.name);
                      const currentSelectedOlts = (selectedCamp.targetOlt || '')
                        .split(/[\n,;]+/)
                        .map((s) => s.trim().toUpperCase())
                        .filter(Boolean);

                      // Filtra PONs das OLTs selecionadas ou de todas se nenhuma estiver selecionada
                      const relevantOlts = currentSelectedOlts.length > 0
                        ? networkTree.filter((o) => currentSelectedOlts.includes(o.name.toUpperCase()))
                        : networkTree;

                      const registeredPons = Array.from(
                        new Set(
                          relevantOlts.flatMap((o) => (o.slots || []).flatMap((s) => (s.pons || []).map((p) => p.name)))
                        )
                      );

                      const currentSelectedPons = (selectedCamp.targetPon || '')
                        .split(/[\n,;]+/)
                        .map((s) => s.trim().toUpperCase())
                        .filter(Boolean);

                      // Filtra CTOs das PONs selecionadas ou de todas as PONs relevantes
                      const allRelevantPons = relevantOlts.flatMap((o) => (o.slots || []).flatMap((s) => s.pons || []));
                      const relevantPonsForCtos = currentSelectedPons.length > 0
                        ? allRelevantPons.filter((p) => currentSelectedPons.includes(p.name.toUpperCase()))
                        : allRelevantPons;

                      const registeredCtos = Array.from(
                        new Set(
                          relevantPonsForCtos.flatMap((p) => (p.ctos || []).map((c) => c.name))
                        )
                      );

                      const currentSelectedCtos = (selectedCamp.targetCto || '')
                        .split(/[\n,;]+/)
                        .map((s) => s.trim().toUpperCase())
                        .filter(Boolean);

                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          {/* Coluna OLT */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-slate-600 uppercase block">
                              OLTs (1 ou mais)
                            </label>
                            <input
                              type="text"
                              value={selectedCamp.targetOlt || ''}
                              onChange={(e) =>
                                setSelectedCamp({ ...selectedCamp, targetOlt: e.target.value.toUpperCase() })
                              }
                              placeholder="Ex: OLT-01, OLT-02"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono uppercase text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                            {registeredOlts.length > 0 && (
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-1">
                                {registeredOlts.map((oltName) => {
                                  const isSelected = currentSelectedOlts.includes(oltName.toUpperCase());
                                  return (
                                    <button
                                      key={oltName}
                                      type="button"
                                      onClick={() => toggleItemInCsv('targetOlt', oltName)}
                                      className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                                        isSelected
                                          ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-xs'
                                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                                      }`}
                                    >
                                      {isSelected ? '✓ ' : '+ '}
                                      {oltName}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Coluna PON */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-slate-600 uppercase block">
                              PONs (1 ou mais)
                            </label>
                            <input
                              type="text"
                              value={selectedCamp.targetPon || ''}
                              onChange={(e) =>
                                setSelectedCamp({ ...selectedCamp, targetPon: e.target.value.toUpperCase() })
                              }
                              placeholder="Ex: 1/1, 1/2"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono uppercase text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                            {registeredPons.length > 0 && (
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-1">
                                {registeredPons.map((ponName) => {
                                  const isSelected = currentSelectedPons.includes(ponName.toUpperCase());
                                  return (
                                    <button
                                      key={ponName}
                                      type="button"
                                      onClick={() => toggleItemInCsv('targetPon', ponName)}
                                      className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                                        isSelected
                                          ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-xs'
                                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                                      }`}
                                    >
                                      {isSelected ? '✓ ' : '+ '}
                                      {ponName}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Coluna CTO */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-slate-600 uppercase block">
                              CTOs (1 ou mais)
                            </label>
                            <input
                              type="text"
                              value={selectedCamp.targetCto || ''}
                              onChange={(e) =>
                                setSelectedCamp({ ...selectedCamp, targetCto: e.target.value.toUpperCase() })
                              }
                              placeholder="Ex: CTO-14, CTO-15"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono uppercase text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                            {registeredCtos.length > 0 && (
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-1">
                                {registeredCtos.map((ctoName) => {
                                  const isSelected = currentSelectedCtos.includes(ctoName.toUpperCase());
                                  return (
                                    <button
                                      key={ctoName}
                                      type="button"
                                      onClick={() => toggleItemInCsv('targetCto', ctoName)}
                                      className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                                        isSelected
                                          ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-xs'
                                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                                      }`}
                                    >
                                      {isSelected ? '✓ ' : '+ '}
                                      {ctoName}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <p className="text-[10px] text-slate-400">
                      💡 Mapeado a partir dos atendimentos gravados pelos operadores ou cadastros dos aparelhos.
                    </p>
                  </div>
                )}

                {/* Sub-configuração: Grupos de Clientes do RBX (Multi-seleção com Checkboxes) */}
                {selectedCamp.targetType === 'rbx_group' && (
                  <div className="pt-2 space-y-2.5 border-t border-slate-200">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Layers className="w-4 h-4 text-blue-600" />
                        <span>Selecione 1 ou Mais Grupos do RBX:</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                          {(selectedCamp.targetRbxGroups || []).length} de {rbxGroups.length} selecionado(s)
                        </span>
                        <button
                          type="button"
                          onClick={handleSelectAllGroups}
                          className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-semibold cursor-pointer"
                        >
                          Marcar Todos
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={handleClearAllGroups}
                          className="text-[11px] text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>

                    <div className="max-h-52 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 bg-white rounded-xl border border-slate-200 shadow-inner">
                      {rbxGroups.map((g) => {
                        const isChecked = (selectedCamp.targetRbxGroups || []).includes(g.codigo);
                        return (
                          <label
                            key={g.codigo}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-xs select-none ${
                              isChecked
                                ? 'bg-blue-50/90 border-blue-400 text-blue-900 font-bold shadow-2xs'
                                : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleGroup(g.codigo, g.nome)}
                              className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                            />
                            <span className="truncate flex-1">{g.nome}</span>
                            <span className="text-[9px] text-slate-400 font-mono">#{g.codigo}</span>
                          </label>
                        );
                      })}
                    </div>

                    <p className="text-[10px] text-slate-400">
                      💡 O backend buscará todos os clientes cadastrados em cada um dos grupos selecionados no RBX e disparará a notificação para todos os seus celulares vinculados.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Salvar Alterações
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleDispatch}
                  disabled={isDispatching}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  {isDispatching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Disparando Comunicado...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Disparar Notificação Agora</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  Calendar,
  User,
  Layers,
  Star,
  Eye,
  RefreshCw,
  Download,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Printer,
  Users,
  Copy,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { api } from '../../services/api';
import type {
  UserRole,
  AuthUser,
  ConversationItem,
  ConversationFullResponse,
  RBXCustomerGroup,
} from '../../types/crm';

interface ConsultaAtendimentosViewProps {
  userRole?: UserRole;
  currentUser?: AuthUser | null;
}

export const ConsultaAtendimentosView: React.FC<ConsultaAtendimentosViewProps> = ({
  userRole,
  currentUser,
}) => {
  const isGestor = userRole === 'gestor';
  const gestorDept = currentUser?.department || '';

  // Filtros de busca
  const [searchTerm, setSearchTerm] = useState('');
  const [department, setDepartment] = useState(isGestor && gestorDept ? gestorDept : '');
  const [operatorId, setOperatorId] = useState('');
  const [rbxGroup, setRbxGroup] = useState('');
  const [status, setStatus] = useState<string>('');
  const [rating, setRating] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Paginação e dados
  const [limit] = useState(15);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Listas para dropdowns de filtros
  const [operatorsList, setOperatorsList] = useState<AuthUser[]>([]);
  const [rbxGroupsList, setRbxGroupsList] = useState<RBXCustomerGroup[]>([]);

  // Modal de espelho de conversa
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [fullData, setFullData] = useState<ConversationFullResponse | null>(null);
  const [isLoadingModal, setIsLoadingModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Carrega lista de operadores e grupos RBX ao montar
  useEffect(() => {
    (async () => {
      try {
        const users = await api.listUsers();
        setOperatorsList(users);
      } catch (e) {
        console.warn('Erro ao carregar lista de atendentes:', e);
      }

      try {
        const groups = await api.getRbxGroups();
        if (Array.isArray(groups)) {
          setRbxGroupsList(groups);
        }
      } catch (e) {
        console.warn('Erro ao carregar grupos RBX:', e);
      }
    })();
  }, []);

  // Executa busca no backend Go
  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const activeDept = isGestor && gestorDept ? gestorDept : department;
      const resp = await api.searchConversations({
        search: searchTerm.trim() || undefined,
        department: activeDept || undefined,
        operatorId: operatorId || undefined,
        rbxGroup: rbxGroup || undefined,
        status: status || undefined,
        rating: rating ? parseInt(rating, 10) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit,
        offset,
      });

      setConversations(resp.conversations || []);
      setTotal(resp.total || 0);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao buscar atendimentos.');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, department, operatorId, rbxGroup, status, rating, startDate, endDate, limit, offset, isGestor, gestorDept]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Abertura do modal de espelho da conversa
  const handleOpenConversationModal = async (convId: string) => {
    setSelectedConversationId(convId);
    setIsLoadingModal(true);
    try {
      const data = await api.getConversationFull(convId);
      setFullData(data);
    } catch (err) {
      console.warn('Erro ao carregar conversa completa:', err);
    } finally {
      setIsLoadingModal(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedConversationId(null);
    setFullData(null);
  };

  const handleCopyProtocol = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    if (!isGestor) setDepartment('');
    setOperatorId('');
    setRbxGroup('');
    setStatus('');
    setRating('');
    setStartDate('');
    setEndDate('');
    setOffset(0);
  };

  // Formatação de segundos para exibição amigável
  const formatDuration = (startStr?: string, endStr?: string): string => {
    if (!startStr || !endStr) return '-';
    const s = new Date(startStr).getTime();
    const e = new Date(endStr).getTime();
    if (isNaN(s) || isNaN(e) || e < s) return '-';
    const diffSec = Math.floor((e - s) / 1000);
    if (diffSec < 60) return `${diffSec}s`;
    const min = Math.floor(diffSec / 60);
    const sec = diffSec % 60;
    if (min < 60) return `${min}m ${sec}s`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hr}h ${remMin}m`;
  };

  const formatWaitTime = (createdStr?: string, assignedStr?: string): string => {
    if (!createdStr || !assignedStr) return '-';
    return formatDuration(createdStr, assignedStr);
  };

  // Exportar dados como CSV
  const handleExportCsv = () => {
    if (!conversations.length) {
      alert('Nenhum atendimento para exportar na listagem atual.');
      return;
    }

    const headers = [
      'Protocolo',
      'Cliente',
      'CPF/CNPJ',
      'Contato',
      'Setor',
      'Atendente',
      'Status',
      'CriadoEm',
      'AtendidoEm',
      'FinalizadoEm',
      'TME',
      'TMA',
      'Avaliacao',
      'Comentario',
      'GrupoRBX',
      'CTO',
    ];

    const rows = conversations.map((c) => [
      c.id,
      `"${c.clientName || ''}"`,
      `"${c.cpfCnpj || ''}"`,
      `"${c.contactName || ''}"`,
      `"${c.department || ''}"`,
      `"${c.operator?.name || 'Não atribuído'}"`,
      c.status,
      c.createdAt || '',
      c.assignedAt || '',
      c.closedAt || '',
      formatWaitTime(c.createdAt, c.assignedAt),
      formatDuration(c.assignedAt, c.closedAt),
      c.rating ? `${c.rating} Estrelas` : 'Sem nota',
      `"${(c.ratingComment || '').replace(/"/g, '""')}"`,
      `"${c.rbxGroup || ''}"`,
      `"${c.cto || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `consulta_atendimentos_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/70 p-4 md:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <Search className="w-5 h-5" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
              Consulta de Atendimentos Realizados
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Localize e audite qualquer atendimento realizado com histórico completo de mensagens, TMA, TME e notas de avaliação.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchConversations()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-2xs transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {isGestor && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs text-blue-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Filtro de Gestor de Setor:</strong> Exibindo exclusivamente atendimentos do seu departamento (<strong>{gestorDept}</strong>).
            </span>
          </div>
        </div>
      )}

      {/* Caixa de Filtros Avançados */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-700 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-blue-600" />
            <span>Filtros de Pesquisa & Auditoria</span>
          </div>
          <button
            onClick={handleClearFilters}
            className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
          >
            Limpar filtros
          </button>
        </div>

        {/* Grid de Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Termo Livre / Busca */}
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Termo Livre / Cliente / CPF / Protocolo
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Ex: Nome, CPF, 46234390200, conv-179..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchConversations()}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50"
              />
            </div>
          </div>

          {/* Setor / Departamento */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Setor / Departamento
            </label>
            <div className="relative">
              <Layers className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <select
                value={department}
                disabled={isGestor}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 text-slate-700"
              >
                <option value="">Todos os Setores</option>
                <option value="Suporte Técnico">Suporte Técnico</option>
                <option value="Financeiro">Financeiro</option>
                <option value="Comercial">Comercial</option>
                <option value="Atendimento Geral">Atendimento Geral</option>
              </select>
            </div>
          </div>

          {/* Atendente / Operador */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Atendente
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <select
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 text-slate-700"
              >
                <option value="">Todos os Atendentes</option>
                {operatorsList.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name} ({op.department || 'Geral'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grupo de Clientes (RBX) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Grupo de Clientes (RBX)
            </label>
            <div className="relative">
              <Users className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <select
                value={rbxGroup}
                onChange={(e) => setRbxGroup(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 text-slate-700"
              >
                <option value="">Todos os Grupos RBX</option>
                {rbxGroupsList.map((g) => (
                  <option key={g.codigo} value={g.nome}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status do Atendimento */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Status do Atendimento
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 text-slate-700"
            >
              <option value="">Todos os Status</option>
              <option value="closed">Finalizado (Encerrado)</option>
              <option value="active">Em Atendimento (Ativo)</option>
              <option value="waiting">Em Espera (Fila)</option>
            </select>
          </div>

          {/* Avaliação do Cliente (1 a 5 ⭐) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Avaliação do Cliente
            </label>
            <div className="relative">
              <Star className="w-4 h-4 text-amber-500 absolute left-3 top-2.5" />
              <select
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 text-slate-700"
              >
                <option value="">Todas as Avaliações</option>
                <option value="5">⭐⭐⭐⭐⭐ 5 Estrelas (Excelente)</option>
                <option value="4">⭐⭐⭐⭐ 4 Estrelas (Bom)</option>
                <option value="3">⭐⭐⭐ 3 Estrelas (Regular)</option>
                <option value="2">⭐⭐ 2 Estrelas (Ruim)</option>
                <option value="1">⭐ 1 Estrela (Muito Ruim)</option>
              </select>
            </div>
          </div>

          {/* Data Início */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Data Inicial
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 text-slate-700"
              />
            </div>
          </div>

          {/* Data Fim */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Data Final
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 text-slate-700"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={() => {
              setOffset(0);
              fetchConversations();
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Aplicar Filtros</span>
          </button>
        </div>
      </div>

      {/* Tabela de Resultados */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">
              Registros Encontrados
            </h3>
            <p className="text-xs text-slate-400">
              Total de <strong>{total}</strong> atendimento(s) correspondente(s) aos critérios de busca.
            </p>
          </div>

          {/* Paginação compacta */}
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>
              Página <strong>{Math.floor(offset / limit) + 1}</strong> de{' '}
              <strong>{Math.max(1, Math.ceil(total / limit))}</strong>
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={offset === 0 || isLoading}
                onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
                className="p-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={offset + limit >= total || isLoading}
                onClick={() => setOffset((prev) => prev + limit)}
                className="p-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-50 text-red-700 text-xs flex items-center gap-2 border-b border-red-100">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Protocolo / ID</th>
                <th className="py-3.5 px-4">Cliente / Contato</th>
                <th className="py-3.5 px-4">Setor</th>
                <th className="py-3.5 px-4">Atendente</th>
                <th className="py-3.5 px-4">Espera (TME)</th>
                <th className="py-3.5 px-4">Duração (TMA)</th>
                <th className="py-3.5 px-4">Avaliação CSAT</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                    <span>Carregando atendimentos do servidor...</span>
                  </td>
                </tr>
              ) : conversations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">Nenhum atendimento localizado</p>
                    <p className="text-xs text-slate-400 mt-1">Tente ajustar os filtros ou os termos de pesquisa.</p>
                  </td>
                </tr>
              ) : (
                conversations.map((c) => {
                  const tme = formatWaitTime(c.createdAt, c.assignedAt);
                  const tma = formatDuration(c.assignedAt, c.closedAt);

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Protocolo */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800">{c.id.slice(0, 15)}...</span>
                          <button
                            onClick={() => handleCopyProtocol(c.id)}
                            title={copiedId === c.id ? 'Copiado!' : 'Copiar ID completo'}
                            className="text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {copiedId === c.id && (
                            <span className="text-[10px] text-emerald-600 font-bold">Copiado!</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {c.createdAt ? new Date(c.createdAt).toLocaleString('pt-BR') : '-'}
                        </span>
                      </td>

                      {/* Cliente */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{c.clientName || 'Cliente'}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          {c.cpfCnpj && <span>CPF/CNPJ: {c.cpfCnpj}</span>}
                          {c.rbxGroup && (
                            <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 font-semibold rounded text-[10px]">
                              {c.rbxGroup}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Setor */}
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full font-semibold text-[11px] bg-slate-100 text-slate-700">
                          {c.department || 'Geral'}
                        </span>
                      </td>

                      {/* Atendente */}
                      <td className="py-3 px-4">
                        {c.operator ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center">
                              {c.operator.name.charAt(0)}
                            </div>
                            <span className="font-semibold text-slate-800">{c.operator.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Não atribuído</span>
                        )}
                      </td>

                      {/* TME */}
                      <td className="py-3 px-4 font-mono font-semibold text-slate-600">
                        {tme}
                      </td>

                      {/* TMA */}
                      <td className="py-3 px-4 font-mono font-semibold text-slate-600">
                        {c.status === 'closed' ? tma : <span className="text-blue-600 italic">Em andamento</span>}
                      </td>

                      {/* Avaliação CSAT */}
                      <td className="py-3 px-4">
                        {c.rating ? (
                          <div className="flex items-center gap-1 font-bold text-amber-500">
                            <span>{c.rating}</span>
                            <div className="flex">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`w-3 h-3 ${
                                    s <= (c.rating || 0)
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-slate-200'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Sem avaliação</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {c.status === 'closed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            Finalizado
                          </span>
                        )}
                        {c.status === 'active' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                            <Clock className="w-3 h-3" />
                            Em Andamento
                          </span>
                        )}
                        {c.status === 'waiting' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3" />
                            Fila
                          </span>
                        )}
                      </td>

                      {/* Ação */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenConversationModal(c.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold text-xs rounded-lg transition-colors border border-slate-200"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Espelho</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Espelho Completo da Conversa */}
      {selectedConversationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-lg">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    Espelho & Auditoria do Atendimento
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Protocolo: {selectedConversationId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-2 rounded-lg hover:bg-slate-200/60 text-slate-600 transition-colors"
                  title="Imprimir histórico"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCloseModal}
                  className="p-2 rounded-lg hover:bg-slate-200/60 text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {isLoadingModal ? (
                <div className="py-16 text-center text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-2" />
                  <p className="text-xs">Carregando histórico do atendimento...</p>
                </div>
              ) : fullData?.conversation ? (
                <>
                  {/* Resumo do Atendimento */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                    <div>
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">Cliente</span>
                      <strong className="text-slate-800 text-sm">{fullData.conversation.clientName}</strong>
                      {fullData.conversation.cpfCnpj && (
                        <span className="text-slate-500 block text-[11px]">CPF: {fullData.conversation.cpfCnpj}</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">Setor</span>
                      <strong className="text-slate-800 text-sm">{fullData.conversation.department}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">Atendente</span>
                      <strong className="text-slate-800 text-sm">
                        {fullData.conversation.operator?.name || 'Não atribuído'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">Status</span>
                      <span className="font-bold text-sm text-emerald-700 capitalize">
                        {fullData.conversation.status === 'closed' ? 'Finalizado' : fullData.conversation.status}
                      </span>
                    </div>
                  </div>

                  {/* Infraestrutura e RBX (Se houver) */}
                  {(fullData.conversation.olt || fullData.conversation.cto || fullData.conversation.rbxGroup) && (
                    <div className="p-3 bg-purple-50/60 border border-purple-200/70 rounded-xl text-xs flex flex-wrap items-center gap-4 text-purple-900">
                      {fullData.conversation.rbxGroup && (
                        <div>
                          <span className="text-purple-600 block text-[10px] uppercase font-bold">Grupo RBX</span>
                          <strong>{fullData.conversation.rbxGroup}</strong>
                        </div>
                      )}
                      {fullData.conversation.olt && (
                        <div>
                          <span className="text-purple-600 block text-[10px] uppercase font-bold">OLT</span>
                          <strong>{fullData.conversation.olt}</strong>
                        </div>
                      )}
                      {fullData.conversation.pon && (
                        <div>
                          <span className="text-purple-600 block text-[10px] uppercase font-bold">PON</span>
                          <strong>{fullData.conversation.pon}</strong>
                        </div>
                      )}
                      {fullData.conversation.cto && (
                        <div>
                          <span className="text-purple-600 block text-[10px] uppercase font-bold">CTO</span>
                          <strong>{fullData.conversation.cto}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Avaliação do Cliente (Se houver) */}
                  {fullData.conversation.rating ? (
                    <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-4 h-4 ${
                                  s <= (fullData.conversation.rating || 0)
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-200'
                                  }`}
                              />
                            ))}
                          </div>
                          <span className="font-bold text-amber-900 text-sm">
                            Nota {fullData.conversation.rating} de 5
                          </span>
                        </div>
                        {fullData.conversation.ratedAt && (
                          <span className="text-[11px] text-amber-700">
                            Avaliado em: {new Date(fullData.conversation.ratedAt).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>
                      {fullData.conversation.ratingComment ? (
                        <p className="text-xs text-amber-950 italic bg-white/70 p-2.5 rounded-lg border border-amber-100">
                          "{fullData.conversation.ratingComment}"
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-700 italic">Cliente avaliou sem comentário em texto.</p>
                      )}
                    </div>
                  ) : null}

                  {/* Histórico de Mensagens / Transcrição */}
                  <div className="space-y-3 pt-2">
                    <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                      <span>Transcrição Completa da Conversa</span>
                    </h4>

                    <div className="space-y-2.5 bg-slate-50/60 p-4 rounded-xl border border-slate-200/80 max-h-[380px] overflow-y-auto">
                      {fullData.messages && fullData.messages.length > 0 ? (
                        fullData.messages.map((m) => {
                          const isClient = m.senderType === 'client';
                          const isSystem = m.senderType === 'system';

                          if (isSystem) {
                            return (
                              <div key={m.id} className="text-center my-2">
                                <span className="inline-block px-3 py-1 bg-amber-100/80 text-amber-900 rounded-full text-[11px] font-semibold">
                                  {m.content}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={m.id}
                              className={`flex flex-col ${isClient ? 'items-end' : 'items-start'}`}
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] font-bold text-slate-500">
                                  {m.senderName || (isClient ? 'Cliente' : 'Atendente')}
                                </span>
                                <span className="text-[9px] text-slate-400">
                                  {m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>

                              <div
                                className={`px-3.5 py-2 rounded-2xl max-w-[80%] text-xs shadow-2xs ${
                                  isClient
                                    ? 'bg-blue-600 text-white rounded-tr-none'
                                    : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                                }`}
                              >
                                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-center text-xs text-slate-400 py-6">
                          Nenhuma mensagem registrada nesta conversa.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <AlertCircle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
                  <p>Não foi possível carregar os detalhes do atendimento.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50/80 flex justify-end">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

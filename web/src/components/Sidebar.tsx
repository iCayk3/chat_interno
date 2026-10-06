import React from 'react';
import type { Conversation, ConversationStatus } from '../types/chat';
import type { UserRole, AuthUser } from '../types/crm';
import { Search, Clock, CheckCircle2, MessageSquare, AlertCircle, RotateCcw } from 'lucide-react';

interface SidebarProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeTab: ConversationStatus;
  onTabChange: (tab: ConversationStatus) => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  isConnected: boolean;
  onResetAll?: () => void;
  userRole?: UserRole;
  currentUser?: AuthUser | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  selectedId,
  onSelect,
  activeTab,
  onTabChange,
  searchTerm,
  onSearchChange,
  isConnected,
  onResetAll,
  userRole,
  currentUser,
}) => {
  const waitingCount = conversations.filter(c => c.status === 'waiting').length;
  const activeCount = conversations.filter(c => c.status === 'active').length;
  const closedCount = conversations.filter(c => c.status === 'closed').length;

  const filtered = conversations.filter(c => {
    const matchesTab = c.status === activeTab;
    const term = searchTerm.toLowerCase();
    const matchesSearch = c.clientName.toLowerCase().includes(term) ||
      (c.contactName && c.contactName.toLowerCase().includes(term)) ||
      (c.cpfCnpj && c.cpfCnpj.includes(term)) ||
      (c.id && c.id.toLowerCase().includes(term)) ||
      (c.department && c.department.toLowerCase().includes(term));
    return matchesTab && matchesSearch;
  });

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const displayName = currentUser?.name || 'Atendente SOL';
  const displayInitials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('') || 'AT';

  return (
    <aside className="w-80 h-full bg-white border-r border-slate-200 flex flex-col shrink-0 select-none">
      {/* Top Operator Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 font-bold text-xs shrink-0">
            {displayInitials}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 text-sm flex items-center gap-2 truncate">
              <span className="truncate">{displayName}</span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-rose-500 ring-2 ring-rose-100'}`} />
            </div>
            <div className="text-xs text-slate-500 truncate">
              {isConnected
                ? (currentUser?.role || userRole) === 'operador'
                  ? `Operador (${currentUser?.department || 'Meus Atendimentos'})`
                  : (currentUser?.role || userRole) === 'gestor'
                  ? `Gestor (${currentUser?.department || 'Visão da Equipe'})`
                  : 'Administrador (Acesso Total)'
                : 'Desconectado'}
            </div>
          </div>
        </div>

        {onResetAll && userRole !== 'operador' && (
          <button
            onClick={onResetAll}
            title="Limpar histórico e resetar todos os atendimentos do zero (Admin/Gestor)"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-slate-100">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por cliente ou depto..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-100/70 border border-transparent focus:border-blue-400 focus:bg-white rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
        <button
          onClick={() => onTabChange('waiting')}
          className={`flex-1 py-2.5 px-2 text-center flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
            activeTab === 'waiting'
              ? 'border-blue-600 text-blue-600 bg-white font-semibold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <span>Fila</span>
          {waitingCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-bold">
              {waitingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange('active')}
          className={`flex-1 py-2.5 px-2 text-center flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
            activeTab === 'active'
              ? 'border-blue-600 text-blue-600 bg-white font-semibold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <span>Ativos</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange('closed')}
          className={`flex-1 py-2.5 px-2 text-center flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
            activeTab === 'closed'
              ? 'border-blue-600 text-blue-600 bg-white font-semibold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <span>Finalizados</span>
          {closedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-slate-400 text-white text-[10px] font-bold">
              {closedCount}
            </span>
          )}
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <MessageSquare className="w-8 h-8 stroke-[1.5] text-slate-300" />
            <p>Nenhum atendimento nesta aba</p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = conv.id === selectedId;
            return (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`p-3.5 cursor-pointer transition-all flex flex-col gap-1.5 ${
                  isSelected
                    ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                    : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm text-slate-800 truncate max-w-[170px]">
                    {conv.contactName && conv.contactName !== conv.clientName ? conv.contactName : conv.clientName}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(conv.createdAt)}
                  </div>
                </div>

                {conv.contactName && conv.contactName !== conv.clientName && (
                  <div className="text-[11px] text-slate-500 truncate" title={`Titular: ${conv.clientName}`}>
                    Titular: <span className="font-medium text-slate-700">{conv.clientName}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px]">
                    {conv.department || 'Geral'}
                  </span>

                  {conv.status === 'waiting' && (
                    <span className="flex items-center gap-1 text-amber-600 font-medium text-[11px]">
                      <AlertCircle className="w-3 h-3" />
                      Aguardando
                    </span>
                  )}
                  {conv.status === 'active' && (
                    <span className="flex items-center gap-1 text-blue-600 font-medium text-[11px]">
                      <CheckCircle2 className="w-3 h-3" />
                      {conv.operator ? conv.operator.name : 'Ativo'}
                    </span>
                  )}
                  {conv.status === 'closed' && (
                    <span className="text-slate-400 text-[11px]">Finalizado</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

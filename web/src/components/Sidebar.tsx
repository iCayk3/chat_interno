import React from 'react';
import type { Conversation, ConversationStatus } from '../types/chat';
import type { UserRole, AuthUser } from '../types/crm';
import { Search, Clock, CheckCircle2, MessageSquare, AlertCircle, RotateCcw, Send, Smartphone, Globe, Radio, UserPlus, Star } from 'lucide-react';

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
  onOpenNewChat?: () => void;
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
  onOpenNewChat,
  userRole,
  currentUser,
}) => {
  const waitingCount = conversations.filter(c => c.status === 'waiting').length;
  const activeCount = conversations.filter(c => c.status === 'active').length;
  const closedCount = conversations.filter(c => c.status === 'closed' || c.status === 'waiting_rating').length;

  const filtered = conversations.filter(c => {
    const matchesTab = activeTab === 'closed'
      ? (c.status === 'closed' || c.status === 'waiting_rating')
      : c.status === activeTab;
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

  const renderChannelBadge = (channel?: string) => {
    switch (channel) {
      case 'telegram':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-semibold" title="Canal: Telegram Bot">
            <Send className="w-2.5 h-2.5" />
            <span>Telegram</span>
          </span>
        );
      case 'whatsapp_evolution':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold" title="Canal: WhatsApp (Evolution)">
            <MessageSquare className="w-2.5 h-2.5" />
            <span>WhatsApp</span>
          </span>
        );
      case 'whatsapp_official':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-900 text-[10px] font-semibold" title="Canal: WhatsApp Oficial Meta">
            <Radio className="w-2.5 h-2.5" />
            <span>WA Oficial</span>
          </span>
        );
      case 'mobile':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-semibold" title="Canal: App Mobile SOL">
            <Smartphone className="w-2.5 h-2.5" />
            <span>App SOL</span>
          </span>
        );
      case 'web':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-semibold" title="Canal: Web Widget">
            <Globe className="w-2.5 h-2.5" />
            <span>Web</span>
          </span>
        );
      default:
        return null;
    }
  };

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
      <div className="p-3 border-b border-slate-100 space-y-2">
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

        {onOpenNewChat && (
          <button
            onClick={onOpenNewChat}
            className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Iniciar Atendimento Avulso</span>
          </button>
        )}
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
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px] truncate">
                      {conv.department || 'Geral'}
                    </span>
                    {renderChannelBadge(conv.channel)}
                  </div>

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
                  {conv.status === 'waiting_rating' && (
                    <span className="flex items-center gap-1 text-amber-700 font-semibold text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="Atendimento encerrado, aguardando nota de 1 a 5 do cliente no WhatsApp">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
                      Aguardando Nota
                    </span>
                  )}
                  {conv.status === 'closed' && (
                    <span className="text-slate-500 text-[11px] flex items-center gap-1">
                      {conv.rating ? (
                        <span className="text-amber-600 font-bold flex items-center gap-0.5 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-400" />
                          {conv.rating}★
                        </span>
                      ) : (
                        'Finalizado'
                      )}
                    </span>
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

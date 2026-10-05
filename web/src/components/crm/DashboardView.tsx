import React from 'react';
import {
  Users,
  MessageCircle,
  Clock,
  CheckCircle,
  Smile,
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  Server,
} from 'lucide-react';
import type { Conversation } from '../../types/chat';
import type { UserRole, AuthUser } from '../../types/crm';
import { isSameDepartment } from '../../utils/rbac';

interface DashboardViewProps {
  conversations: Conversation[];
  onNavigateToChat: () => void;
  onNavigateToIntegrations: () => void;
  userRole?: UserRole;
  currentUser?: AuthUser | null;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  conversations,
  onNavigateToChat,
  onNavigateToIntegrations,
  userRole,
  currentUser,
}) => {
  const isGestor = userRole === 'gestor';
  const gestorDept = currentUser?.department || 'Suporte Técnico';

  const waitingCount = conversations.filter((c) => c.status === 'waiting').length;
  const activeCount = conversations.filter((c) => c.status === 'active').length;
  const closedCount = conversations.filter((c) => c.status === 'closed').length;

  const teamMembers = [
    {
      id: 'm-1',
      name: 'Lucas Gabriel',
      initials: 'LG',
      department: 'Suporte Técnico',
      chats: 2,
      status: 'online' as const,
      statusLabel: 'Disponível',
      color: 'bg-blue-100 text-blue-700',
    },
    {
      id: 'm-2',
      name: 'Ana Lima',
      initials: 'AL',
      department: 'Financeiro',
      chats: 4,
      status: 'busy' as const,
      statusLabel: 'Ocupado',
      color: 'bg-purple-100 text-purple-700',
    },
    {
      id: 'm-3',
      name: 'Carlos Rocha',
      initials: 'CR',
      department: 'Comercial',
      chats: 1,
      status: 'online' as const,
      statusLabel: 'Disponível',
      color: 'bg-emerald-100 text-emerald-700',
    },
    {
      id: 'm-4',
      name: 'Beatriz Costa',
      initials: 'BC',
      department: 'Suporte Técnico',
      chats: 0,
      status: 'online' as const,
      statusLabel: 'Disponível',
      color: 'bg-indigo-100 text-indigo-700',
    },
  ];

  const visibleTeamMembers = teamMembers.filter((m) => {
    if (isGestor && gestorDept) {
      return isSameDepartment(m.department, gestorDept);
    }
    return true;
  });

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            {isGestor ? `Dashboard da Equipe (${gestorDept})` : 'Dashboard Gerencial'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isGestor
              ? `Visão em tempo real dos chamados e operadores exclusivos do setor ${gestorDept}.`
              : 'Visão executiva em tempo real de atendimentos, operadores e saúde do canal.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>ERP Conectado & Sincronizado</span>
          </div>

          <button
            onClick={onNavigateToChat}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Ir para o Atendimento</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Fila em Espera */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Fila em Espera
            </span>
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800">{waitingCount}</span>
            <span className="text-xs text-amber-600 font-medium">
              {waitingCount > 0 ? 'Requer atenção imediata' : 'Fila zerada'}
            </span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            Tempo médio de espera: <strong className="text-slate-600">1m 12s</strong>
          </div>
        </div>

        {/* Card 2: Em Atendimento */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Em Atendimento
            </span>
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800">{activeCount}</span>
            <span className="text-xs text-blue-600 font-medium">conversas ativas</span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            Capacidade da equipe: <strong className="text-slate-600">3 operadores online</strong>
          </div>
        </div>

        {/* Card 3: Finalizados Hoje */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Finalizados
            </span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800">{closedCount}</span>
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5 inline" />
              100% resolvidos
            </span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            TMA médio: <strong className="text-slate-600">6m 45s</strong>
          </div>
        </div>

        {/* Card 4: Satisfação CSAT */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Satisfação (CSAT)
            </span>
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Smile className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800">97.8%</span>
            <span className="text-xs text-purple-600 font-medium">Excelente</span>
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            Baseado em <strong className="text-slate-600">42 avaliações</strong> recebidas
          </div>
        </div>
      </div>

      {/* 2-Column Section: Department Distribution & ERP Sync Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Volume por Departamento */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Distribuição de Chamados por Departamento
              </h3>
              <p className="text-xs text-slate-400">
                Fila balanceada com regras de roteamento inteligente
              </p>
            </div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
              Tempo Real
            </span>
          </div>

          <div className="space-y-3.5 pt-2">
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                <span>Suporte Técnico (Internet / Fibra / Roteador)</span>
                <span>52% (26 chamados)</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: '52%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                <span>Financeiro / Faturamento (2ª via boleto / PIX / NF)</span>
                <span>31% (15 chamados)</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '31%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                <span>Comercial & Vendas (Novos planos / Upgrade)</span>
                <span>17% (8 chamados)</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: '17%' }} />
              </div>
            </div>
          </div>

          {/* SLA Indicator */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              Meta de SLA de 1ª Resposta: <strong>&lt; 3 minutos</strong>
            </span>
            <span className="text-emerald-600 font-semibold">98.2% dentro da meta</span>
          </div>
        </div>

        {/* Right: ERP Integration Status Card */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 rounded-xl shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Integração ERP SOL</h4>
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Online & Operacional
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Os dados de clientes, boletos em aberto, notas fiscais e contratos estão sincronizados automaticamente entre o ERP corporativo e o atendimento.
            </p>

            <div className="space-y-2 text-xs text-slate-300 bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
              <div className="flex justify-between">
                <span className="text-slate-400">Endpoint:</span>
                <span className="font-mono text-[11px] text-blue-300">api.solprovedor.com.br/erp</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Última Sincronização:</span>
                <span className="text-slate-200">Há 2 minutos</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Boletos PIX Gerados:</span>
                <span className="text-emerald-400 font-semibold">38 hoje</span>
              </div>
            </div>
          </div>

          <button
            onClick={onNavigateToIntegrations}
            className="w-full mt-4 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Configurar Módulos ERP</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Operators Online Monitor */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">
            {isGestor ? `Operadores da Equipe (${gestorDept})` : 'Status da Equipe de Atendentes (Ao Vivo)'}
          </h3>
          <span className="text-xs text-slate-400">
            {visibleTeamMembers.length} {visibleTeamMembers.length === 1 ? 'operador conectado' : 'operadores conectados'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {visibleTeamMembers.map((member) => (
            <div
              key={member.id}
              className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className={`w-9 h-9 rounded-full font-bold flex items-center justify-center text-xs ${member.color}`}>
                    {member.initials}
                  </div>
                  <span
                    className={`w-2.5 h-2.5 rounded-full border-2 border-white absolute bottom-0 right-0 ${
                      member.status === 'online' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                </div>
                <div>
                  <div className="font-semibold text-xs text-slate-800">{member.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {member.department} • {member.chats} {member.chats === 1 ? 'chat' : 'chats'}
                  </div>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  member.status === 'online'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {member.statusLabel}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

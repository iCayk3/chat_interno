import React, { useState } from 'react';
import {
  Download,
  Star,
  Shield,
} from 'lucide-react';
import type { UserRole, AuthUser } from '../../types/crm';
import { isSameDepartment } from '../../utils/rbac';

interface RelatoriosViewProps {
  userRole?: UserRole;
  currentUser?: AuthUser | null;
}

export const RelatoriosView: React.FC<RelatoriosViewProps> = ({ userRole, currentUser }) => {
  const isGestor = userRole === 'gestor';
  const gestorDept = currentUser?.department || 'Suporte Técnico';
  const [period, setPeriod] = useState<'today' | '7days' | '30days'>('7days');

  const attendantStats = [
    {
      name: 'Lucas Gabriel',
      department: 'Suporte Técnico',
      ticketsClosed: 52,
      avgResponseTime: '58s',
      avgAttendanceTime: '6m 20s',
      csatScore: '4.9 ★',
    },
    {
      name: 'Ana Lima',
      department: 'Financeiro',
      ticketsClosed: 48,
      avgResponseTime: '1m 15s',
      avgAttendanceTime: '5m 40s',
      csatScore: '4.8 ★',
    },
    {
      name: 'Carlos Rocha',
      department: 'Comercial',
      ticketsClosed: 34,
      avgResponseTime: '1m 40s',
      avgAttendanceTime: '8m 10s',
      csatScore: '4.7 ★',
    },
    {
      name: 'Beatriz Costa',
      department: 'Suporte Técnico',
      ticketsClosed: 29,
      avgResponseTime: '1m 02s',
      avgAttendanceTime: '7m 05s',
      csatScore: '4.9 ★',
    },
  ];

  const visibleStats = attendantStats.filter((a) => {
    if (isGestor && gestorDept) {
      return isSameDepartment(a.department, gestorDept);
    }
    return true;
  });

  const totalTickets = visibleStats.reduce((acc, curr) => acc + curr.ticketsClosed, 0);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Relatórios & Indicadores de Desempenho
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Análise aprofundada de volumetria, produtividade dos atendentes e metas de satisfação.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="p-1 bg-white border border-slate-200 rounded-lg flex text-xs font-semibold">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1 rounded-md transition-all ${
                period === 'today' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriod('7days')}
              className={`px-3 py-1 rounded-md transition-all ${
                period === '7days' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Últimos 7 dias
            </button>
            <button
              onClick={() => setPeriod('30days')}
              className={`px-3 py-1 rounded-md transition-all ${
                period === '30days' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Este Mês
            </button>
          </div>

          <button
            onClick={() => alert('Relatório CSV exportado com sucesso!')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors shadow-2xs"
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
              <strong>Visão de Gestor de Equipe:</strong> Exibindo métricas e indicadores consolidados exclusivamente da sua equipe (<strong>{gestorDept}</strong>).
            </span>
          </div>
        </div>
      )}

      {/* Metrics Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Total Atendimentos
          </span>
          <div className="text-3xl font-extrabold text-slate-800 mt-2">{totalTickets}</div>
          <span className="text-xs text-emerald-600 font-semibold mt-1 inline-block">
            +18% vs período anterior
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Tempo Médio Resposta (TMR)
          </span>
          <div className="text-3xl font-extrabold text-slate-800 mt-2">1m 15s</div>
          <span className="text-xs text-emerald-600 font-semibold mt-1 inline-block">
            Dentro da meta (&lt; 3m)
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Tempo Médio Atendimento (TMA)
          </span>
          <div className="text-3xl font-extrabold text-slate-800 mt-2">6m 48s</div>
          <span className="text-xs text-slate-500 font-medium mt-1 inline-block">
            Resolução ágil
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Satisfação dos Clientes
          </span>
          <div className="text-3xl font-extrabold text-slate-800 mt-2 flex items-center gap-1">
            <span>4.85</span>
            <Star className="w-5 h-5 fill-amber-400 text-amber-400 inline" />
          </div>
          <span className="text-xs text-emerald-600 font-semibold mt-1 inline-block">
            97% avaliações positivas
          </span>
        </div>
      </div>

      {/* Attendants Ranking Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">
            Desempenho Individual por Atendente
          </h3>
          <span className="text-xs text-slate-400">Classificado por chamados resolvidos</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Atendente</th>
                <th className="py-3 px-4">Departamento</th>
                <th className="py-3 px-4">Atendimentos Resolvidos</th>
                <th className="py-3 px-4">TMR Médio</th>
                <th className="py-3 px-4">TMA Médio</th>
                <th className="py-3 px-4 text-right">Nota CSAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {visibleStats.map((stat, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-800">{stat.name}</td>
                  <td className="py-3 px-4">{stat.department}</td>
                  <td className="py-3 px-4 font-bold text-blue-600">{stat.ticketsClosed}</td>
                  <td className="py-3 px-4">{stat.avgResponseTime}</td>
                  <td className="py-3 px-4">{stat.avgAttendanceTime}</td>
                  <td className="py-3 px-4 text-right font-bold text-amber-600">
                    {stat.csatScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

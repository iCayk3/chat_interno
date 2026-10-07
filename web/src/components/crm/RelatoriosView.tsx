import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Clock,
  Star,
  Users,
  Layers,
  Download,
  RefreshCw,
  Shield,
  AlertCircle,
  Award,
} from 'lucide-react';
import { api } from '../../services/api';
import type {
  UserRole,
  AuthUser,
  ReportSummaryResponse,
} from '../../types/crm';

interface RelatoriosViewProps {
  userRole?: UserRole;
  currentUser?: AuthUser | null;
}

export const RelatoriosView: React.FC<RelatoriosViewProps> = ({
  userRole,
  currentUser,
}) => {
  const isGestor = userRole === 'gestor';
  const gestorDept = currentUser?.department || '';

  const [period, setPeriod] = useState<string>('30days');
  const [selectedDept, setSelectedDept] = useState<string>(isGestor && gestorDept ? gestorDept : '');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isCustomDate, setIsCustomDate] = useState<boolean>(false);

  const [metrics, setMetrics] = useState<ReportSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const activeDept = isGestor && gestorDept ? gestorDept : selectedDept;
      const data = await api.getReportSummary({
        period: isCustomDate ? 'custom' : period,
        department: activeDept || undefined,
        startDate: isCustomDate && startDate ? startDate : undefined,
        endDate: isCustomDate && endDate ? endDate : undefined,
      });
      setMetrics(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao carregar relatórios gerenciais.');
    } finally {
      setIsLoading(false);
    }
  }, [period, selectedDept, isCustomDate, startDate, endDate, isGestor, gestorDept]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  // Formatação de segundos em formato amigável
  const formatSeconds = (sec: number): string => {
    if (!sec || isNaN(sec) || sec <= 0) return '0s';
    const s = Math.round(sec);
    if (s < 60) return `${s}s`;
    const min = Math.floor(s / 60);
    const remSec = s % 60;
    if (min < 60) {
      return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
    }
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hr}h ${remMin}m`;
  };

  const handleExportCsv = () => {
    if (!metrics) return;

    const lines: string[] = [];
    lines.push('RELATÓRIO GERENCIAL DE ATENDIMENTOS E MÉTRICAS');
    lines.push(`Período: ${period}`);
    lines.push(`Total Atendimentos: ${metrics.totalTickets}`);
    lines.push(`Atendimentos Finalizados: ${metrics.closedTickets}`);
    lines.push(`TMA Médio: ${formatSeconds(metrics.avgTmaSeconds)}`);
    lines.push(`TME Médio: ${formatSeconds(metrics.avgTmeSeconds)}`);
    lines.push(`Satisfação Média (CSAT): ${metrics.avgRating.toFixed(2)} Estrelas`);
    lines.push('');
    lines.push('MÉTRICAS POR SETOR:');
    lines.push('Setor,Total,TMA,TME,CSAT,Avaliações');
    metrics.departments.forEach((d) => {
      lines.push(`"${d.department}",${d.totalTickets},${formatSeconds(d.avgTmaSeconds)},${formatSeconds(d.avgTmeSeconds)},${d.avgRating.toFixed(2)},${d.ratedCount}`);
    });
    lines.push('');
    lines.push('MÉTRICAS POR ATENDENTE:');
    lines.push('Atendente,Setor,Total,TMA,TME,CSAT,Avaliações');
    metrics.operators.forEach((o) => {
      lines.push(`"${o.operatorName}","${o.department}",${o.totalTickets},${formatSeconds(o.avgTmaSeconds)},${formatSeconds(o.avgTmeSeconds)},${o.avgRating.toFixed(2)},${o.ratedCount}`);
    });

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_metricas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Cálculo de percentuais de satisfação
  const totalRated = metrics?.totalRated || 0;
  const ratingDist = metrics?.ratingDistribution || {};
  const getRatingPercentage = (stars: number): number => {
    if (!totalRated) return 0;
    const count = ratingDist[String(stars)] || 0;
    return Math.round((count / totalRated) * 100);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/70 p-4 md:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
              Relatórios, Métricas & Indicadores
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Análise aprofundada de TMA (Tempo Médio de Atendimento), TME (Tempo Médio de Espera), satisfação CSAT e volumetria por setor e atendente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isGestor && (
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Todos os Setores</option>
              <option value="Suporte Técnico">Suporte Técnico</option>
              <option value="Financeiro">Financeiro</option>
              <option value="Comercial">Comercial</option>
              <option value="Atendimento Geral">Atendimento Geral</option>
            </select>
          )}

          {/* Seletor de Período Rápido */}
          <div className="p-1 bg-white border border-slate-200 rounded-lg flex text-xs font-semibold shadow-2xs">
            <button
              onClick={() => {
                setIsCustomDate(false);
                setPeriod('today');
              }}
              className={`px-3 py-1 rounded-md transition-all ${
                !isCustomDate && period === 'today'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => {
                setIsCustomDate(false);
                setPeriod('7days');
              }}
              className={`px-3 py-1 rounded-md transition-all ${
                !isCustomDate && period === '7days'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 dias
            </button>
            <button
              onClick={() => {
                setIsCustomDate(false);
                setPeriod('30days');
              }}
              className={`px-3 py-1 rounded-md transition-all ${
                !isCustomDate && period === '30days'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 dias
            </button>
            <button
              onClick={() => setIsCustomDate(!isCustomDate)}
              className={`px-3 py-1 rounded-md transition-all ${
                isCustomDate ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Personalizado
            </button>
          </div>

          <button
            onClick={() => loadMetrics()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-2xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={!metrics}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-2xs transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {isCustomDate && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center gap-3 text-xs">
          <span className="font-bold text-slate-700">Intervalo Customizado:</span>
          <div className="flex items-center gap-2">
            <label className="text-slate-500">De:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-md text-xs bg-slate-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-500">Até:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-md text-xs bg-slate-50"
            />
          </div>
          <button
            onClick={() => loadMetrics()}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md transition-colors"
          >
            Aplicar
          </button>
        </div>
      )}

      {isGestor && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs text-blue-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Visão de Gestor de Setor:</strong> Indicadores e médias consolidados exclusivamente da equipe do departamento (<strong>{gestorDept}</strong>).
            </span>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-700 text-xs flex items-center gap-2 rounded-xl border border-red-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Atendimentos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              Total de Atendimentos
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-800 mt-2">
            {metrics ? metrics.totalTickets : 0}
          </div>
          <div className="text-xs text-slate-500 mt-2 flex items-center gap-2">
            <span className="text-emerald-600 font-bold">{metrics?.closedTickets || 0} finalizados</span>
            <span>•</span>
            <span className="text-amber-600 font-bold">{metrics?.waitingTickets || 0} na fila</span>
          </div>
        </div>

        {/* TME (Tempo Médio de Espera) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              TME (Tempo Médio de Espera)
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-800 mt-2">
            {metrics ? formatSeconds(metrics.avgTmeSeconds) : '0s'}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Tempo até o primeiro operador assumir
          </div>
        </div>

        {/* TMA (Tempo Médio de Atendimento) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              TMA (Tempo Médio Atendimento)
            </span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-800 mt-2">
            {metrics ? formatSeconds(metrics.avgTmaSeconds) : '0s'}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Duração média da interação com o operador
          </div>
        </div>

        {/* CSAT / Satisfação do Cliente */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              Satisfação Média (CSAT)
            </span>
            <div className="p-2 bg-amber-50 text-amber-500 rounded-lg">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-800 mt-2 flex items-center gap-1.5">
            <span>{metrics && metrics.avgRating > 0 ? metrics.avgRating.toFixed(2) : '-'}</span>
            <span className="text-sm font-semibold text-slate-400">/ 5.0</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Baseado em <strong>{totalRated}</strong> avaliação(ões) de clientes
          </div>
        </div>
      </div>

      {/* Grid com Distribuição de Notas e Métricas por Setor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Distribuição de Avaliações 1 a 5 estrelas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-slate-800 text-sm">Distribuição de Avaliações (1 a 5)</h3>
            </div>
            <span className="text-[11px] text-slate-400">{totalRated} total</span>
          </div>

          <div className="space-y-3 text-xs">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = ratingDist[String(stars)] || 0;
              const pct = getRatingPercentage(stars);
              const labelMap: Record<number, string> = {
                5: 'Excelente',
                4: 'Bom',
                3: 'Regular',
                2: 'Ruim',
                1: 'Muito Ruim',
              };

              return (
                <div key={stars} className="flex items-center gap-3">
                  <div className="w-24 flex items-center gap-1 font-bold text-slate-700" title={labelMap[stars]}>
                    <span>{stars}</span>
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-[10px] text-slate-400 font-normal">({labelMap[stars]})</span>
                  </div>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        stars >= 4 ? 'bg-emerald-500' : stars === 3 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-20 text-right text-slate-500">
                    <span className="font-bold text-slate-800">{count}</span> ({pct}%)
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 text-[11px] text-slate-400 text-center">
            Escala avaliada pelos clientes no app ao final de cada conversa.
          </div>
        </div>

        {/* Desempenho por Departamento / Setor */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-sm">Volumetria e Agilidade por Setor</h3>
            </div>
            <span className="text-[11px] text-slate-400">Classificado por volume</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Setor</th>
                  <th className="py-2.5 px-3">Atendimentos</th>
                  <th className="py-2.5 px-3">TME Médio</th>
                  <th className="py-2.5 px-3">TMA Médio</th>
                  <th className="py-2.5 px-3 text-right">CSAT Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {metrics?.departments && metrics.departments.length > 0 ? (
                  metrics.departments.map((dept, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-800">{dept.department}</td>
                      <td className="py-2.5 px-3 font-semibold text-blue-600">{dept.totalTickets}</td>
                      <td className="py-2.5 px-3 font-mono">{formatSeconds(dept.avgTmeSeconds)}</td>
                      <td className="py-2.5 px-3 font-mono">{formatSeconds(dept.avgTmaSeconds)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-amber-500">
                        {dept.avgRating > 0 ? `${dept.avgRating.toFixed(2)} ★` : '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Nenhum dado por setor no período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Desempenho e Ranking por Atendente */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-slate-800 text-sm">
              Produtividade e Qualidade por Atendente
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Tempo de resposta, TMA e índice de satisfação individual
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Atendente</th>
                <th className="py-3 px-4">Setor</th>
                <th className="py-3 px-4">Atendimentos</th>
                <th className="py-3 px-4">TME Médio (Espera)</th>
                <th className="py-3 px-4">TMA Médio (Atendimento)</th>
                <th className="py-3 px-4 text-right">Nota CSAT</th>
                <th className="py-3 px-4 text-right">Avaliações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {metrics?.operators && metrics.operators.length > 0 ? (
                metrics.operators.map((op, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                          {op.operatorName.charAt(0)}
                        </div>
                        <span className="font-bold text-slate-800">{op.operatorName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{op.department}</td>
                    <td className="py-3 px-4 font-bold text-blue-600">{op.totalTickets}</td>
                    <td className="py-3 px-4 font-mono">{formatSeconds(op.avgTmeSeconds)}</td>
                    <td className="py-3 px-4 font-mono">{formatSeconds(op.avgTmaSeconds)}</td>
                    <td className="py-3 px-4 text-right font-bold text-amber-500">
                      {op.avgRating > 0 ? `${op.avgRating.toFixed(2)} ★` : '-'}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500">
                      {op.ratedCount}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Nenhum atendente com atendimentos registrados no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

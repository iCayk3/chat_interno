import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Clock,
  Users,
  CheckCircle2,
  Edit2,
  Shield,
} from 'lucide-react';
import type { Department, UserRole, AuthUser } from '../../types/crm';
import { isSameDepartment } from '../../utils/rbac';

interface DepartamentosViewProps {
  userRole?: UserRole;
  currentUser?: AuthUser | null;
}

export const DepartamentosView: React.FC<DepartamentosViewProps> = ({ userRole, currentUser }) => {
  const isGestor = userRole === 'gestor';
  const gestorDept = currentUser?.department || 'Suporte Técnico';

  const [departments] = useState<Department[]>([
    {
      id: 'dep-01',
      name: 'Suporte Técnico',
      description: 'Problemas de conexão, configuração de roteador e lentidão na internet',
      slaMinutes: 3,
      color: '#2563EB',
      activeAttendantsCount: 2,
      openTicketsCount: 4,
      routingMode: 'least_busy',
    },
    {
      id: 'dep-02',
      name: 'Financeiro & Faturamento',
      description: 'Segunda via de boletos, código PIX, negociação de dívidas e notas fiscais',
      slaMinutes: 5,
      color: '#059669',
      activeAttendantsCount: 1,
      openTicketsCount: 2,
      routingMode: 'round_robin',
    },
    {
      id: 'dep-03',
      name: 'Comercial & Vendas',
      description: 'Aquisição de novos planos de fibra óptica, upgrades e promoções',
      slaMinutes: 10,
      color: '#9333EA',
      activeAttendantsCount: 1,
      openTicketsCount: 1,
      routingMode: 'round_robin',
    },
    {
      id: 'dep-04',
      name: 'Ouvidoria & Triagem Geral',
      description: 'Atendimento corporativo e escalonamento de solicitações críticas',
      slaMinutes: 15,
      color: '#D97706',
      activeAttendantsCount: 1,
      openTicketsCount: 0,
      routingMode: 'manual',
    },
  ]);

  const getRoutingLabel = (mode: Department['routingMode']) => {
    switch (mode) {
      case 'least_busy':
        return 'Menos Ocupado (Distribuição Inteligente)';
      case 'round_robin':
        return 'Round-Robin (Revezamento Circular)';
      default:
        return 'Manual (Triagem por Fila)';
    }
  };

  const visibleDepartments = departments.filter((d) => {
    if (isGestor && gestorDept) {
      return isSameDepartment(d.name, gestorDept);
    }
    return true;
  });

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Departamentos & Filas de Atendimento
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isGestor
              ? `Visualizando parâmetros de fila e SLA do seu setor: ${gestorDept}.`
              : 'Configure as filas de entrada, metas de SLA e regras de distribuição de chamados aos operadores.'}
          </p>
        </div>

        {!isGestor && (
          <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors">
            <Plus className="w-4 h-4" />
            <span>Novo Departamento</span>
          </button>
        )}
      </div>

      {isGestor && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs text-blue-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Visão de Gestor de Equipe:</strong> Exibindo exclusivamente o departamento sob sua gestão (<strong>{gestorDept}</strong>).
            </span>
          </div>
        </div>
      )}

      {/* Department Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleDepartments.map((dept) => (
          <div
            key={dept.id}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4 hover:shadow-xs transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-xs"
                  style={{ backgroundColor: dept.color }}
                >
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">{dept.name}</h3>
                  <span className="text-[11px] text-slate-400">ID: {dept.id}</span>
                </div>
              </div>

              <button className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50">
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">{dept.description}</p>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Meta SLA
                </span>
                <span className="font-bold text-slate-700 mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-blue-600" />
                  {dept.slaMinutes} min
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Atendentes
                </span>
                <span className="font-bold text-slate-700 mt-0.5 flex items-center gap-1">
                  <Users className="w-3 h-3 text-emerald-600" />
                  {dept.activeAttendantsCount} ativos
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Chamados
                </span>
                <span className="font-bold text-slate-700 mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-amber-600" />
                  {dept.openTicketsCount} na fila
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
              <span>Roteamento:</span>
              <strong className="text-slate-700 font-semibold">{getRoutingLabel(dept.routingMode)}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

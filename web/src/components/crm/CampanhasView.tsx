import React, { useState } from 'react';
import {
  Plus,
  Users,
  Shield,
  Tag,
} from 'lucide-react';
import type { UserRole, AuthUser } from '../../types/crm';
import { isSameDepartment } from '../../utils/rbac';

interface CampanhasViewProps {
  userRole?: UserRole;
  currentUser?: AuthUser | null;
}

export const CampanhasView: React.FC<CampanhasViewProps> = ({ userRole, currentUser }) => {
  const isGestor = userRole === 'gestor';
  const gestorDept = currentUser?.department || 'Suporte Técnico';

  const [campaigns] = useState([
    {
      id: 'camp-01',
      title: 'Aviso de Manutenção Preventiva na Região Norte',
      department: 'Suporte Técnico',
      target: 'Assinantes Bairro Centro & Jardim América (420 clientes)',
      status: 'concluida',
      sentCount: 420,
      deliveredRate: '99.2%',
      date: '02/10/2026',
    },
    {
      id: 'camp-02',
      title: 'Campanha Upgrade 600 Mega Fibra pelo mesmo preço',
      department: 'Comercial',
      target: 'Clientes no plano 300 Mega há mais de 12 meses (850 clientes)',
      status: 'ativa',
      sentCount: 610,
      deliveredRate: '98.5%',
      date: '04/10/2026',
    },
    {
      id: 'camp-03',
      title: 'Lembrete Preventivo de Vencimento com Chave PIX',
      department: 'Financeiro',
      target: 'Assinantes com vencimento em 3 dias (310 clientes)',
      status: 'ativa',
      sentCount: 310,
      deliveredRate: '99.8%',
      date: '05/10/2026',
    },
    {
      id: 'camp-04',
      title: 'Comunicado de Otimização de Roteador Wi-Fi 6',
      department: 'Suporte Técnico',
      target: 'Clientes com comodato corporativo (180 clientes)',
      status: 'concluida',
      sentCount: 180,
      deliveredRate: '100%',
      date: '01/10/2026',
    },
  ]);

  const visibleCampaigns = campaigns.filter((c) => {
    if (isGestor && gestorDept) {
      return isSameDepartment(c.department, gestorDept);
    }
    return true;
  });

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Campanhas & Disparos
            </h1>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wide">
              Novidade
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Envie comunicados massivos de rede, avisos de cobrança preventiva e ofertas comerciais.
          </p>
        </div>

        <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors">
          <Plus className="w-4 h-4" />
          <span>Nova Campanha</span>
        </button>
      </div>

      {isGestor && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs text-blue-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Visão de Gestor de Equipe:</strong> Exibindo apenas disparos e campanhas associadas ao seu setor (<strong>{gestorDept}</strong>).
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleCampaigns.map((camp) => (
          <div
            key={camp.id}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold flex items-center gap-1">
                    <Tag className="w-3 h-3 text-slate-400" />
                    {camp.department}
                  </span>
                </div>
                <h3 className="font-bold text-slate-800 text-sm">{camp.title}</h3>
                <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>{camp.target}</span>
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  camp.status === 'ativa'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {camp.status === 'ativa' ? 'Em Envio' : 'Concluída'}
              </span>
            </div>

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
                <span className="text-[10px] text-slate-400 block font-semibold">Data</span>
                <span className="text-slate-600 font-medium">{camp.date}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

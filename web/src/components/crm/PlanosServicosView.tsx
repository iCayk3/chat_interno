import React from 'react';
import {
  Plus,
  Wifi,
} from 'lucide-react';

export const PlanosServicosView: React.FC = () => {
  const plans = [
    {
      id: 'plan-01',
      name: 'SOL Fibra 300 Mega',
      speed: '300 Mbps Download / 150 Mbps Upload',
      price: 'R$ 89,90/mês',
      erpCode: 'PLN_FIBRA_300M',
      activeSubscribers: 420,
      badge: 'Popular',
    },
    {
      id: 'plan-02',
      name: 'SOL Fibra 600 Mega Gamer',
      speed: '600 Mbps Download / 300 Mbps Upload (IP Fixo opcional)',
      price: 'R$ 119,90/mês',
      erpCode: 'PLN_FIBRA_600M',
      activeSubscribers: 680,
      badge: 'Mais Vendido',
    },
    {
      id: 'plan-03',
      name: 'SOL Fibra 1 Giga Turbo',
      speed: '1.000 Mbps Download / 500 Mbps Upload (Wi-Fi 6 incluso)',
      price: 'R$ 159,90/mês',
      erpCode: 'PLN_FIBRA_1G',
      activeSubscribers: 290,
      badge: 'Alta Performance',
    },
    {
      id: 'plan-04',
      name: 'SOL Corporativo Dedicado',
      speed: 'Link 100% Simétrico com SLA de 4 horas',
      price: 'Sob Consulta',
      erpCode: 'PLN_DEDICADO_CORP',
      activeSubscribers: 45,
      badge: 'Empresarial',
    },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Planos de Serviços & Catálogo ERP
            </h1>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wide">
              Novidade
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Catálogo de planos sincronizado com a tabela de produtos e contratos do sistema ERP.
          </p>
        </div>

        <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors">
          <Plus className="w-4 h-4" />
          <span>Cadastrar Plano</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((p) => (
          <div
            key={p.id}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4 hover:border-blue-300 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">{p.name}</h3>
                  <span className="font-mono text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md mt-1 inline-block">
                    Código ERP: {p.erpCode}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                  {p.badge}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600 mt-3 space-y-1">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <Wifi className="w-4 h-4 text-blue-600" />
                  <span>{p.speed}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Assinantes ativos: <strong>{p.activeSubscribers}</strong>
              </span>
              <span className="text-sm font-extrabold text-slate-900">{p.price}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

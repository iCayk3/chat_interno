import React from 'react';
import {
  Plus,
  Bot,
  Zap,
  Moon,
  Smile,
} from 'lucide-react';

export const AutomacoesView: React.FC = () => {
  const automations = [
    {
      id: 'auto-01',
      title: 'Triagem Automática de Entrada',
      description: 'Identifica o cliente pelo CPF/CNPJ via ERP e direciona automaticamente para a fila correta (Suporte, Financeiro ou Comercial).',
      active: true,
      trigger: 'Ao iniciar conversa',
      icon: Bot,
      color: '#2563EB',
    },
    {
      id: 'auto-02',
      title: 'Autoatendimento de 2ª Via PIX (ERP)',
      description: 'Permite ao assinante solicitar e receber a fatura do mês com código PIX instantaneamente sem esperar por um atendente.',
      active: true,
      trigger: 'Cliente digita "2" ou "fatura"',
      icon: Zap,
      color: '#059669',
    },
    {
      id: 'auto-03',
      title: 'Mensagem de Ausência Fora do Expediente',
      description: 'Envia resposta automática fora do horário comercial (seg a sex após 18h e finais de semana) informando os canais de plantão.',
      active: true,
      trigger: 'Horário fora de expediente',
      icon: Moon,
      color: '#D97706',
    },
    {
      id: 'auto-04',
      title: 'Pesquisa de Satisfação Pós-Atendimento (CSAT)',
      description: 'Dispara automaticamente pesquisa com avaliação de 1 a 5 estrelas logo após o operador encerrar a conversa.',
      active: true,
      trigger: 'Ao encerrar conversa',
      icon: Smile,
      color: '#9333EA',
    },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Automações & Chatbots de Triagem
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Reduza filas e agilize o atendimento com fluxos automáticos integrados ao ERP.
          </p>
        </div>

        <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors">
          <Plus className="w-4 h-4" />
          <span>Criar Nova Automação</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {automations.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4 hover:border-blue-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
                      style={{ backgroundColor: item.color }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">{item.title}</h3>
                      <span className="text-[11px] text-slate-400">Gatilho: {item.trigger}</span>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                    Ativo
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {item.description}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">Taxa de sucesso: 94.2%</span>
                <button className="text-blue-600 font-semibold hover:underline">
                  Editar Fluxo
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

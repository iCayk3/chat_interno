import React, { useState } from 'react';
import type { Conversation, CustomerEnrichment } from '../types/chat';
import { api } from '../services/api';
import { ShieldCheck, DollarSign, Ticket, RefreshCw, Info } from 'lucide-react';

interface CustomerInfoSidebarProps {
  conversation: Conversation | null;
}

export const CustomerInfoSidebar: React.FC<CustomerInfoSidebarProps> = ({ conversation }) => {
  const [enrichment, setEnrichment] = useState<CustomerEnrichment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!conversation) return null;

  const handleLookup = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.lookupCustomer(conversation.clientName);
      setEnrichment(data);
    } catch {
      setError('Não foi possível obter dados externos no momento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-80 h-full bg-white border-l border-slate-200 p-4 flex flex-col gap-5 shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-lg border border-slate-200">
          {conversation.clientName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 truncate">
          <h3 className="font-semibold text-slate-800 text-sm truncate">{conversation.clientName}</h3>
          <p className="text-xs text-slate-400 font-mono truncate">{conversation.clientId}</p>
        </div>
      </div>

      {/* Basic Data */}
      <div className="space-y-2 text-xs">
        <div className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider">Dados da Sessão</div>
        <div className="bg-slate-50 p-3 rounded-lg space-y-1.5 border border-slate-100">
          <div className="flex justify-between">
            <span className="text-slate-500">Departamento:</span>
            <span className="font-medium text-slate-800">{conversation.department || 'Geral'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Status:</span>
            <span className={`font-semibold capitalize ${
              conversation.status === 'active' ? 'text-emerald-600' :
              conversation.status === 'waiting' ? 'text-amber-600' : 'text-slate-400'
            }`}>
              {conversation.status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Operador:</span>
            <span className="font-medium text-slate-800">{conversation.operator?.name || 'Não atribuído'}</span>
          </div>
        </div>
      </div>

      {/* External API Integration Section */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
            Consultas em APIs (CRM / ERP)
          </div>
          <button
            onClick={handleLookup}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Consultar
          </button>
        </div>

        {enrichment ? (
          <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/30 border border-blue-100 p-3 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-blue-800 font-semibold pb-1 border-b border-blue-100/60">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Cliente Enriquecido via Go API</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Nível / Categoria:</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                {enrichment.crmData?.tier || 'VIP'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-slate-400" />
                Financeiro:
              </span>
              <span className="font-medium text-slate-800">
                {enrichment.financialStatus?.status || 'Adimplente'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Plano Ativo:</span>
              <span className="font-medium text-slate-800">
                {enrichment.financialStatus?.activePlan || 'Empresarial 100'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 flex items-center gap-1">
                <Ticket className="w-3 h-3 text-slate-400" />
                Chamados Abertos:
              </span>
              <span className="font-semibold text-slate-800">{enrichment.openTickets}</span>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-lg text-center text-slate-400 space-y-2 border border-slate-100">
            <Info className="w-6 h-6 mx-auto text-slate-300" />
            <p className="text-[11px]">Clique em "Consultar" para buscar dados agregados em tempo real de CRM e ERP.</p>
          </div>
        )}

        {error && (
          <div className="text-[11px] text-rose-500 bg-rose-50 p-2 rounded border border-rose-100">
            {error}
          </div>
        )}
      </div>

      {/* Operator Internal Notes */}
      <div className="space-y-2 text-xs mt-auto">
        <label className="text-slate-400 uppercase font-semibold text-[10px] tracking-wider block">
          Anotações Internas (Não visível ao cliente)
        </label>
        <textarea
          placeholder="Escreva anotações sobre este cliente..."
          className="w-full h-24 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 resize-none transition-all"
        />
      </div>
    </div>
  );
};

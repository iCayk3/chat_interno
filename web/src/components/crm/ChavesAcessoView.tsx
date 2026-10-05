import React, { useState } from 'react';
import {
  Plus,
  Key,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';

export const ChavesAcessoView: React.FC = () => {
  const [keys] = useState([
    {
      id: 'key-01',
      name: 'Token de Integração ERP SOL (Produção)',
      token: 'sol_live_erp_9f84a1e9c20a1385412b77',
      created: '01/02/2026',
      lastUsed: 'Há 2 minutos',
      permissions: 'Leitura & Escrita (Full ERP)',
    },
    {
      id: 'key-02',
      name: 'Webhook Ingestion Meta (WhatsApp)',
      token: 'sol_meta_wh_771829aa821045bb6291a0',
      created: '15/02/2026',
      lastUsed: 'Há 12 minutos',
      permissions: 'Webhook Recepção',
    },
    {
      id: 'key-03',
      name: 'App Mobile Expo Service Token',
      token: 'sol_mobile_app_339182bb110948ac559',
      created: '10/03/2026',
      lastUsed: 'Agora',
      permissions: 'Clientes WebSockets',
    },
  ]);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Chaves de Acesso & Tokens de API
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gerencie credenciais seguras para comunicação com sistemas externos, ERPs e bots.
          </p>
        </div>

        <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors">
          <Plus className="w-4 h-4" />
          <span>Gerar Nova Chave</span>
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3 text-xs text-amber-800">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold">Regra de Segurança Mandatória:</strong> Nunca exponha estas chaves em repositórios públicos ou no código fonte de navegadores. Use-as exclusivamente nas chamadas autenticadas entre servidores.
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">Chaves Ativas</h3>
          <span className="text-xs text-slate-400">Total: {keys.length}</span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {keys.map((k) => (
            <div key={k.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors">
              <div className="space-y-1">
                <div className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <Key className="w-4 h-4 text-blue-600" />
                  <span>{k.name}</span>
                </div>
                <div className="font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md w-fit text-[11px]">
                  {k.token.substring(0, 14)}••••••••••••••••
                </div>
                <div className="text-[11px] text-slate-400">
                  Permissão: <strong className="text-slate-600">{k.permissions}</strong> • Criado em {k.created}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(k.id, k.token)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold transition-colors"
                >
                  {copiedId === k.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-600">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Chave</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import {
  Smartphone,
  MessageSquare,
  Globe,
  Send,
  ExternalLink,
  QrCode,
} from 'lucide-react';

export const CanaisView: React.FC = () => {
  const channels = [
    {
      id: 'mobile-app',
      name: 'App Mobile SOL (Clientes)',
      type: 'mobile',
      description: 'Aplicativo oficial em React Native (Expo) para iOS e Android conectado via WebSockets nativos',
      status: 'online',
      activeUsers: '1.240 conectados',
      icon: Smartphone,
      color: '#2563EB',
    },
    {
      id: 'whatsapp-api',
      name: 'WhatsApp Business API',
      type: 'whatsapp',
      description: 'Canal oficial via Meta Cloud API com suporte a envio de faturas PIX e mensagens automáticas',
      status: 'online',
      activeUsers: 'Verificado Meta ✓',
      icon: MessageSquare,
      color: '#16A34A',
    },
    {
      id: 'web-widget',
      name: 'Chat Web Widget (Portal do Assinante)',
      type: 'web',
      description: 'Widget embutido no site oficial e central do assinante com autoatendimento',
      status: 'online',
      activeUsers: 'Ativo em solprovedor.com.br',
      icon: Globe,
      color: '#9333EA',
    },
    {
      id: 'telegram-bot',
      name: 'Bot Telegram de Notificações',
      type: 'telegram',
      description: 'Canal alternativo para avisos de manutenção e notificações técnicas aos assinantes',
      status: 'offline',
      activeUsers: 'Configuração pendente',
      icon: Send,
      color: '#0284C7',
    },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Canais de Atendimento Omnichannel
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Conecte múltiplos canais de entrada e unifique todas as mensagens na mesma fila de atendimento.
          </p>
        </div>

        <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors">
          <QrCode className="w-4 h-4" />
          <span>Conectar Novo Canal</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {channels.map((channel) => {
          const Icon = channel.icon;
          const isOnline = channel.status === 'online';

          return (
            <div
              key={channel.id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4 hover:border-blue-300 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
                    style={{ backgroundColor: channel.color }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">{channel.name}</h3>
                    <span className="text-[11px] text-slate-400">{channel.activeUsers}</span>
                  </div>
                </div>

                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    isOnline
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                  {isOnline ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">{channel.description}</p>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">Protocolo: WebSockets / Webhook</span>
                <button className="text-blue-600 font-semibold hover:underline flex items-center gap-1">
                  <span>Configurar</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

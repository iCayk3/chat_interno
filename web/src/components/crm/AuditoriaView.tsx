import React, { useState } from 'react';
import {
  Search,
  Download,
  AlertTriangle,
  Info,
  Lock,
} from 'lucide-react';
import type { AuditLogItem } from '../../types/crm';

export const AuditoriaView: React.FC = () => {
  const [logs] = useState<AuditLogItem[]>([
    {
      id: 'log-01',
      timestamp: '2026-10-05T10:20:15Z',
      operatorName: 'Marcos Suporte',
      operatorId: 'op-01',
      action: 'CONSULTA_ERP',
      resource: 'Consulta de dados fiscais e faturas do cliente Cayke Silva',
      ipAddress: '10.12.199.3',
      severity: 'info',
    },
    {
      id: 'log-02',
      timestamp: '2026-10-05T10:14:02Z',
      operatorName: 'Marcos Suporte',
      operatorId: 'op-01',
      action: 'ENCERRAMENTO_CHAT',
      resource: 'Atendimento conv-1791204593834 finalizado com sucesso',
      ipAddress: '10.12.199.3',
      severity: 'info',
    },
    {
      id: 'log-03',
      timestamp: '2026-10-05T09:48:50Z',
      operatorName: 'Sistema Go Hub',
      operatorId: 'system',
      action: 'RESET_HISTORICO',
      resource: 'Todas as conversas e históricos foram limpos para teste',
      ipAddress: '127.0.0.1',
      severity: 'warning',
    },
    {
      id: 'log-04',
      timestamp: '2026-10-05T09:41:50Z',
      operatorName: 'Marcos Suporte',
      operatorId: 'op-01',
      action: 'LOGIN_OPERADOR',
      resource: 'Sessão autenticada via token seguro no Painel Web',
      ipAddress: '10.12.199.3',
      severity: 'security',
    },
    {
      id: 'log-05',
      timestamp: '2026-10-05T09:12:30Z',
      operatorName: 'Ana Lima',
      operatorId: 'op-02',
      action: 'GERACAO_BOLETO_PIX',
      resource: 'Boleto #8491 gerado via integração ERP',
      ipAddress: '10.12.199.14',
      severity: 'info',
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');

  const filtered = logs.filter(
    (l) =>
      l.operatorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.ipAddress.includes(searchTerm)
  );

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR');
    } catch {
      return iso;
    }
  };

  const getSeverityBadge = (sev: AuditLogItem['severity']) => {
    switch (sev) {
      case 'security':
        return (
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center gap-1 w-fit">
            <Lock className="w-2.5 h-2.5" />
            Segurança
          </span>
        );
      case 'warning':
        return (
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center gap-1 w-fit">
            <AlertTriangle className="w-2.5 h-2.5" />
            Atenção
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center gap-1 w-fit">
            <Info className="w-2.5 h-2.5" />
            Operação
          </span>
        );
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Auditoria & Trilha de Segurança
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Registro imutável de todas as ações de operadores, acessos ao ERP e alterações no CRM.
          </p>
        </div>

        <button
          onClick={() => alert('Log de auditoria exportado com assinatura de integridade!')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exportar Relatório de Auditoria</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por operador, IP, ação ou detalhe..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none"
          />
        </div>

        <span className="text-xs text-slate-500">
          Registros: <strong className="text-slate-800">{filtered.length}</strong> eventos
        </span>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Operador</th>
                <th className="py-3 px-4">Ação</th>
                <th className="py-3 px-4">Detalhes da Ação</th>
                <th className="py-3 px-4">Endereço IP</th>
                <th className="py-3 px-4 text-right">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-500">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-800">
                    {log.operatorName}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-mono font-bold text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-md truncate">
                    {log.resource}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">
                    {log.ipAddress}
                  </td>
                  <td className="py-3 px-4 text-right">{getSeverityBadge(log.severity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

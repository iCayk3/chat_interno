import React, { useState, useEffect } from 'react';
import type { Conversation } from '../types/chat';
import type { RBXClient, RBXFinancialSummary } from '../types/crm';
import { api } from '../services/api';
import {
  DollarSign,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Wifi,
  MapPin,
  Zap,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface CustomerInfoSidebarProps {
  conversation: Conversation | null;
  onSendPixToChat?: (pixCode: string) => void;
}

export const CustomerInfoSidebar: React.FC<CustomerInfoSidebarProps> = ({
  conversation,
  onSendPixToChat,
}) => {
  const [rbxClient, setRbxClient] = useState<RBXClient | null>(null);
  const [financial, setFinancial] = useState<RBXFinancialSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedPixId, setCopiedPixId] = useState<number | null>(null);
  const [promessaSuccessMsg, setPromessaSuccessMsg] = useState<string | null>(null);
  const [isProcessingPromessa, setIsProcessingPromessa] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Busca dados no ERP RBX sempre que o cliente ou conversa mudar
  useEffect(() => {
    if (conversation) {
      loadRbxData();
    } else {
      setRbxClient(null);
      setFinancial(null);
    }
  }, [conversation?.id, conversation?.clientName]);

  const loadRbxData = async () => {
    if (!conversation) return;
    setLoading(true);
    setError(null);
    setPromessaSuccessMsg(null);

    try {
      // 1. Busca cadastro do cliente no RBX pelo documento ou identificador
      const searchKey = conversation.clientName;
      const client = await api.searchRbxCustomer(searchKey);
      setRbxClient(client);

      // 2. Busca faturas e situação financeira no RBX
      if (client?.codigo) {
        const fin = await api.getRbxFinancial(client.codigo, client.cpfCnpj);
        setFinancial(fin);
      }
    } catch (err: any) {
      console.warn('[RBX Sidebar] Aviso ao consultar RBX:', err.message);
      // Se falhar a busca por nome, tenta fallback genérico com identificador
      try {
        const client = await api.searchRbxCustomer('12345678901');
        setRbxClient(client);
        const fin = await api.getRbxFinancial(client.codigo, client.cpfCnpj);
        setFinancial(fin);
      } catch {
        setError('Não foi possível obter dados do RBX no momento.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPix = async (docId: number) => {
    try {
      const res = await api.getRbxPix(docId);
      if (res.pixCopiaCola) {
        await navigator.clipboard.writeText(res.pixCopiaCola);
        setCopiedPixId(docId);
        setTimeout(() => setCopiedPixId(null), 3000);

        if (onSendPixToChat) {
          onSendPixToChat(res.pixCopiaCola);
        }
      }
    } catch {
      alert('Não foi possível obter o código Pix do boleto.');
    }
  };

  const handleOpenBoleto = async (docId: number) => {
    try {
      const res = await api.getRbxBoleto(docId);
      if (res.boletoLink) {
        window.open(res.boletoLink, '_blank');
      }
    } catch {
      alert('Não foi possível obter o link do boleto.');
    }
  };

  const handlePromessaPagamento = async (docId: number) => {
    if (!rbxClient) return;
    if (
      !window.confirm(
        'Deseja registrar o Aviso de Pagamento no RBX? A conexão será liberada em confiança por 48 horas.'
      )
    ) {
      return;
    }

    setIsProcessingPromessa(true);
    try {
      const res = await api.sendRbxPromessa(rbxClient.codigo, docId);
      setPromessaSuccessMsg(res.message || 'Desbloqueio em confiança realizado!');
      // Atualiza status do cliente para online
      setRbxClient((prev) => (prev ? { ...prev, conexaoStatus: 'online' } : null));
      setTimeout(() => setPromessaSuccessMsg(null), 6000);
    } catch (err: any) {
      alert(err.message || 'Erro ao registrar promessa no RBX');
    } finally {
      setIsProcessingPromessa(false);
    }
  };

  if (!conversation) return null;

  return (
    <div className="w-84 h-full bg-white border-l border-slate-200 p-4 flex flex-col gap-4 shrink-0 overflow-y-auto">
      {/* Header do Cliente */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-xs shrink-0">
          {(rbxClient?.nome || conversation.clientName).charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-slate-900 text-sm truncate">
              {rbxClient?.nome || conversation.clientName}
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 font-mono truncate">
            {rbxClient ? `RBX #${rbxClient.codigo} • ${rbxClient.cpfCnpj}` : conversation.clientId}
          </p>
        </div>
        <button
          onClick={loadRbxData}
          disabled={loading}
          className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
          title="Recarregar dados no RBX"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Banner de Status da Conexão no RBX */}
      {rbxClient && (
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Status da Conexão:</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                rbxClient.conexaoStatus === 'online'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : rbxClient.conexaoStatus === 'reducao'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <Wifi className="w-3 h-3" />
              {rbxClient.conexaoStatus === 'online'
                ? 'ONLINE / ATIVO'
                : rbxClient.conexaoStatus === 'reducao'
                ? 'REDUÇÃO DE VELOCIDADE'
                : 'BLOQUEADO'}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">Contrato / Plano:</span>
            <span className="font-semibold text-slate-800 text-right truncate max-w-[150px]">
              {rbxClient.contratoDescricao || 'Fibra 600 Mega'}
            </span>
          </div>

          <div className="flex items-start gap-1.5 pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span className="leading-tight">
              {rbxClient.endereco}, {rbxClient.numero} - {rbxClient.bairro}, {rbxClient.cidade}
            </span>
          </div>
        </div>
      )}

      {/* Notificação de Sucesso da Promessa */}
      {promessaSuccessMsg && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-tight font-medium">{promessaSuccessMsg}</p>
        </div>
      )}

      {/* Alerta de Erro */}
      {error && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="leading-tight font-medium">{error}</p>
        </div>
      )}

      {/* Painel Financeiro do RBX Soft */}
      <div className="space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            <span>Financeiro (RBX ISP)</span>
          </div>
          {financial && (
            <span
              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                financial.overdueCount > 0
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {financial.overdueCount > 0
                ? `${financial.overdueCount} em atraso`
                : 'Adimplente'}
            </span>
          )}
        </div>

        {financial && financial.documents.length > 0 ? (
          <div className="space-y-2">
            {financial.documents.map((doc) => {
              const isOverdue = doc.status === 'vencido';
              return (
                <div
                  key={doc.id}
                  className={`p-3 rounded-xl border transition-all ${
                    isOverdue
                      ? 'bg-rose-50/40 border-rose-200 hover:border-rose-300'
                      : 'bg-slate-50 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <span className="font-bold text-slate-900 block truncate max-w-[160px]">
                        {doc.historic}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Doc: #{doc.documentNumber} • Venc: {doc.dueDate}
                      </span>
                    </div>
                    <span
                      className={`font-bold text-xs ${
                        isOverdue ? 'text-rose-700' : 'text-slate-900'
                      }`}
                    >
                      R$ {doc.value.toFixed(2)}
                    </span>
                  </div>

                  {/* Ações Rápidas do Atendente */}
                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center gap-1.5">
                    {/* Botão Copiar PIX */}
                    <button
                      onClick={() => handleCopyPix(doc.id)}
                      className="flex-1 py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-[10px] flex items-center justify-center gap-1 transition-colors shadow-xs"
                      title="Copiar código Pix Copia e Cola"
                    >
                      {copiedPixId === doc.id ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar PIX</span>
                        </>
                      )}
                    </button>

                    {/* Botão Boleto PDF */}
                    <button
                      onClick={() => handleOpenBoleto(doc.id)}
                      className="p-1 px-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg font-semibold text-[10px] flex items-center gap-1 transition-colors"
                      title="Abrir 2ª via do boleto em PDF"
                    >
                      <ExternalLink className="w-3 h-3 text-slate-500" />
                      <span>PDF</span>
                    </button>

                    {/* Botão Promessa de Pagamento se estiver vencido */}
                    {isOverdue && (
                      <button
                        onClick={() => handlePromessaPagamento(doc.id)}
                        disabled={isProcessingPromessa}
                        className="py-1 px-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg font-semibold text-[10px] flex items-center gap-1 transition-colors shadow-xs"
                        title="Liberar conexão temporariamente por 48 horas"
                      >
                        <Zap className="w-3 h-3" />
                        <span>Desbloquear</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 bg-slate-50 rounded-xl text-center text-slate-400 border border-slate-100 text-[11px]">
            Nenhum título em aberto localizado no RBX.
          </div>
        )}
      </div>

      {/* Dados do Atendimento */}
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Departamento:</span>
          <span className="font-semibold text-slate-800">{conversation.department || 'Geral'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Atendente:</span>
          <span className="font-semibold text-slate-800">
            {conversation.operator?.name || 'Não atribuído'}
          </span>
        </div>
      </div>

      {/* Anotações Internas */}
      <div className="space-y-1.5 text-xs mt-auto">
        <label className="text-slate-400 uppercase font-bold text-[10px] tracking-wider block">
          Anotações Internas (Não visível ao cliente)
        </label>
        <textarea
          placeholder="Escreva observações sobre o atendimento ou cliente..."
          className="w-full h-20 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 resize-none transition-all"
        />
      </div>
    </div>
  );
};

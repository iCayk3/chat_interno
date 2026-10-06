import React, { useState, useEffect } from 'react';
import type { Conversation } from '../types/chat';
import type { RBXClient, RBXFinancialSummary, RBXUnpaidDocument, NetworkOlt } from '../types/crm';
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
  QrCode,
  X,
  FileText,
  Send,
  Clock,
  Loader2,
  Network,
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
  const [pixQrCodeModalData, setPixQrCodeModalData] = useState<{
    docId: number;
    docHistoric: string;
    value: number;
    pixCode: string;
    qrCodeBase64: string;
  } | null>(null);
  const [loadingPixQrDocId, setLoadingPixQrDocId] = useState<number | null>(null);

  // Modal de confirmação para download e envio do boleto PDF no chat
  const [boletoConfirmModal, setBoletoConfirmModal] = useState<RBXUnpaidDocument | null>(null);
  const [isSendingBoleto, setIsSendingBoleto] = useState(false);
  const [boletoSuccessMsg, setBoletoSuccessMsg] = useState<string | null>(null);

  // Infraestrutura de Rede (FTTH: OLT / PON / CTO)
  const [olt, setOlt] = useState('');
  const [pon, setPon] = useState('');
  const [cto, setCto] = useState('');
  const [isSavingNetwork, setIsSavingNetwork] = useState(false);
  const [networkSuccessMsg, setNetworkSuccessMsg] = useState<string | null>(null);
  const [networkTree, setNetworkTree] = useState<NetworkOlt[]>([]);

  // Carrega topologia de rede cadastrada em Configurações > Rede
  useEffect(() => {
    api.getNetworkTree().then(setNetworkTree).catch(() => {});
  }, []);

  // Busca dados no ERP RBX e sincroniza campos sempre que a conversa mudar
  useEffect(() => {
    if (conversation) {
      loadRbxData();
      setOlt(conversation.olt || '');
      setPon(conversation.pon || '');
      setCto(conversation.cto || '');
      setNetworkSuccessMsg(null);

      // Se a conversa não tem OLT ou CTO preenchida, mas tem CPF, busca a CTO salva vinculada a este CPF no banco
      const cleanCpf = (conversation.cpfCnpj || '').replace(/\D/g, '');
      if (cleanCpf && (!conversation.olt || !conversation.cto)) {
        api.getCustomerNetwork(cleanCpf).then((net) => {
          if (net && (net.cto || net.olt)) {
            if (!conversation.olt && net.olt) setOlt(net.olt);
            if (!conversation.pon && net.pon) setPon(net.pon);
            if (!conversation.cto && net.cto) setCto(net.cto);
          }
        }).catch(() => {});
      }
    } else {
      setRbxClient(null);
      setFinancial(null);
      setOlt('');
      setPon('');
      setCto('');
      setNetworkSuccessMsg(null);
    }
  }, [
    conversation?.id,
    conversation?.clientName,
    conversation?.cpfCnpj,
    conversation?.olt,
    conversation?.pon,
    conversation?.cto,
  ]);

  // Ao selecionar uma CTO, busca automaticamente na árvore de rede a qual PON e OLT ela pertence
  const handleCtoChange = (val: string) => {
    const uppercaseVal = val.toUpperCase();
    setCto(uppercaseVal);

    const trimmed = uppercaseVal.trim();
    if (trimmed && networkTree.length > 0) {
      for (const oltObj of networkTree) {
        for (const slotObj of oltObj.slots || []) {
          for (const ponObj of slotObj.pons || []) {
            const foundCto = (ponObj.ctos || []).find(
              (c) => c.name.toUpperCase() === trimmed
            );
            if (foundCto) {
              setPon(ponObj.name);
              setOlt(oltObj.name);
              return;
            }
          }
        }
      }
    }
  };

  const handleSaveNetwork = async () => {
    if (!conversation) return;
    setIsSavingNetwork(true);
    setNetworkSuccessMsg(null);
    try {
      const cleanDoc = (conversation.cpfCnpj || rbxClient?.cpfCnpj || '').replace(/\D/g, '');
      await api.updateConversationNetwork(conversation.id, {
        olt: olt.trim(),
        pon: pon.trim(),
        cto: cto.trim(),
        cpfCnpj: cleanDoc,
      });

      // Salva explicitamente a associação CPF <-> CTO no banco de dados para uso futuro
      if (cleanDoc) {
        await api.saveCustomerNetwork({
          cpfCnpj: cleanDoc,
          olt: olt.trim(),
          pon: pon.trim(),
          cto: cto.trim(),
        }).catch(() => {});
      }

      // Atualiza localmente o objeto de conversa se estiver mutável
      conversation.olt = olt.trim();
      conversation.pon = pon.trim();
      conversation.cto = cto.trim();
      setNetworkSuccessMsg('CTO vinculada ao CPF com sucesso!');
      setTimeout(() => setNetworkSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar informações de rede.');
    } finally {
      setIsSavingNetwork(false);
    }
  };

  const loadRbxData = async () => {
    if (!conversation) return;
    setLoading(true);
    setError(null);
    setPromessaSuccessMsg(null);

    try {
      // 1. Busca cadastro do cliente no RBX pelo CPF/CNPJ prioritariamente ou nome
      const searchKey = conversation.cpfCnpj || conversation.clientName;
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

        if (onSendPixToChat && conversation?.status === 'active') {
          onSendPixToChat(res.pixCopiaCola);
        }
      }
    } catch {
      alert('Não foi possível obter o código Pix do boleto.');
    }
  };

  const handleShowPixQrCode = async (docId: number, docHistoric: string, value: number) => {
    setLoadingPixQrDocId(docId);
    try {
      const res = await api.getRbxPix(docId);
      setPixQrCodeModalData({
        docId,
        docHistoric,
        value,
        pixCode: res.pixCopiaCola || '',
        qrCodeBase64: res.pixQrCode || '',
      });
    } catch (err: any) {
      alert(err.message || 'Não foi possível obter os dados do Pix no RBX.');
    } finally {
      setLoadingPixQrDocId(null);
    }
  };

  const handleOpenBoleto = async (docId: number) => {
    try {
      const res = await api.getRbxBoleto(docId);
      if (res.boletoLink) {
        window.open(res.boletoLink, '_blank');
      } else {
        alert('O servidor RBX não retornou o link do boleto.');
      }
    } catch (err: any) {
      alert(err.message || 'Não foi possível gerar o link do boleto no RBX.');
    }
  };

  const handleConfirmSendBoleto = async () => {
    if (!boletoConfirmModal || !conversation) return;

    if (conversation.status === 'waiting') {
      alert('Você precisa assumir o atendimento antes de enviar boletos no chat.');
      return;
    }

    setIsSendingBoleto(true);
    try {
      const user = api.getStoredUser();
      const res = await api.sendRbxBoletoToChat({
        conversationId: conversation.id,
        documentId: boletoConfirmModal.id,
        documentNumber: boletoConfirmModal.documentNumber,
        value: boletoConfirmModal.value,
        dueDate: boletoConfirmModal.dueDate,
        historic: boletoConfirmModal.historic,
        senderId: user?.id || 'operator',
        senderName: user?.name || 'Atendente',
      });

      setBoletoSuccessMsg(res.message || 'Boleto enviado no atendimento com sucesso!');
      setBoletoConfirmModal(null);
      setTimeout(() => setBoletoSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar boleto no chat.');
    } finally {
      setIsSendingBoleto(false);
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

      {/* Identificação de Solicitante (quando não for o próprio titular) */}
      {conversation.contactName && conversation.contactName !== conversation.clientName && (
        <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-3 text-xs text-blue-900 flex flex-col gap-1">
          <div className="flex items-center justify-between text-blue-700">
            <span className="font-semibold text-[11px] uppercase tracking-wider">Solicitante no Chat</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">Terceiro</span>
          </div>
          <div className="font-bold text-slate-800 text-sm">{conversation.contactName}</div>
          <div className="text-[11px] text-slate-500">Falando em nome do titular cadastrado no RBX.</div>
        </div>
      )}

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

      {/* Notificação de Sucesso do Envio de Boleto */}
      {boletoSuccessMsg && (
        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-xs flex items-start gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-tight font-medium">{boletoSuccessMsg}</p>
        </div>
      )}

      {/* Alerta de Erro */}
      {error && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="leading-tight font-medium">{error}</p>
        </div>
      )}

      {/* Infraestrutura de Rede (FTTH: OLT, PON, CTO) */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
            <Network className="w-3.5 h-3.5 text-blue-600" />
            <span>Rede FTTH (OLT / PON / CTO)</span>
          </div>
          {(olt || cto) && (
            <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
              Mapeado
            </span>
          )}
        </div>

        {networkSuccessMsg && (
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="font-medium">{networkSuccessMsg}</span>
          </div>
        )}

        {/* Datalists da topologia de rede cadastrada */}
        {(() => {
          const matchingOlt = networkTree.find((o) => o.name.toUpperCase() === olt.trim().toUpperCase());
          const availablePons = matchingOlt
            ? (matchingOlt.slots || []).flatMap((s) => s.pons || [])
            : networkTree.flatMap((o) => (o.slots || []).flatMap((s) => s.pons || []));
          const matchingPon = availablePons.find((p) => p.name.toUpperCase() === pon.trim().toUpperCase());
          const availableCtos = matchingPon
            ? (matchingPon.ctos || [])
            : availablePons.flatMap((p) => p.ctos || []);

          return (
            <>
              <datalist id="customer-olt-list">
                {networkTree.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.model ? `${o.model} (${o.location || 'FTTH'})` : o.location}
                  </option>
                ))}
              </datalist>

              <datalist id="customer-pon-list">
                {availablePons.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.sfpType ? `SFP ${p.sfpType}` : 'Porta PON'}
                  </option>
                ))}
              </datalist>

              <datalist id="customer-cto-list">
                {availableCtos.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.address ? `${c.splitterRatio || '1:16'} • ${c.address}` : c.splitterRatio}
                  </option>
                ))}
              </datalist>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 font-semibold uppercase block mb-1">
                    OLT
                  </label>
                  <input
                    type="text"
                    list="customer-olt-list"
                    value={olt}
                    onChange={(e) => setOlt(e.target.value.toUpperCase())}
                    placeholder="Ex: OLT-01"
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-800 focus:outline-none focus:border-blue-500 transition-colors uppercase"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-semibold uppercase block mb-1">
                    PON
                  </label>
                  <input
                    type="text"
                    list="customer-pon-list"
                    value={pon}
                    onChange={(e) => setPon(e.target.value.toUpperCase())}
                    placeholder="Ex: 1/2"
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-800 focus:outline-none focus:border-blue-500 transition-colors uppercase"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-semibold uppercase block mb-1">
                    CTO
                  </label>
                  <input
                    type="text"
                    list="customer-cto-list"
                    value={cto}
                    onChange={(e) => handleCtoChange(e.target.value)}
                    placeholder="Ex: CTO-14"
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-800 focus:outline-none focus:border-blue-500 transition-colors uppercase"
                  />
                </div>
              </div>
            </>
          );
        })()}

        <div className="pt-1 flex items-center justify-between gap-2">
          <p className="text-[10px] text-slate-400 leading-tight">
            Salvo no banco para filtros de comunicados e manutenção.
          </p>
          <button
            type="button"
            onClick={handleSaveNetwork}
            disabled={isSavingNetwork}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold text-[10px] flex items-center gap-1 transition-colors shadow-xs shrink-0 cursor-pointer"
            title="Salvar OLT, PON e CTO no banco de dados"
          >
            {isSavingNetwork ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Check className="w-3 h-3" />
                <span>Salvar</span>
              </>
            )}
          </button>
        </div>
      </div>

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
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center gap-1.5 flex-wrap">
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

                      {/* Botão Ver QR Code */}
                      <button
                        onClick={() => handleShowPixQrCode(doc.id, doc.historic, doc.value)}
                        disabled={loadingPixQrDocId === doc.id}
                        className="py-1 px-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg font-semibold text-[10px] flex items-center gap-1 transition-colors"
                        title="Ver QR Code do Pix em tela cheia"
                      >
                        <QrCode className="w-3 h-3 text-blue-600" />
                        <span>QR Code</span>
                      </button>

                      {/* Botão Boleto PDF Oficial (Confirmação e Envio no Chat) */}
                      <button
                        onClick={() => setBoletoConfirmModal(doc)}
                        className="py-1 px-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg font-semibold text-[10px] flex items-center gap-1 transition-colors"
                        title="Enviar 2ª via oficial do boleto em PDF no chat"
                      >
                        <FileText className="w-3 h-3 text-rose-500" />
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

      {/* Modal Visual de QR Code do Pix (RBX V2) */}
      {pixQrCodeModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-full flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-600" />
                <h4 className="font-bold text-slate-900 text-sm">QR Code do Pix</h4>
              </div>
              <button
                onClick={() => setPixQrCodeModalData(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center">
              <p className="text-xs text-slate-500 font-medium truncate max-w-[260px]">
                {pixQrCodeModalData.docHistoric}
              </p>
              <p className="text-base font-extrabold text-blue-600 mt-0.5">
                R$ {pixQrCodeModalData.value.toFixed(2)}
              </p>
            </div>

            {pixQrCodeModalData.qrCodeBase64 ? (
              <div className="p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-inner">
                <img
                  src={`data:image/png;base64,${pixQrCodeModalData.qrCodeBase64}`}
                  alt="QR Code Pix RBX"
                  className="w-48 h-48 object-contain"
                />
              </div>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 text-center">
                QR Code não disponível para este título. Utilize a chave Pix Copia e Cola.
              </div>
            )}

            {pixQrCodeModalData.pixCode && (
              <div className="w-full flex flex-col gap-2">
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-[10px] font-mono text-slate-600 break-all max-h-16 overflow-y-auto">
                  {pixQrCodeModalData.pixCode}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (pixQrCodeModalData.pixCode) {
                        await navigator.clipboard.writeText(pixQrCodeModalData.pixCode);
                        alert('Pix Copia e Cola copiado com sucesso!');
                      }
                    }}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Pix</span>
                  </button>

                  {onSendPixToChat && (
                    <button
                      onClick={() => {
                        if (conversation?.status === 'waiting') {
                          alert('Você precisa assumir o atendimento antes de enviar informações no chat.');
                          return;
                        }
                        if (pixQrCodeModalData.pixCode) {
                          onSendPixToChat(pixQrCodeModalData.pixCode);
                          setPixQrCodeModalData(null);
                        }
                      }}
                      disabled={conversation?.status === 'waiting'}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                    >
                      <span>Enviar no Chat</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Modal de Confirmação para Download e Envio do Boleto PDF */}
      {boletoConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 flex flex-col gap-4 relative animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Enviar 2ª Via de Boleto</h3>
                  <p className="text-[11px] text-slate-500">Confirmação de envio no atendimento</p>
                </div>
              </div>
              <button
                onClick={() => setBoletoConfirmModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                disabled={isSendingBoleto}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Pergunta de Confirmação */}
            <p className="text-xs text-slate-600 leading-relaxed">
              Deseja realmente baixar e enviar a 2ª via deste boleto no chat para o cliente{' '}
              <strong className="text-slate-900">{conversation.clientName}</strong>?
            </p>

            {/* Card com Detalhes do Boleto */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Documento:</span>
                <span className="font-mono font-bold text-slate-800">#{boletoConfirmModal.documentNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Histórico:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                  {boletoConfirmModal.historic}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Vencimento:</span>
                <span className="font-semibold text-slate-800">{boletoConfirmModal.dueDate}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                <span className="text-slate-500 font-medium">Valor Total:</span>
                <span className="text-sm font-extrabold text-slate-900">
                  R$ {boletoConfirmModal.value.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Aviso caso o atendimento ainda esteja na fila aguardando operador */}
            {conversation?.status === 'waiting' && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-[11px] text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="leading-tight">
                  <span className="font-bold">Atendimento na Fila:</span> Você precisa <strong>assumir o atendimento</strong> antes de poder enviar arquivos ou mensagens ao cliente.
                </div>
              </div>
            )}

            {/* Aviso de Armazenamento e Expiração após 1h */}
            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-[11px] text-amber-800">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-tight">
                <span className="font-bold">Armazenamento temporário:</span> O PDF oficial será baixado do ERP RBX e disponibilizado na conversa. Para não ocupar espaço no disco, o arquivo será <strong>automaticamente excluído em 1 hora</strong>.
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBoletoConfirmModal(null)}
                disabled={isSendingBoleto}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => handleOpenBoleto(boletoConfirmModal.id)}
                disabled={isSendingBoleto}
                className="py-2.5 px-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                title="Apenas abrir o link oficial do PDF no navegador"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ver PDF</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmSendBoleto}
                disabled={isSendingBoleto || conversation?.status === 'waiting'}
                className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                {isSendingBoleto ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Baixando & Enviando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Confirmar e Enviar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

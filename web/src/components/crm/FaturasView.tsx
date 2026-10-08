import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  QrCode,
  FileText,
  DollarSign,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  X,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../services/api';
import type { NativeInvoice, NativeCustomer } from '../../types/crm';

export const FaturasView: React.FC = () => {
  const [invoices, setInvoices] = useState<NativeInvoice[]>([]);
  const [customers, setCustomers] = useState<NativeCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchDoc, setSearchDoc] = useState('');

  // Modal Pix QR Code
  const [selectedPixInvoice, setSelectedPixInvoice] = useState<NativeInvoice | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [generatingPixId, setGeneratingPixId] = useState<string | null>(null);

  // Modal Boleto
  const [selectedBoletoInvoice, setSelectedBoletoInvoice] = useState<NativeInvoice | null>(null);
  const [generatingBoletoId, setGeneratingBoletoId] = useState<string | null>(null);
  const [copiedBarcode, setCopiedBarcode] = useState(false);

  // Modal Nova Fatura
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newInvoiceData, setNewInvoiceData] = useState({
    customerId: '',
    amount: 99.9,
    dueDate: new Date().toISOString().split('T')[0],
    description: 'Mensalidade Fibra Ótica',
    paymentMethod: 'pix',
  });
  const [creating, setCreating] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invList, custList] = await Promise.all([
        api.getNativeInvoices({
          cpfCnpj: searchDoc.trim(),
          status: statusFilter,
        }),
        api.getNativeCustomers(),
      ]);
      setInvoices(invList);
      setCustomers(custList);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao carregar faturas' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Gerar Pix Mercado Pago
  const handleOpenPix = async (inv: NativeInvoice) => {
    if (inv.pixQrCode && inv.pixQrCodeBase64) {
      setSelectedPixInvoice(inv);
      return;
    }
    setGeneratingPixId(inv.id);
    try {
      const res = await api.generateNativePix(inv.id);
      const updated = { ...inv, pixQrCode: res.pixQrCode, pixQrCodeBase64: res.pixQrCodeBase64 };
      setSelectedPixInvoice(updated);
      setInvoices((prev) => prev.map((item) => (item.id === inv.id ? updated : item)));
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao gerar Pix no Mercado Pago' });
    } finally {
      setGeneratingPixId(null);
    }
  };

  // Gerar Boleto Mercado Pago
  const handleOpenBoleto = async (inv: NativeInvoice) => {
    if (inv.boletoUrl) {
      setSelectedBoletoInvoice(inv);
      return;
    }
    setGeneratingBoletoId(inv.id);
    try {
      const res = await api.generateNativeBoleto(inv.id);
      const updated = { ...inv, boletoUrl: res.boletoUrl, boletoBarcode: res.boletoBarcode };
      setSelectedBoletoInvoice(updated);
      setInvoices((prev) => prev.map((item) => (item.id === inv.id ? updated : item)));
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao emitir Boleto no Mercado Pago' });
    } finally {
      setGeneratingBoletoId(null);
    }
  };

  // Baixa manual
  const handleManualPayment = async (inv: NativeInvoice) => {
    if (!window.confirm(`Confirmar recebimento manual de R$ ${inv.amount.toFixed(2)} da fatura ${inv.id}?`)) {
      return;
    }
    try {
      const updated = await api.payNativeInvoiceManual(inv.id);
      setInvoices((prev) => prev.map((item) => (item.id === inv.id ? updated : item)));
      setFeedback({ type: 'success', message: 'Fatura baixada como PAGA com sucesso!' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao registrar baixa manual' });
    }
  };

  const handleCreateNewInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFeedback(null);
    try {
      const inv = await api.createNativeInvoice(newInvoiceData);
      if (newInvoiceData.paymentMethod === 'pix') {
        await api.generateNativePix(inv.id).catch(() => {});
      } else if (newInvoiceData.paymentMethod === 'boleto') {
        await api.generateNativeBoleto(inv.id).catch(() => {});
      }
      setIsNewModalOpen(false);
      setFeedback({ type: 'success', message: 'Fatura emitida com sucesso!' });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao emitir fatura' });
    } finally {
      setCreating(false);
    }
  };

  const copyPixCode = () => {
    if (!selectedPixInvoice?.pixQrCode) return;
    navigator.clipboard.writeText(selectedPixInvoice.pixQrCode);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2000);
  };

  const copyBarcode = () => {
    if (!selectedBoletoInvoice?.boletoBarcode) return;
    navigator.clipboard.writeText(selectedBoletoInvoice.boletoBarcode);
    setCopiedBarcode(true);
    setTimeout(() => setCopiedBarcode(false), 2000);
  };

  // Totais
  const totalPending = invoices
    .filter((i) => i.status === 'pending' || i.status === 'overdue')
    .reduce((acc, curr) => acc + curr.amount, 0);
  const totalPaid = invoices
    .filter((i) => i.status === 'paid')
    .reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Faturas & Cobranças Mercado Pago
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
              Pix & Boleto Nativo
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Controle de cobranças emitidas, geração de Pix dinâmico, boletos e baixa automática via Webhooks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>
          <button
            onClick={() => {
              setNewInvoiceData({
                customerId: customers[0]?.id || '',
                amount: 99.9,
                dueDate: new Date().toISOString().split('T')[0],
                description: 'Mensalidade Fibra Ótica',
                paymentMethod: 'pix',
              });
              setIsNewModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Cobrança</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">A Receber</span>
            <div className="text-xl font-bold text-slate-800">R$ {totalPending.toFixed(2)}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Total Recebido</span>
            <div className="text-xl font-bold text-emerald-700">R$ {totalPaid.toFixed(2)}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Total de Cobranças</span>
            <div className="text-xl font-bold text-slate-800">{invoices.length}</div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center gap-3">
        <form onSubmit={handleSearch} className="flex-1 w-full relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchDoc}
            onChange={(e) => setSearchDoc(e.target.value)}
            placeholder="Filtrar por CPF ou CNPJ..."
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
          />
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden"
          >
            <option value="">Todos os Status</option>
            <option value="pending">Pendentes</option>
            <option value="paid">Pagas</option>
            <option value="overdue">Vencidas</option>
            <option value="canceled">Canceladas</option>
          </select>
        </div>
      </div>

      {/* Tabela de Faturas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="text-xs font-medium">Carregando faturas...</span>
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <CreditCard className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">Nenhuma fatura encontrada</p>
            <p className="text-xs text-slate-400">Clique em "Nova Cobrança" para emitir sua primeira fatura.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Fatura / Descrição</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Vencimento</th>
                  <th className="py-3 px-4">Valor</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Mercado Pago</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{inv.description}</div>
                      <span className="text-[11px] text-slate-400 font-mono">#{inv.id}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-700">{inv.customerName || 'Cliente'}</div>
                      <div className="font-mono text-[11px] text-slate-400">{inv.cpfCnpj}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {inv.dueDate}
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-700 text-sm">
                      R$ {inv.amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      {inv.status === 'paid' && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          Pago
                        </span>
                      )}
                      {inv.status === 'pending' && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          Aguardando
                        </span>
                      )}
                      {inv.status === 'overdue' && (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                          Vencido
                        </span>
                      )}
                      {inv.status === 'canceled' && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                          Cancelado
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {inv.mpPaymentId ? (
                        <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          MP #{inv.mpPaymentId}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Não gerado</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {inv.status !== 'paid' && (
                          <>
                            {/* Botão Pix */}
                            <button
                              onClick={() => handleOpenPix(inv)}
                              disabled={generatingPixId === inv.id}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] flex items-center gap-1 transition-colors"
                              title="Visualizar Pix (QR Code)"
                            >
                              {generatingPixId === inv.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <QrCode className="w-3.5 h-3.5" />
                              )}
                              <span>Pix</span>
                            </button>

                            {/* Botão Boleto */}
                            <button
                              onClick={() => handleOpenBoleto(inv)}
                              disabled={generatingBoletoId === inv.id}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center gap-1 transition-colors"
                              title="Visualizar Boleto"
                            >
                              {generatingBoletoId === inv.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FileText className="w-3.5 h-3.5" />
                              )}
                              <span>Boleto</span>
                            </button>

                            {/* Baixa Manual */}
                            <button
                              onClick={() => handleManualPayment(inv)}
                              className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Dar Baixa Manual"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {inv.status === 'paid' && (
                          <span className="text-emerald-600 text-xs font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" /> Pago
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Pix QR Code */}
      {selectedPixInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden text-center p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-bold text-slate-800 text-sm">Cobrança Pix - Mercado Pago</span>
              <button onClick={() => setSelectedPixInvoice(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h3 className="font-bold text-slate-800 text-base">{selectedPixInvoice.customerName}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{selectedPixInvoice.description}</p>
              <div className="text-2xl font-bold text-emerald-600 mt-2">
                R$ {selectedPixInvoice.amount.toFixed(2)}
              </div>
            </div>

            {/* Imagem do QR Code */}
            {selectedPixInvoice.pixQrCodeBase64 ? (
              <div className="p-3 bg-slate-50 rounded-xl inline-block border border-slate-200 shadow-2xs">
                <img
                  src={`data:image/png;base64,${selectedPixInvoice.pixQrCodeBase64}`}
                  alt="QR Code Pix"
                  className="w-48 h-48 mx-auto object-contain rounded-lg"
                />
              </div>
            ) : (
              <div className="p-8 bg-slate-50 rounded-xl text-xs text-slate-400">
                QR Code não disponível
              </div>
            )}

            {/* Pix Copia e Cola */}
            {selectedPixInvoice.pixQrCode && (
              <div className="space-y-2">
                <button
                  onClick={copyPixCode}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                >
                  {copiedPix ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedPix ? 'Código Pix Copiado!' : 'Copiar Código Pix'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Boleto */}
      {selectedBoletoInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-bold text-slate-800 text-sm">Boleto Bancário - Mercado Pago</span>
              <button onClick={() => setSelectedBoletoInvoice(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h3 className="font-bold text-slate-800 text-base">{selectedBoletoInvoice.customerName}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{selectedBoletoInvoice.description}</p>
              <div className="text-xl font-bold text-blue-700 mt-1">
                R$ {selectedBoletoInvoice.amount.toFixed(2)} - Venc. {selectedBoletoInvoice.dueDate}
              </div>
            </div>

            {selectedBoletoInvoice.boletoBarcode && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">Linha Digitável:</span>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-700 break-all select-all">
                  {selectedBoletoInvoice.boletoBarcode}
                </div>
                <button
                  onClick={copyBarcode}
                  className="w-full py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors mt-2"
                >
                  {copiedBarcode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedBarcode ? 'Código de Barras Copiado!' : 'Copiar Linha Digitável'}</span>
                </button>
              </div>
            )}

            {selectedBoletoInvoice.boletoUrl && (
              <a
                href={selectedBoletoInvoice.boletoUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors block text-center"
              >
                <ExternalLink className="w-4 h-4 inline" />
                <span>Abrir e Baixar Boleto em PDF</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Modal Nova Fatura */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Nova Cobrança Manual</span>
              </h3>
              <button onClick={() => setIsNewModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewInvoice} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Selecionar Cliente *</label>
                <select
                  required
                  value={newInvoiceData.customerId}
                  onChange={(e) => {
                    const cust = customers.find((c) => c.id === e.target.value);
                    setNewInvoiceData((prev) => ({
                      ...prev,
                      customerId: e.target.value,
                      amount: cust?.monthlyPrice || prev.amount,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden"
                >
                  <option value="">Selecione o cliente...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.cpfCnpj})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
                <input
                  type="text"
                  required
                  value={newInvoiceData.description}
                  onChange={(e) => setNewInvoiceData({ ...newInvoiceData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newInvoiceData.amount}
                    onChange={(e) => setNewInvoiceData({ ...newInvoiceData, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-emerald-700 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data Vencimento *</label>
                  <input
                    type="date"
                    required
                    value={newInvoiceData.dueDate}
                    onChange={(e) => setNewInvoiceData({ ...newInvoiceData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Método de Cobrança</label>
                <select
                  value={newInvoiceData.paymentMethod}
                  onChange={(e) => setNewInvoiceData({ ...newInvoiceData, paymentMethod: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden"
                >
                  <option value="pix">Pix (Mercado Pago)</option>
                  <option value="boleto">Boleto Bancário (Mercado Pago)</option>
                  <option value="manual">Manual / Dinheiro</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                  <span>Emitir Cobrança</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

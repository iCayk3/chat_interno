import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Save,
  DollarSign,
  Phone,
  Mail,
} from 'lucide-react';
import { api } from '../../services/api';
import type { NativeCustomer, NativePlan } from '../../types/crm';

export const ClientesView: React.FC = () => {
  const [customers, setCustomers] = useState<NativeCustomer[]>([]);
  const [plans, setPlans] = useState<NativePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');

  // Modal de Cadastro / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<NativeCustomer | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    cpfCnpj: '',
    email: '',
    phone: '',
    address: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: 'SP',
    postalCode: '',
    planId: '',
    monthlyPrice: 0,
    dueDay: 10,
    notes: '',
  });

  // Modal de Emissão Rápida de Fatura
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedCustomerForInvoice, setSelectedCustomerForInvoice] = useState<NativeCustomer | null>(null);
  const [invoiceAmount, setInvoiceAmount] = useState(0);
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceDesc, setInvoiceDesc] = useState('');
  const [invoiceMethod, setInvoiceMethod] = useState<'pix' | 'boleto'>('pix');
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [custList, planList] = await Promise.all([
        api.getNativeCustomers({
          search: search.trim(),
          status: statusFilter,
          planId: planFilter,
        }),
        api.getNativePlans(),
      ]);
      setCustomers(custList);
      setPlans(planList);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao carregar clientes' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, planFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const openNewCustomerModal = () => {
    setEditingCustomer(null);
    setFormData({
      name: '',
      cpfCnpj: '',
      email: '',
      phone: '',
      address: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: 'SP',
      postalCode: '',
      planId: plans[0]?.id || '',
      monthlyPrice: plans[0]?.price || 0,
      dueDay: 10,
      notes: '',
    });
    setIsModalOpen(true);
  };

  const openEditCustomerModal = (c: NativeCustomer) => {
    setEditingCustomer(c);
    setFormData({
      name: c.name,
      cpfCnpj: c.cpfCnpj,
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      number: c.number || '',
      complement: c.complement || '',
      neighborhood: c.neighborhood || '',
      city: c.city || '',
      state: c.state || 'SP',
      postalCode: c.postalCode || '',
      planId: c.planId || '',
      monthlyPrice: c.monthlyPrice,
      dueDay: c.dueDay || 10,
      notes: c.notes || '',
    });
    setIsModalOpen(true);
  };

  const handlePlanChange = (planId: string) => {
    const selectedPlan = plans.find((p) => p.id === planId);
    setFormData((prev) => ({
      ...prev,
      planId,
      monthlyPrice: selectedPlan ? selectedPlan.price : prev.monthlyPrice,
    }));
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      if (editingCustomer) {
        await api.updateNativeCustomer(editingCustomer.id, formData);
        setFeedback({ type: 'success', message: 'Cliente atualizado com sucesso!' });
      } else {
        await api.createNativeCustomer(formData);
        setFeedback({ type: 'success', message: 'Cliente cadastrado com sucesso!' });
      }
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao salvar cliente' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!window.confirm(`Deseja realmente excluir o cliente "${name}"? Todas as faturas associadas também serão removidas.`)) {
      return;
    }
    try {
      await api.deleteNativeCustomer(id);
      setFeedback({ type: 'success', message: 'Cliente excluído com sucesso!' });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao excluir cliente' });
    }
  };

  // Abrir modal de fatura avulsa para um cliente
  const openInvoiceModal = (c: NativeCustomer) => {
    setSelectedCustomerForInvoice(c);
    setInvoiceAmount(c.monthlyPrice || 99.9);
    // Data de vencimento baseada no dia de vencimento do cliente no próximo mês ou no mês atual
    const today = new Date();
    const due = new Date(today.getFullYear(), today.getMonth(), c.dueDay || 10);
    if (due < today) {
      due.setMonth(due.getMonth() + 1);
    }
    setInvoiceDueDate(due.toISOString().split('T')[0]);
    setInvoiceDesc(`Mensalidade ${c.planName || 'Serviço'} - Venc. ${c.dueDay || 10}`);
    setInvoiceMethod('pix');
    setIsInvoiceModalOpen(true);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForInvoice) return;
    setInvoiceSubmitting(true);
    try {
      const inv = await api.createNativeInvoice({
        customerId: selectedCustomerForInvoice.id,
        amount: Number(invoiceAmount),
        dueDate: invoiceDueDate,
        description: invoiceDesc,
        paymentMethod: invoiceMethod,
      });

      // Já gera no Mercado Pago imediatamente se for Pix ou Boleto
      if (invoiceMethod === 'pix') {
        await api.generateNativePix(inv.id).catch(() => {});
      } else if (invoiceMethod === 'boleto') {
        await api.generateNativeBoleto(inv.id).catch(() => {});
      }

      setFeedback({ type: 'success', message: 'Fatura emitida com sucesso para o cliente!' });
      setIsInvoiceModalOpen(false);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao emitir fatura' });
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Base Própria de Clientes & Assinantes
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
              Modo Nativo
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gerencie os clientes cadastrados diretamente no sistema, planos contratados e cobranças via Mercado Pago.
          </p>
        </div>

        <button
          onClick={openNewCustomerModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Novo Cliente</span>
        </button>
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
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone..."
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
          />
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden"
          >
            <option value="">Todos os Status</option>
            <option value="active">Ativos</option>
            <option value="blocked">Bloqueados</option>
            <option value="canceled">Cancelados</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="text-xs px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden"
          >
            <option value="">Todos os Planos</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="text-xs font-medium">Carregando clientes...</span>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Users className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">Nenhum cliente localizado</p>
            <p className="text-xs text-slate-400">
              {search || statusFilter ? 'Tente ajustar os filtros de busca.' : 'Clique em "Cadastrar Novo Cliente" para começar.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Cliente / Contato</th>
                  <th className="py-3 px-4">Documento</th>
                  <th className="py-3 px-4">Plano Contratado</th>
                  <th className="py-3 px-4">Mensalidade</th>
                  <th className="py-3 px-4">Vencimento</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{c.name}</div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                        {c.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {c.phone}
                          </span>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {c.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {c.cpfCnpj}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-700">
                        {c.planName || 'Sem plano'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-700">
                      R$ {c.monthlyPrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      Dia {c.dueDay}
                    </td>
                    <td className="py-3 px-4">
                      {c.status === 'active' && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          Ativo
                        </span>
                      )}
                      {c.status === 'blocked' && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          Bloqueado
                        </span>
                      )}
                      {c.status === 'canceled' && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                          Cancelado
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openInvoiceModal(c)}
                          title="Emitir Fatura (Mercado Pago)"
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditCustomerModal(c)}
                          title="Editar Cliente"
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCustomer(c.id, c.name)}
                          title="Excluir Cliente"
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Cadastro / Edição de Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                <span>{editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Nome Completo / Razão Social *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    placeholder="Ex: João Silva ou Empresa LTDA"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">CPF ou CNPJ *</label>
                  <input
                    type="text"
                    required
                    value={formData.cpfCnpj}
                    onChange={(e) => setFormData({ ...formData, cpfCnpj: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    placeholder="000.000.000-00"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Telefone / WhatsApp *</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    placeholder="(00) 00000-0000"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">E-mail para Faturas e Notificações</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    placeholder="cliente@email.com"
                  />
                </div>

                {/* Plano e Valor */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Plano / Serviço Contratado</label>
                  <select
                    value={formData.planId}
                    onChange={(e) => handlePlanChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    <option value="">Selecione um plano...</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (R$ {p.price.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Valor Mensal (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.monthlyPrice}
                      onChange={(e) => setFormData({ ...formData, monthlyPrice: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Dia Vencimento</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={formData.dueDay}
                      onChange={(e) => setFormData({ ...formData, dueDay: parseInt(e.target.value) || 10 })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Endereço */}
                <div className="md:col-span-2 pt-2 border-t border-slate-100">
                  <span className="font-bold text-slate-600 block mb-2">Endereço de Instalação / Cobrança:</span>
                </div>

                <div className="md:col-span-2 grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden"
                      placeholder="Rua / Logradouro"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={formData.number}
                      onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden"
                      placeholder="Número"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 md:col-span-2">
                  <input
                    type="text"
                    value={formData.neighborhood}
                    onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden"
                    placeholder="Bairro"
                  />
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden"
                    placeholder="Cidade"
                  />
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden uppercase"
                    placeholder="UF (ex: SP)"
                    maxLength={2}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Salvar Cliente</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Emissão Rápida de Fatura */}
      {isInvoiceModalOpen && selectedCustomerForInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>Emitir Fatura para {selectedCustomerForInvoice.name}</span>
              </h3>
              <button onClick={() => setIsInvoiceModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição da Cobrança</label>
                <input
                  type="text"
                  required
                  value={invoiceDesc}
                  onChange={(e) => setInvoiceDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Valor Total (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={invoiceAmount}
                    onChange={(e) => setInvoiceAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-emerald-700 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vencimento</label>
                  <input
                    type="date"
                    required
                    value={invoiceDueDate}
                    onChange={(e) => setInvoiceDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Método de Cobrança Principal</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInvoiceMethod('pix')}
                    className={`p-2.5 rounded-lg border font-bold text-center transition-all ${
                      invoiceMethod === 'pix'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Pix (QR Code Instantâneo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceMethod('boleto')}
                    className={`p-2.5 rounded-lg border font-bold text-center transition-all ${
                      invoiceMethod === 'boleto'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Boleto Bancário (PDF)
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={invoiceSubmitting}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {invoiceSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                  <span>Emitir Fatura</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

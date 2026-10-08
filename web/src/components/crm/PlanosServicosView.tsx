import React, { useState, useEffect } from 'react';
import {
  Wifi,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  X,
  Save,
  CheckCircle2,
  AlertCircle,
  Tag,
  ArrowUpDown,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../services/api';
import type { NativePlan } from '../../types/crm';

export const PlanosServicosView: React.FC = () => {
  const [plans, setPlans] = useState<NativePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<NativePlan | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 99.9,
    billingCycle: 'mensal',
    speedDownload: '500 Mbps',
    speedUpload: '250 Mbps',
  });

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await api.getNativePlans();
      setPlans(data);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao carregar planos' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const openNewPlanModal = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      description: '',
      price: 99.9,
      billingCycle: 'mensal',
      speedDownload: '500 Mbps',
      speedUpload: '250 Mbps',
    });
    setIsModalOpen(true);
  };

  const openEditPlanModal = (p: NativePlan) => {
    setEditingPlan(p);
    setFormData({
      name: p.name,
      description: p.description,
      price: p.price,
      billingCycle: p.billingCycle || 'mensal',
      speedDownload: p.speedDownload || '500 Mbps',
      speedUpload: p.speedUpload || '250 Mbps',
    });
    setIsModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      if (editingPlan) {
        await api.updateNativePlan(editingPlan.id, formData);
        setFeedback({ type: 'success', message: 'Plano atualizado com sucesso!' });
      } else {
        await api.createNativePlan(formData);
        setFeedback({ type: 'success', message: 'Plano cadastrado com sucesso!' });
      }
      setIsModalOpen(false);
      loadPlans();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao salvar plano' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = async (id: string, name: string) => {
    if (!window.confirm(`Deseja desativar o plano "${name}"? Os clientes já cadastrados nele não serão afetados.`)) {
      return;
    }
    try {
      await api.deleteNativePlan(id);
      setFeedback({ type: 'success', message: 'Plano desativado com sucesso!' });
      loadPlans();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao desativar plano' });
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Planos & Serviços Oferecidos
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold uppercase tracking-wider">
              Catálogo de Produtos
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Cadastre os planos de internet, produtos ou mensalidades que os clientes contratam.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadPlans}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>
          <button
            onClick={openNewPlanModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Plano</span>
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
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Grid de Planos */}
      {loading ? (
        <div className="p-16 flex items-center justify-center text-slate-500 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="text-xs font-medium">Carregando catálogo de planos...</span>
        </div>
      ) : plans.length === 0 ? (
        <div className="p-16 text-center text-slate-400 space-y-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <Wifi className="w-12 h-12 mx-auto text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Nenhum plano cadastrado ainda</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Cadastre os planos de banda larga ou serviços que sua empresa oferece para vincular aos clientes.
          </p>
          <button
            onClick={openNewPlanModal}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Cadastrar Primeiro Plano
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`bg-white p-5 rounded-2xl border transition-all flex flex-col justify-between shadow-2xs ${
                p.active ? 'border-slate-200 hover:border-blue-400' : 'border-slate-200 opacity-60 bg-slate-50'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">{p.name}</h3>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md inline-block mt-1">
                      R$ {p.price.toFixed(2)} / {p.billingCycle}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      p.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {p.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2">{p.description || 'Sem descrição detalhada.'}</p>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 space-y-1.5 font-medium">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11px] flex items-center gap-1">
                      <ArrowUpDown className="w-3.5 h-3.5 text-blue-600" /> Velocidades:
                    </span>
                    <span>
                      {p.speedDownload || 'N/D'} ↓ / {p.speedUpload || 'N/D'} ↑
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-4">
                <span className="text-[11px] text-slate-400 font-mono">ID: {p.id}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditPlanModal(p)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Editar Plano"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePlan(p.id, p.name)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Desativar Plano"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Cadastro / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-600" />
                <span>{editingPlan ? 'Editar Plano' : 'Novo Plano de Serviço'}</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Plano *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Fibra 600 Mega Gamer"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição Comercial</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Benefícios inclusos, roteador Wi-Fi 6, etc."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Preço Mensal (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-emerald-700 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ciclo de Cobrança</label>
                  <select
                    value={formData.billingCycle}
                    onChange={(e) => setFormData({ ...formData, billingCycle: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden"
                  >
                    <option value="mensal">Mensal</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="semestral">Semestral</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Download</label>
                  <input
                    type="text"
                    value={formData.speedDownload}
                    onChange={(e) => setFormData({ ...formData, speedDownload: e.target.value })}
                    placeholder="600 Mbps"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Upload</label>
                  <input
                    type="text"
                    value={formData.speedUpload}
                    onChange={(e) => setFormData({ ...formData, speedUpload: e.target.value })}
                    placeholder="300 Mbps"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
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
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Salvar Plano</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

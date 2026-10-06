import React, { useState, useEffect, useMemo } from 'react';
import {
  Network,
  Plus,
  RefreshCw,
  Server,
  Radio,
  Box,
  Edit2,
  Trash2,
  MapPin,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Search,
  Check,
  ChevronDown,
  ChevronRight,
  Layers,
  ArrowRight,
  Eye,
  Hash,
} from 'lucide-react';
import type {
  UserRole,
  AuthUser,
  NetworkOlt,
  NetworkSlot,
  NetworkPon,
  NetworkCto,
  CreateCtosBatchRequest,
} from '../../types/crm';
import { api } from '../../services/api';

interface ConfigRedeViewProps {
  userRole?: UserRole;
  currentUser?: AuthUser | null;
}

type TabType = 'olts' | 'ctos';

type ModalType =
  | 'create_olt'
  | 'edit_olt'
  | 'create_slot'
  | 'edit_slot'
  | 'create_pon'
  | 'edit_pon'
  | 'create_ctos_batch'
  | 'edit_cto'
  | null;

export const ConfigRedeView: React.FC<ConfigRedeViewProps> = () => {
  const [olts, setOlts] = useState<NetworkOlt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Aba ativa: 'olts' (Visão em cards das OLTs/Slots/PONs) ou 'ctos' (Gerenciador de CTOs)
  const [activeTab, setActiveTab] = useState<TabType>('olts');

  // Filtros de busca
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOltId, setFilterOltId] = useState<string>('all');
  const [filterPonId, setFilterPonId] = useState<string>('all');

  // Expansão de Slots dentro dos cards de OLTs (ID do slot expandido)
  const [expandedSlots, setExpandedSlots] = useState<Record<string, boolean>>({});

  // PON selecionada para ver detalhes das suas CTOs
  const [inspectPonId, setInspectPonId] = useState<string | null>(null);

  // Estados dos Modais
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Formulário OLT (com quantidade de slots e PONs por slot!)
  const [oltForm, setOltForm] = useState({
    id: '',
    name: '',
    model: 'Huawei SmartAX MA5608T',
    ip: '',
    location: 'POP Central',
    description: '',
    slotCount: 2,
    ponsPerSlot: 16,
  });

  // Formulário Slot
  const [slotForm, setSlotForm] = useState({
    id: '',
    oltId: '',
    slotNumber: 1,
    name: '',
    cardType: 'GPFD 16P',
    ponCount: 16,
  });

  // Formulário PON Individual
  const [ponForm, setPonForm] = useState({
    id: '',
    slotId: '',
    oltId: '',
    ponNumber: 1,
    name: '',
    sfpType: 'Class C++ (7.5dBm)',
  });

  // Formulário de Cadastro de CTO(s) - Pode cadastrar 1 ou mais informando apenas a PON!
  const [batchCtoForm, setBatchCtoForm] = useState<{
    ponId: string;
    mode: 'range' | 'names' | 'single';
    prefix: string;
    startIndex: number;
    count: number;
    namesText: string;
    singleName: string;
    splitterRatio: string;
    totalPorts: number;
    address: string;
    coordinates: string;
    notes: string;
  }>({
    ponId: '',
    mode: 'range',
    prefix: 'CTO-',
    startIndex: 1,
    count: 8,
    namesText: '',
    singleName: 'CTO-01',
    splitterRatio: '1:16',
    totalPorts: 16,
    address: '',
    coordinates: '',
    notes: '',
  });

  // Formulário Edição CTO
  const [editCtoForm, setEditCtoForm] = useState({
    id: '',
    ponId: '',
    name: '',
    splitterRatio: '1:16',
    totalPorts: 16,
    address: '',
    coordinates: '',
    notes: '',
  });

  // Carrega topologia de rede completa
  const loadNetworkTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getNetworkTree();
      setOlts(data);

      // Expande todos os slots por padrão para visualização imediata
      const initialExpanded: Record<string, boolean> = {};
      data.forEach((o) => {
        o.slots?.forEach((s) => {
          initialExpanded[s.id] = true;
        });
      });
      setExpandedSlots(initialExpanded);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar topologia de rede.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNetworkTree();
  }, []);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Métricas totais calculadas
  const totalSlotsCount = useMemo(() => olts.reduce((acc, o) => acc + (o.slots?.length || 0), 0), [olts]);
  const totalPonsCount = useMemo(
    () =>
      olts.reduce(
        (acc, o) => acc + (o.slots?.reduce((sAcc, s) => sAcc + (s.pons?.length || 0), 0) || 0),
        0
      ),
    [olts]
  );
  const totalCtosCount = useMemo(
    () =>
      olts.reduce(
        (acc, o) =>
          acc +
          (o.slots?.reduce(
            (sAcc, s) => sAcc + (s.pons?.reduce((pAcc, p) => pAcc + (p.ctos?.length || 0), 0) || 0),
            0
          ) || 0),
        0
      ),
    [olts]
  );

  // Lista plana de todas as PONs cadastradas (com referências de OLT e Slot para seleção rápida)
  const allAvailablePons = useMemo(() => {
    const list: Array<{
      pon: NetworkPon;
      slot: NetworkSlot;
      olt: NetworkOlt;
      label: string;
    }> = [];

    olts.forEach((o) => {
      o.slots?.forEach((s) => {
        s.pons?.forEach((p) => {
          list.push({
            pon: p,
            slot: s,
            olt: o,
            label: `${o.name} ➔ ${s.name} ➔ ${p.name}`,
          });
        });
      });
    });
    return list;
  }, [olts]);

  // Lista plana de todas as CTOs cadastradas com informações dos pais
  const allCtosList = useMemo(() => {
    const list: Array<{
      cto: NetworkCto;
      ponName: string;
      slotName: string;
      oltName: string;
    }> = [];

    olts.forEach((o) => {
      o.slots?.forEach((s) => {
        s.pons?.forEach((p) => {
          p.ctos?.forEach((c) => {
            list.push({
              cto: c,
              ponName: p.name,
              slotName: s.name,
              oltName: o.name,
            });
          });
        });
      });
    });
    return list;
  }, [olts]);

  // CTOs filtradas para a aba de CTOs
  const filteredCtos = useMemo(() => {
    return allCtosList.filter((item) => {
      if (filterOltId !== 'all' && item.cto.oltId !== filterOltId) return false;
      if (filterPonId !== 'all' && item.cto.ponId !== filterPonId) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.cto.name.toLowerCase().includes(query);
        const matchesAddress = (item.cto.address || '').toLowerCase().includes(query);
        const matchesPon = item.ponName.toLowerCase().includes(query);
        const matchesOlt = item.oltName.toLowerCase().includes(query);
        return matchesName || matchesAddress || matchesPon || matchesOlt;
      }
      return true;
    });
  }, [allCtosList, filterOltId, filterPonId, searchQuery]);

  // PON inspecionada atualmente para o drawer/modal de CTOs da PON
  const inspectedPonData = useMemo(() => {
    if (!inspectPonId) return null;
    return allAvailablePons.find((item) => item.pon.id === inspectPonId) || null;
  }, [inspectPonId, allAvailablePons]);

  // Alterna expansão de um slot no card da OLT
  const toggleSlotExpand = (slotId: string) => {
    setExpandedSlots((prev) => ({ ...prev, [slotId]: !prev[slotId] }));
  };

  // --- Handlers OLT ---
  const handleOpenCreateOlt = () => {
    setOltForm({
      id: '',
      name: '',
      model: 'Huawei SmartAX MA5608T',
      ip: '',
      location: 'POP Central',
      description: '',
      slotCount: 2,
      ponsPerSlot: 16,
    });
    setActiveModal('create_olt');
  };

  const handleOpenEditOlt = (olt: NetworkOlt) => {
    setOltForm({
      id: olt.id,
      name: olt.name,
      model: olt.model || '',
      ip: olt.ip || '',
      location: olt.location || '',
      description: olt.description || '',
      slotCount: olt.slots?.length || 0,
      ponsPerSlot: 16,
    });
    setActiveModal('edit_olt');
  };

  const handleSaveOlt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oltForm.name.trim()) return alert('Informe o nome da OLT.');
    setIsSubmitting(true);
    try {
      if (activeModal === 'create_olt') {
        const created = await api.createOlt({
          name: oltForm.name,
          model: oltForm.model,
          ip: oltForm.ip,
          location: oltForm.location,
          description: oltForm.description,
          slotCount: Number(oltForm.slotCount) || 0,
          ponsPerSlot: Number(oltForm.ponsPerSlot) || 0,
        });
        showSuccess(
          `OLT ${created.name} cadastrada com sucesso! ${oltForm.slotCount} slot(s) e suas PONs foram gerados automaticamente.`
        );
      } else {
        await api.updateOlt(oltForm.id, {
          name: oltForm.name,
          model: oltForm.model,
          ip: oltForm.ip,
          location: oltForm.location,
          description: oltForm.description,
        });
        showSuccess(`OLT ${oltForm.name} atualizada com sucesso!`);
      }
      setActiveModal(null);
      await loadNetworkTree();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar OLT');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteOlt = async (olt: NetworkOlt) => {
    if (
      !window.confirm(
        `ATENÇÃO: Deseja realmente excluir a OLT "${olt.name}"?\nTodos os seus Slots, PONs e CTOs pertencentes também serão excluídos automaticamente!`
      )
    ) {
      return;
    }
    try {
      await api.deleteOlt(olt.id);
      showSuccess(`OLT ${olt.name} excluída com sucesso.`);
      await loadNetworkTree();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir OLT');
    }
  };

  // --- Handlers Slot ---
  const handleOpenCreateSlot = (oltId: string) => {
    const parentOlt = olts.find((o) => o.id === oltId);
    const nextSlotNum = (parentOlt?.slots?.length || 0) + 1;
    setSlotForm({
      id: '',
      oltId,
      slotNumber: nextSlotNum,
      name: `Slot ${String(nextSlotNum).padStart(2, '0')} - GPFD`,
      cardType: 'GPFD 16P',
      ponCount: 16,
    });
    setActiveModal('create_slot');
  };

  const handleOpenEditSlot = (slot: NetworkSlot) => {
    setSlotForm({
      id: slot.id,
      oltId: slot.oltId,
      slotNumber: slot.slotNumber,
      name: slot.name,
      cardType: slot.cardType || 'GPFD 16P',
      ponCount: slot.pons?.length || 16,
    });
    setActiveModal('edit_slot');
  };

  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slotForm.name.trim()) return alert('Informe o nome do Slot.');
    setIsSubmitting(true);
    try {
      if (activeModal === 'create_slot') {
        await api.createSlot({
          oltId: slotForm.oltId,
          slotNumber: Number(slotForm.slotNumber),
          name: slotForm.name,
          cardType: slotForm.cardType,
          ponCount: Number(slotForm.ponCount) || 0,
        });
        showSuccess(`Slot cadastrado com sucesso! As portas PON foram geradas.`);
      } else {
        await api.updateSlot(slotForm.id, {
          slotNumber: Number(slotForm.slotNumber),
          name: slotForm.name,
          cardType: slotForm.cardType,
        });
        showSuccess(`Slot atualizado!`);
      }
      setActiveModal(null);
      await loadNetworkTree();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar Slot');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSlot = async (slot: NetworkSlot) => {
    if (
      !window.confirm(
        `Deseja excluir o "${slot.name}"?\nTodas as portas PON e CTOs vinculadas a este Slot serão excluídas!`
      )
    ) {
      return;
    }
    try {
      await api.deleteSlot(slot.id);
      showSuccess(`Slot excluído.`);
      await loadNetworkTree();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir Slot');
    }
  };

  // --- Handlers PON ---
  const handleOpenCreatePon = (slotId: string, oltId: string) => {
    const parentOlt = olts.find((o) => o.id === oltId);
    const parentSlot = parentOlt?.slots?.find((s) => s.id === slotId);
    const nextPonNum = (parentSlot?.pons?.length || 0) + 1;
    setPonForm({
      id: '',
      slotId,
      oltId,
      ponNumber: nextPonNum,
      name: `PON ${parentSlot?.slotNumber || 1}/${nextPonNum}`,
      sfpType: 'Class C++ (7.5dBm)',
    });
    setActiveModal('create_pon');
  };

  const handleSavePon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ponForm.name.trim()) return alert('Informe o nome da porta PON.');
    setIsSubmitting(true);
    try {
      await api.createPon(ponForm);
      showSuccess(`Porta PON adicionada com sucesso!`);
      setActiveModal(null);
      await loadNetworkTree();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar PON');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePon = async (pon: NetworkPon) => {
    if (
      !window.confirm(
        `Deseja excluir a porta "${pon.name}"?\nTodas as CTOs vinculadas a esta PON serão excluídas!`
      )
    ) {
      return;
    }
    try {
      await api.deletePon(pon.id);
      showSuccess(`Porta PON excluída.`);
      if (inspectPonId === pon.id) setInspectPonId(null);
      await loadNetworkTree();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir PON');
    }
  };

  // --- Handlers Cadastro de CTO(s) ---
  // Abre o modal de cadastro de CTOs informando apenas a PON! (opcionalmente pré-selecionada)
  const handleOpenCreateCtos = (preSelectedPonId?: string) => {
    const defaultPonId = preSelectedPonId || (allAvailablePons.length > 0 ? allAvailablePons[0].pon.id : '');
    setBatchCtoForm({
      ponId: defaultPonId,
      mode: 'range',
      prefix: 'CTO-',
      startIndex: 1,
      count: 8,
      namesText: '',
      singleName: 'CTO-01',
      splitterRatio: '1:16',
      totalPorts: 16,
      address: '',
      coordinates: '',
      notes: '',
    });
    setActiveModal('create_ctos_batch');
  };

  // Salva 1 ou mais CTOs ligadas à PON selecionada
  const handleSaveBatchCtos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchCtoForm.ponId) {
      return alert('Selecione a porta PON de destino à qual as CTOs pertencerão.');
    }

    setIsSubmitting(true);
    try {
      let payload: CreateCtosBatchRequest;

      if (batchCtoForm.mode === 'range') {
        if (batchCtoForm.count <= 0) return alert('Informe uma quantidade válida de CTOs (mínimo 1).');
        payload = {
          ponId: batchCtoForm.ponId,
          prefix: batchCtoForm.prefix.trim() || 'CTO-',
          startIndex: Number(batchCtoForm.startIndex) || 1,
          count: Number(batchCtoForm.count),
          splitterRatio: batchCtoForm.splitterRatio,
          totalPorts: Number(batchCtoForm.totalPorts),
          address: batchCtoForm.address,
          coordinates: batchCtoForm.coordinates,
          notes: batchCtoForm.notes,
        };
      } else if (batchCtoForm.mode === 'names') {
        const names = batchCtoForm.namesText
          .split(/[\n,;]+/)
          .map((n) => n.trim())
          .filter(Boolean);
        if (names.length === 0) {
          return alert('Informe ao menos um nome de CTO.');
        }
        payload = {
          ponId: batchCtoForm.ponId,
          names,
          splitterRatio: batchCtoForm.splitterRatio,
          totalPorts: Number(batchCtoForm.totalPorts),
          address: batchCtoForm.address,
          coordinates: batchCtoForm.coordinates,
          notes: batchCtoForm.notes,
        };
      } else {
        // Single
        if (!batchCtoForm.singleName.trim()) {
          return alert('Informe o nome da CTO.');
        }
        payload = {
          ponId: batchCtoForm.ponId,
          names: [batchCtoForm.singleName.trim()],
          splitterRatio: batchCtoForm.splitterRatio,
          totalPorts: Number(batchCtoForm.totalPorts),
          address: batchCtoForm.address,
          coordinates: batchCtoForm.coordinates,
          notes: batchCtoForm.notes,
        };
      }

      const res = await api.createCtosBatch(payload);
      showSuccess(
        `${res.count} CTO(s) cadastrada(s) e ligada(s) à PON com sucesso! (CTO ➔ PON ➔ SLOT ➔ OLT)`
      );
      setActiveModal(null);
      await loadNetworkTree();
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar CTO(s)');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditCto = (cto: NetworkCto) => {
    setEditCtoForm({
      id: cto.id,
      ponId: cto.ponId,
      name: cto.name,
      splitterRatio: cto.splitterRatio || '1:16',
      totalPorts: cto.totalPorts || 16,
      address: cto.address || '',
      coordinates: cto.coordinates || '',
      notes: cto.notes || '',
    });
    setActiveModal('edit_cto');
  };

  const handleSaveEditCto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCtoForm.name.trim()) return alert('Informe o nome da CTO.');
    setIsSubmitting(true);
    try {
      await api.updateCto(editCtoForm.id, {
        name: editCtoForm.name,
        splitterRatio: editCtoForm.splitterRatio,
        totalPorts: Number(editCtoForm.totalPorts),
        address: editCtoForm.address,
        coordinates: editCtoForm.coordinates,
        notes: editCtoForm.notes,
      });
      showSuccess(`CTO ${editCtoForm.name} atualizada com sucesso!`);
      setActiveModal(null);
      await loadNetworkTree();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar CTO');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCto = async (cto: NetworkCto) => {
    if (!window.confirm(`Deseja excluir a Caixa de Atendimento "${cto.name}"?`)) return;
    try {
      await api.deleteCto(cto.id);
      showSuccess(`CTO ${cto.name} excluída.`);
      await loadNetworkTree();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir CTO');
    }
  };

  // Pré-visualização dos nomes gerados no modo Range
  const previewRangeNames = useMemo(() => {
    if (batchCtoForm.mode !== 'range') return [];
    const prefix = batchCtoForm.prefix.trim() || 'CTO-';
    const start = Number(batchCtoForm.startIndex) || 1;
    const count = Math.min(Math.max(Number(batchCtoForm.count) || 1, 1), 32);
    const list: string[] = [];
    for (let i = 0; i < count; i++) {
      list.push(`${prefix}${String(start + i).padStart(2, '0')}`);
    }
    return list;
  }, [batchCtoForm.mode, batchCtoForm.prefix, batchCtoForm.startIndex, batchCtoForm.count]);

  // Encontra a PON selecionada no formulário de CTOs para exibir o caminho completo
  const selectedPonTarget = useMemo(() => {
    return allAvailablePons.find((item) => item.pon.id === batchCtoForm.ponId) || null;
  }, [allAvailablePons, batchCtoForm.ponId]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/70 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Infraestrutura de Rede (FTTH)
                <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wide">
                  Topologia
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Mapeamento hierárquico: <strong>OLT</strong> ➔ <strong>SLOT</strong> ➔ <strong>PON</strong> ➔ <strong>CTO</strong> para segmentação e disparos de avisos.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={loadNetworkTree}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Recarregar topologia"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Botão de Destaque: Cadastrar CTO(s) */}
          <button
            onClick={() => handleOpenCreateCtos()}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar CTO(s)</span>
          </button>

          {/* Botão de Destaque: Nova OLT */}
          <button
            onClick={handleOpenCreateOlt}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova OLT</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {/* 4 Cards de Métricas no Topo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">OLTs Ativas</p>
            <p className="text-xl font-black text-slate-900 leading-tight">{olts.length}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Slots / Placas</p>
            <p className="text-xl font-black text-slate-900 leading-tight">{totalSlotsCount}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Portas PON</p>
            <p className="text-xl font-black text-slate-900 leading-tight">{totalPonsCount}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Box className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Caixas CTO</p>
            <p className="text-xl font-black text-emerald-700 leading-tight">{totalCtosCount}</p>
          </div>
        </div>
      </div>

      {/* Navegação por Abas: OLTs (Visão de Chassi) vs Caixas CTO */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('olts')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'olts'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Cards de OLTs & Chassi</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-semibold">
              {olts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ctos')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'ctos'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Box className="w-4 h-4" />
            <span>Todas as CTOs</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-700 font-semibold">
              {totalCtosCount}
            </span>
          </button>
        </div>

        {activeTab === 'ctos' && (
          <div className="flex items-center gap-2 pb-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar CTO, PON, OLT..."
                className="pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 w-44 sm:w-56"
              />
            </div>
            <select
              value={filterOltId}
              onChange={(e) => {
                setFilterOltId(e.target.value);
                setFilterPonId('all');
              }}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-500"
            >
              <option value="all">Todas as OLTs</option>
              {olts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            {filterOltId !== 'all' && (
              <select
                value={filterPonId}
                onChange={(e) => setFilterPonId(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="all">Todas as PONs</option>
                {allAvailablePons
                  .filter((p) => p.olt.id === filterOltId)
                  .map((p) => (
                    <option key={p.pon.id} value={p.pon.id}>
                      {p.pon.name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* ABA 1: CARDS DE OLTs & CHASSI */}
      {activeTab === 'olts' && (
        <div className="space-y-6">
          {olts.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Server className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-sm">Nenhuma OLT cadastrada</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Cadastre sua primeira OLT informando a quantidade de slots e PONs por slot para gerar toda a topologia automaticamente.
              </p>
              <button
                onClick={handleOpenCreateOlt}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Primeira OLT</span>
              </button>
            </div>
          ) : (
            olts.map((olt) => {
              const oltCtosCount = (olt.slots || []).reduce(
                (sAcc, s) => sAcc + (s.pons || []).reduce((pAcc, p) => pAcc + (p.ctos?.length || 0), 0),
                0
              );
              const oltPonsCount = (olt.slots || []).reduce((sAcc, s) => sAcc + (s.pons?.length || 0), 0);

              return (
                <div
                  key={olt.id}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all hover:border-slate-300"
                >
                  {/* Cabeçalho do Card da OLT */}
                  <div className="px-5 py-4 bg-slate-50/80 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-slate-900 text-base">{olt.name}</h3>
                          {olt.model && (
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono text-[11px] font-semibold border border-blue-200/60">
                              {olt.model}
                            </span>
                          )}
                          {olt.ip && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px]">
                              IP: {olt.ip}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                          {olt.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {olt.location}
                            </span>
                          )}
                          {olt.description && (
                            <span className="text-slate-400 truncate max-w-xs">• {olt.description}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Contadores e Ações da OLT */}
                    <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                          {olt.slots?.length || 0} Slots
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-bold border border-violet-100">
                          {oltPonsCount} PONs
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                          {oltCtosCount} CTOs
                        </span>
                      </div>

                      <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                        <button
                          onClick={() => handleOpenCreateSlot(olt.id)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          title="Adicionar outro Slot nesta OLT"
                        >
                          <Plus className="w-3.5 h-3.5 text-blue-600" />
                          <span>+ Slot</span>
                        </button>
                        <button
                          onClick={() => handleOpenEditOlt(olt)}
                          className="p-1.5 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                          title="Editar dados da OLT"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteOlt(olt)}
                          className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          title="Excluir OLT"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Corpo do Card: Slots da OLT */}
                  <div className="p-5 space-y-4">
                    {(!olt.slots || olt.slots.length === 0) ? (
                      <div className="p-6 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                        Nenhum slot cadastrado nesta OLT.
                        <button
                          onClick={() => handleOpenCreateSlot(olt.id)}
                          className="ml-2 text-blue-600 font-bold hover:underline cursor-pointer"
                        >
                          + Adicionar Slot
                        </button>
                      </div>
                    ) : (
                      olt.slots.map((slot) => {
                        const isExpanded = expandedSlots[slot.id] ?? true;
                        const slotCtosTotal = (slot.pons || []).reduce(
                          (acc, p) => acc + (p.ctos?.length || 0),
                          0
                        );

                        return (
                          <div
                            key={slot.id}
                            className="border border-slate-200 rounded-xl bg-slate-50/40 overflow-hidden"
                          >
                            {/* Barra do Slot */}
                            <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between">
                              <button
                                onClick={() => toggleSlotExpand(slot.id)}
                                className="flex items-center gap-2 text-left cursor-pointer group"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                                )}
                                <Cpu className="w-4 h-4 text-indigo-600" />
                                <span className="font-bold text-slate-800 text-xs">{slot.name}</span>
                                {slot.cardType && (
                                  <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[10px] font-mono font-medium">
                                    {slot.cardType}
                                  </span>
                                )}
                                <span className="text-[11px] text-slate-400">
                                  ({slot.pons?.length || 0} PONs • {slotCtosTotal} CTOs)
                                </span>
                              </button>

                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleOpenCreatePon(slot.id, olt.id)}
                                  className="text-[11px] font-bold text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Adicionar PON</span>
                                </button>
                                <button
                                  onClick={() => handleOpenEditSlot(slot)}
                                  className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded transition-colors cursor-pointer"
                                  title="Editar Slot"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteSlot(slot)}
                                  className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                  title="Excluir Slot"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Portas PON em Grid Visual do Slot */}
                            {isExpanded && (
                              <div className="p-3">
                                {(!slot.pons || slot.pons.length === 0) ? (
                                  <p className="text-[11px] text-slate-400 italic text-center py-2">
                                    Nenhuma porta PON neste slot.
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
                                    {slot.pons.map((pon) => {
                                      const ctoCount = pon.ctos?.length || 0;
                                      const hasCtos = ctoCount > 0;

                                      return (
                                        <div
                                          key={pon.id}
                                          className={`group relative p-2.5 rounded-xl border text-left transition-all ${
                                            hasCtos
                                              ? 'bg-blue-50/60 border-blue-200 hover:border-blue-400 hover:shadow-xs'
                                              : 'bg-white border-slate-200 hover:border-slate-300'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-mono font-bold text-xs text-slate-800">
                                              {pon.name}
                                            </span>
                                            <span
                                              className={`w-2 h-2 rounded-full ${
                                                hasCtos ? 'bg-emerald-500' : 'bg-slate-300'
                                              }`}
                                              title={hasCtos ? `${ctoCount} CTOs ligadas` : 'Sem CTOs'}
                                            />
                                          </div>

                                          <div className="mt-1 flex items-center justify-between text-[10px]">
                                            <span
                                              className={`font-semibold ${
                                                hasCtos ? 'text-blue-700' : 'text-slate-400'
                                              }`}
                                            >
                                              {ctoCount} CTO{ctoCount !== 1 ? 's' : ''}
                                            </span>

                                            <button
                                              onClick={() => handleOpenCreateCtos(pon.id)}
                                              className="opacity-0 group-hover:opacity-100 text-emerald-600 hover:text-emerald-700 p-0.5 rounded transition-opacity cursor-pointer"
                                              title="Cadastrar CTOs nesta PON"
                                            >
                                              <Plus className="w-3 h-3" />
                                            </button>
                                          </div>

                                          {/* Ações rápidas da PON */}
                                          <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                                            <button
                                              onClick={() => setInspectPonId(pon.id)}
                                              className="text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                                              title="Ver CTOs conectadas"
                                            >
                                              <Eye className="w-2.5 h-2.5" />
                                              <span>Ver</span>
                                            </button>
                                            <button
                                              onClick={() => handleDeletePon(pon)}
                                              className="text-slate-300 hover:text-rose-500 p-0.5 rounded transition-colors cursor-pointer"
                                              title="Excluir PON"
                                            >
                                              <Trash2 className="w-2.5 h-2.5" />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ABA 2: TODAS AS CTOs (Visão Plena com Filtros & Caminho Completo) */}
      {activeTab === 'ctos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              Exibindo <strong>{filteredCtos.length}</strong> de {totalCtosCount} caixas de atendimento
            </span>
            <button
              onClick={() => handleOpenCreateCtos()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Cadastrar CTO(s)</span>
            </button>
          </div>

          {filteredCtos.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-2">
              <Box className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700 text-sm">Nenhuma CTO encontrada</p>
              <p className="text-xs text-slate-400">
                {searchQuery
                  ? 'Nenhum resultado para a busca informada.'
                  : 'Cadastre CTOs informando a PON à qual elas pertencem.'}
              </p>
              <button
                onClick={() => handleOpenCreateCtos()}
                className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar CTOs</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredCtos.map(({ cto, ponName, slotName, oltName }) => (
                <div
                  key={cto.id}
                  className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs hover:border-blue-300 hover:shadow-sm transition-all space-y-2.5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Box className="w-4 h-4 text-emerald-600 shrink-0" />
                          <h4 className="font-black text-slate-900 text-sm font-mono">{cto.name}</h4>
                        </div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200/50">
                          {cto.splitterRatio || '1:16'} • {cto.totalPorts}p
                        </span>
                      </div>

                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => handleOpenEditCto(cto)}
                          className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded transition-colors cursor-pointer"
                          title="Editar CTO"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteCto(cto)}
                          className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          title="Excluir CTO"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Caminho da Hierarquia: CTO -> PON -> SLOT -> OLT */}
                    <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-100 text-[11px] space-y-0.5 font-mono">
                      <div className="flex items-center gap-1 text-slate-600 truncate">
                        <span className="text-slate-400 text-[10px]">PON:</span>
                        <strong className="text-blue-700">{ponName}</strong>
                      </div>
                      <div className="flex items-center gap-1 text-slate-500 text-[10px] truncate">
                        <span>{slotName}</span>
                        <span>➔</span>
                        <span className="font-semibold text-slate-700">{oltName}</span>
                      </div>
                    </div>

                    {cto.address && (
                      <div className="flex items-start gap-1 mt-2 text-[11px] text-slate-500 leading-tight">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                        <span className="truncate">{cto.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span>ID: {cto.id.slice(0, 10)}</span>
                    <span className="text-emerald-600 font-bold">Ativa</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: DRAWER/VISUALIZADOR DAS CTOs DE UMA PON ESPECÍFICA */}
      {inspectedPonData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Caixas CTO da {inspectedPonData.pon.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {inspectedPonData.olt.name} ➔ {inspectedPonData.slot.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const ponId = inspectedPonData.pon.id;
                    setInspectPonId(null);
                    handleOpenCreateCtos(ponId);
                  }}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ CTOs</span>
                </button>
                <button
                  onClick={() => setInspectPonId(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 max-h-[65vh] overflow-y-auto space-y-3">
              {(!inspectedPonData.pon.ctos || inspectedPonData.pon.ctos.length === 0) ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl text-xs text-slate-400 space-y-2">
                  <p>Nenhuma CTO ligada a esta porta PON.</p>
                  <button
                    onClick={() => {
                      const ponId = inspectedPonData.pon.id;
                      setInspectPonId(null);
                      handleOpenCreateCtos(ponId);
                    }}
                    className="text-blue-600 font-bold hover:underline cursor-pointer"
                  >
                    + Cadastrar CTOs nesta PON
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {inspectedPonData.pon.ctos.map((cto) => (
                    <div
                      key={cto.id}
                      className="p-3 rounded-xl border border-slate-200 bg-white shadow-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Box className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-bold text-xs text-slate-800 font-mono">
                            {cto.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                            {cto.splitterRatio || '1:16'}
                          </span>
                        </div>
                        {cto.address && (
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[180px]">
                            {cto.address}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setInspectPonId(null);
                            handleOpenEditCto(cto);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                          title="Editar"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteCto(cto)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Excluir"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: CRIAR / EDITAR OLT (COM QUANTIDADE DE SLOTS E PONS!) */}
      {/* ======================================================== */}
      {(activeModal === 'create_olt' || activeModal === 'edit_olt') && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600" />
                <span>{activeModal === 'create_olt' ? 'Cadastrar Nova OLT' : 'Editar OLT'}</span>
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOlt} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nome da OLT *
                </label>
                <input
                  type="text"
                  required
                  value={oltForm.name}
                  onChange={(e) => setOltForm({ ...oltForm, name: e.target.value.toUpperCase() })}
                  placeholder="Ex: OLT-CENTRAL-01"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500 uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Modelo / Fabricante
                  </label>
                  <input
                    type="text"
                    value={oltForm.model}
                    onChange={(e) => setOltForm({ ...oltForm, model: e.target.value })}
                    placeholder="Ex: Huawei MA5608T, ZTE C320"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    IP de Gerência
                  </label>
                  <input
                    type="text"
                    value={oltForm.ip}
                    onChange={(e) => setOltForm({ ...oltForm, ip: e.target.value })}
                    placeholder="Ex: 10.0.0.10"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Localização / POP
                </label>
                <input
                  type="text"
                  value={oltForm.location}
                  onChange={(e) => setOltForm({ ...oltForm, location: e.target.value })}
                  placeholder="Ex: POP Centro - Rack 01"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Geração Automática de Slots e PONs (apenas na criação) */}
              {activeModal === 'create_olt' && (
                <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>Topologia Inicial da OLT (Geração Automática)</span>
                  </div>
                  <p className="text-[11px] text-blue-700 leading-tight">
                    Informe a quantidade de slots e portas PON por slot. Toda a estrutura de placas e portas será gerada instantaneamente no banco.
                  </p>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Quantidade de Slots
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={oltForm.slotCount}
                        onChange={(e) => setOltForm({ ...oltForm, slotCount: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        PONs por Slot
                      </label>
                      <select
                        value={oltForm.ponsPerSlot}
                        onChange={(e) => setOltForm({ ...oltForm, ponsPerSlot: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                      >
                        <option value={8}>8 Portas PON / Slot</option>
                        <option value={16}>16 Portas PON / Slot</option>
                        <option value={32}>32 Portas PON / Slot</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-[10px] text-blue-600 font-mono">
                    ↳ Serão criados {oltForm.slotCount} slot(s) com {oltForm.slotCount * oltForm.ponsPerSlot} portas PON no total.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Observações / Descrição
                </label>
                <textarea
                  rows={2}
                  value={oltForm.description}
                  onChange={(e) => setOltForm({ ...oltForm, description: e.target.value })}
                  placeholder="Informações adicionais da OLT..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{activeModal === 'create_olt' ? 'Criar OLT & Topologia' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: CRIAR / EDITAR SLOT (COM QUANTIDADE DE PONs!) */}
      {/* ======================================================== */}
      {(activeModal === 'create_slot' || activeModal === 'edit_slot') && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-600" />
                <span>{activeModal === 'create_slot' ? 'Adicionar Slot à OLT' : 'Editar Slot'}</span>
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSlot} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Número do Slot *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    required
                    value={slotForm.slotNumber}
                    onChange={(e) => setSlotForm({ ...slotForm, slotNumber: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Identificação / Nome *
                  </label>
                  <input
                    type="text"
                    required
                    value={slotForm.name}
                    onChange={(e) => setSlotForm({ ...slotForm, name: e.target.value })}
                    placeholder="Ex: Slot 02 - GPFD"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Tipo de Placa
                  </label>
                  <input
                    type="text"
                    value={slotForm.cardType}
                    onChange={(e) => setSlotForm({ ...slotForm, cardType: e.target.value })}
                    placeholder="Ex: GPFD 16P, GTGH"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                {activeModal === 'create_slot' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Quantidade de PONs
                    </label>
                    <select
                      value={slotForm.ponCount}
                      onChange={(e) => setSlotForm({ ...slotForm, ponCount: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                    >
                      <option value={8}>8 Portas PON</option>
                      <option value={16}>16 Portas PON</option>
                      <option value={32}>32 Portas PON</option>
                      <option value={0}>Nenhuma (manual)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Salvar Slot</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: ADICIONAR PORTA PON AVULSA */}
      {/* ======================================================== */}
      {activeModal === 'create_pon' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Radio className="w-4 h-4 text-violet-600" />
                <span>Adicionar Porta PON</span>
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePon} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Número da Porta *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={ponForm.ponNumber}
                    onChange={(e) => setPonForm({ ...ponForm, ponNumber: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nome da Porta *
                  </label>
                  <input
                    type="text"
                    required
                    value={ponForm.name}
                    onChange={(e) => setPonForm({ ...ponForm, name: e.target.value })}
                    placeholder="Ex: PON 1/1"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Módulo SFP GPON
                </label>
                <select
                  value={ponForm.sfpType}
                  onChange={(e) => setPonForm({ ...ponForm, sfpType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="Class C++ (7.5dBm)">Class C++ (7.5dBm - Alto Alcance)</option>
                  <option value="Class C+ (6.0dBm)">Class C+ (6.0dBm - Padrão FTTH)</option>
                  <option value="Class B+ (4.5dBm)">Class B+ (4.5dBm)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Salvar PON</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: CADASTRAR CTO(s) - 1 OU MAIS DE UMA VEZ SÓ! */}
      {/* O USUÁRIO APENAS SELECIONA A PON DE DESTINO! */}
      {/* CTO -> PON -> SLOT -> OLT É LIGADO AUTOMATICAMENTE */}
      {/* ======================================================== */}
      {activeModal === 'create_ctos_batch' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-emerald-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Box className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Cadastrar Caixas de Terminação Óptica (CTOs)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Basta informar a PON. A amarração <strong>CTO ➔ PON ➔ SLOT ➔ OLT</strong> é automática!
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBatchCtos} className="p-6 space-y-4">
              {/* 1. SELEÇÃO DA PON DE DESTINO */}
              <div className="p-3.5 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-2">
                <label className="text-xs font-bold text-blue-900 block flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-blue-600" />
                  <span>Porta PON de Destino *</span>
                </label>
                <select
                  required
                  value={batchCtoForm.ponId}
                  onChange={(e) => setBatchCtoForm({ ...batchCtoForm, ponId: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Selecione a PON...</option>
                  {allAvailablePons.map((item) => (
                    <option key={item.pon.id} value={item.pon.id}>
                      {item.label} ({item.pon.ctos?.length || 0} CTOs existentes)
                    </option>
                  ))}
                </select>

                {/* Exibição Visual da Ligação Completa */}
                {selectedPonTarget && (
                  <div className="p-2.5 bg-white rounded-lg border border-blue-100 flex items-center gap-1.5 text-[11px] font-mono text-slate-700 flex-wrap">
                    <span className="font-bold text-emerald-700">CTO(s)</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span className="font-bold text-violet-700">{selectedPonTarget.pon.name}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span className="text-indigo-700 font-semibold">{selectedPonTarget.slot.name}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span className="font-bold text-blue-800">{selectedPonTarget.olt.name}</span>
                  </div>
                )}
              </div>

              {/* 2. MODO DE CADASTRO: RANGE / NOMES / SINGLE */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Formato de Cadastro das CTOs:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchCtoForm({ ...batchCtoForm, mode: 'range' })}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      batchCtoForm.mode === 'range'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <Hash className="w-4 h-4 text-emerald-600" />
                    <span>Em Lote (Faixa)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBatchCtoForm({ ...batchCtoForm, mode: 'names' })}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      batchCtoForm.mode === 'names'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-emerald-600" />
                    <span>Vários Nomes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBatchCtoForm({ ...batchCtoForm, mode: 'single' })}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      batchCtoForm.mode === 'single'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <Box className="w-4 h-4 text-emerald-600" />
                    <span>CTO Única</span>
                  </button>
                </div>
              </div>

              {/* CONTEÚDO DEPENDENTE DO MODO */}
              {batchCtoForm.mode === 'range' && (
                <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                        Prefixo
                      </label>
                      <input
                        type="text"
                        value={batchCtoForm.prefix}
                        onChange={(e) =>
                          setBatchCtoForm({ ...batchCtoForm, prefix: e.target.value.toUpperCase() })
                        }
                        placeholder="CTO-"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 uppercase focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                        Início
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={batchCtoForm.startIndex}
                        onChange={(e) =>
                          setBatchCtoForm({ ...batchCtoForm, startIndex: Number(e.target.value) })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                        Quantidade
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={32}
                        value={batchCtoForm.count}
                        onChange={(e) =>
                          setBatchCtoForm({ ...batchCtoForm, count: Number(e.target.value) })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Pré-visualização dos Nomes */}
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 block mb-1">
                      Pré-visualização ({previewRangeNames.length} CTOs que serão criadas):
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                      {previewRangeNames.map((name) => (
                        <span
                          key={name}
                          className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {batchCtoForm.mode === 'names' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Nomes das CTOs (um por linha ou separados por vírgula):
                  </label>
                  <textarea
                    rows={4}
                    value={batchCtoForm.namesText}
                    onChange={(e) => setBatchCtoForm({ ...batchCtoForm, namesText: e.target.value })}
                    placeholder={`CTO-01\nCTO-02\nCTO-03\nCTO-04`}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 uppercase resize-none"
                  />
                  <p className="text-[10px] text-slate-400">
                    Você pode colar múltiplos nomes copiados da sua planilha ou documentação de rede.
                  </p>
                </div>
              )}

              {batchCtoForm.mode === 'single' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nome da CTO *
                  </label>
                  <input
                    type="text"
                    required
                    value={batchCtoForm.singleName}
                    onChange={(e) =>
                      setBatchCtoForm({ ...batchCtoForm, singleName: e.target.value.toUpperCase() })
                    }
                    placeholder="Ex: CTO-PRAÇA-01"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 uppercase focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {/* 3. ESPECIFICAÇÕES TÉCNICAS DO SPLITTER & PORTAS */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Razão do Splitter
                  </label>
                  <select
                    value={batchCtoForm.splitterRatio}
                    onChange={(e) =>
                      setBatchCtoForm({ ...batchCtoForm, splitterRatio: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="1:16">1:16 (16 Clientes)</option>
                    <option value="1:8">1:8 (8 Clientes)</option>
                    <option value="1:32">1:32 (32 Clientes)</option>
                    <option value="1:4">1:4 (4 Clientes)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Portas Totais
                  </label>
                  <input
                    type="number"
                    min={4}
                    max={64}
                    value={batchCtoForm.totalPorts}
                    onChange={(e) =>
                      setBatchCtoForm({ ...batchCtoForm, totalPorts: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 4. ENDEREÇO / REFERÊNCIA */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Endereço / Bairro de Referência (Opcional)
                </label>
                <input
                  type="text"
                  value={batchCtoForm.address}
                  onChange={(e) => setBatchCtoForm({ ...batchCtoForm, address: e.target.value })}
                  placeholder="Ex: Av. Brasil, Post 24 - Bairro Industrial"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Botões do Rodapé */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !batchCtoForm.ponId}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {batchCtoForm.mode === 'range'
                      ? `Salvar ${batchCtoForm.count} CTO(s)`
                      : 'Salvar CTO(s)'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: EDITAR CTO INDIVIDUAL */}
      {/* ======================================================== */}
      {activeModal === 'edit_cto' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Box className="w-4 h-4 text-emerald-600" />
                <span>Editar Caixa de Atendimento (CTO)</span>
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCto} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nome da CTO *
                </label>
                <input
                  type="text"
                  required
                  value={editCtoForm.name}
                  onChange={(e) =>
                    setEditCtoForm({ ...editCtoForm, name: e.target.value.toUpperCase() })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 uppercase focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Splitter
                  </label>
                  <select
                    value={editCtoForm.splitterRatio}
                    onChange={(e) =>
                      setEditCtoForm({ ...editCtoForm, splitterRatio: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="1:16">1:16</option>
                    <option value="1:8">1:8</option>
                    <option value="1:32">1:32</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Portas Totais
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editCtoForm.totalPorts}
                    onChange={(e) =>
                      setEditCtoForm({ ...editCtoForm, totalPorts: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Endereço / Referência
                </label>
                <input
                  type="text"
                  value={editCtoForm.address}
                  onChange={(e) => setEditCtoForm({ ...editCtoForm, address: e.target.value })}
                  placeholder="Ex: Rua das Flores, 120"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Observações
                </label>
                <textarea
                  rows={2}
                  value={editCtoForm.notes}
                  onChange={(e) => setEditCtoForm({ ...editCtoForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

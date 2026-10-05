import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Search,
  Shield,
  Mail,
  Edit2,
  X,
  Phone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  MessageSquare,
  Users,
} from 'lucide-react';
import type { AuthUser, UserRole } from '../../types/crm';
import type { Conversation } from '../../types/chat';
import { api } from '../../services/api';
import { isSameDepartment } from '../../utils/rbac';

interface AtendentesViewProps {
  userRole?: UserRole;
  currentUser?: AuthUser | null;
  conversations?: Conversation[];
}

export const AtendentesView: React.FC<AtendentesViewProps> = ({
  userRole,
  currentUser,
  conversations = [],
}) => {
  const isGestor = userRole === 'gestor';
  const gestorDept = currentUser?.department || 'Suporte Técnico';

  const [attendants, setAttendants] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal Novo Atendente
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('operador');
  const [formDepartment, setFormDepartment] = useState(isGestor ? gestorDept : 'Suporte Técnico');
  const [formPassword, setFormPassword] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Modal Editar Atendente
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('operador');
  const [editActive, setEditActive] = useState(true);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const loadAttendants = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await api.listUsers();
      // Filtragem por equipe se for gestor
      const teamList = isGestor
        ? data.filter((u) => isSameDepartment(u.department, gestorDept))
        : data;
      setAttendants(teamList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao buscar atendentes no banco de dados.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAttendants();
  }, [userRole, currentUser?.department]);

  const handleOpenCreateModal = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormPassword('');
    setFormRole('operador');
    setFormDepartment(isGestor ? gestorDept : 'Suporte Técnico');
    setIsModalOpen(true);
  };

  const handleCreateAttendant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      setErrorMessage('Por favor, preencha os campos obrigatórios.');
      return;
    }

    setIsSubmittingCreate(true);
    setErrorMessage(null);

    try {
      await api.createUser({
        name: formName.trim(),
        email: formEmail.trim().toLowerCase(),
        phone: formPhone.trim(),
        role: isGestor ? 'operador' : formRole,
        department: isGestor ? gestorDept : formDepartment,
        password: formPassword,
      });

      setSuccessMessage(`Atendente ${formName.trim()} cadastrado com sucesso!`);
      setIsModalOpen(false);
      await loadAttendants();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar atendente.';
      setErrorMessage(msg);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenEditModal = (attendant: AuthUser) => {
    setEditingId(attendant.id);
    setEditName(attendant.name);
    setEditEmail(attendant.email);
    setEditPhone(attendant.phone || '');
    setEditRole(attendant.role);
    setEditDepartment(attendant.department);
    setEditActive(attendant.active);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editName.trim() || !editEmail.trim()) return;

    setIsSubmittingEdit(true);
    setErrorMessage(null);

    try {
      await api.updateUser(editingId, {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim(),
        role: isGestor ? 'operador' : editRole,
        department: isGestor ? gestorDept : editDepartment,
        active: editActive,
      });

      setSuccessMessage(`Dados do atendente ${editName.trim()} atualizados com sucesso!`);
      setIsEditModalOpen(false);
      await loadAttendants();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar dados do atendente.';
      setErrorMessage(msg);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleToggleStatus = async (attendant: AuthUser) => {
    try {
      await api.updateUser(attendant.id, {
        name: attendant.name,
        email: attendant.email,
        phone: attendant.phone || '',
        role: attendant.role,
        department: attendant.department,
        active: !attendant.active,
      });
      await loadAttendants();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao alterar status do atendente.';
      setErrorMessage(msg);
    }
  };

  const filtered = attendants.filter((a) => {
    const matchesSearch =
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.department && a.department.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const getActiveChatsCount = (attendantId: string) => {
    return conversations.filter((c) => c.operator?.id === attendantId && c.status === 'active').length;
  };

  const totalActiveChats = attendants.reduce((acc, curr) => acc + getActiveChatsCount(curr.id), 0);
  const activeAttendantsCount = attendants.filter((a) => a.active).length;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              {isGestor ? `Equipe de Atendentes (${gestorDept})` : 'Gestão de Atendentes & Operadores'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
              {attendants.length} {attendants.length === 1 ? 'cadastrado' : 'cadastrados'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isGestor
              ? `Todo usuário do sistema é atendente. Você gerencia exclusivamente os membros da sua equipe (${gestorDept}).`
              : 'Todo usuário do sistema atua como atendente no chat. Supervise a capacidade e permissões de atendimento.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAttendants}
            title="Atualizar lista"
            className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Atendente</span>
          </button>
        </div>
      </div>

      {isGestor && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-blue-800">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Visão Restrita de Gestor:</strong> Todo usuário é atendente, porém você visualiza e acompanha exclusivamente os membros da sua equipe (<strong>{gestorDept}</strong>).
            </span>
          </div>
        </div>
      )}

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Atendentes na Equipe
            </span>
            <div className="text-2xl font-bold text-slate-800 mt-1">{attendants.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Atendentes Ativos
            </span>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{activeAttendantsCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Chats em Andamento
            </span>
            <div className="text-2xl font-bold text-blue-600 mt-1">{totalActiveChats}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar atendente por nome, e-mail ou setor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Attendants Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">
            Listagem de Atendentes (Banco de Dados PostgreSQL)
          </h3>
          <span className="text-xs text-slate-400">
            {filtered.length} {filtered.length === 1 ? 'atendente encontrado' : 'atendentes encontrados'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Atendente</th>
                <th className="py-3 px-4">Contato</th>
                <th className="py-3 px-4">Função / Cargo</th>
                <th className="py-3 px-4">Departamento</th>
                <th className="py-3 px-4">Chats Ativos</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                    Carregando atendentes do PostgreSQL...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Nenhum atendente encontrado para o filtro informado.
                  </td>
                </tr>
              ) : (
                filtered.map((attendant) => {
                  const activeChats = getActiveChatsCount(attendant.id);
                  const initials = attendant.name
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0].toUpperCase())
                    .join('') || 'AT';

                  return (
                    <tr key={attendant.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                            {initials}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800">{attendant.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{attendant.id}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{attendant.email}</span>
                        </div>
                        {attendant.phone && (
                          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{attendant.phone}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            attendant.role === 'admin'
                              ? 'bg-purple-100 text-purple-700'
                              : attendant.role === 'gestor'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {attendant.role === 'admin'
                            ? 'Administrador'
                            : attendant.role === 'gestor'
                            ? 'Gestor'
                            : 'Operador'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-700">{attendant.department || 'Geral'}</span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-xs">
                          {activeChats} {activeChats === 1 ? 'chat' : 'chats'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleStatus(attendant)}
                          title="Clique para alternar status do atendente"
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors ${
                            attendant.active
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              attendant.active ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          {attendant.active ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenEditModal(attendant)}
                          title="Editar Atendente"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Novo Atendente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base">Novo Atendente</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAttendant} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Larissa Mendes"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail Corporativo *
                </label>
                <input
                  type="email"
                  required
                  placeholder="larissa.atendimento@solcrm.com.br"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  placeholder="(11) 98765-4321"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Senha Provisória *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 6 caracteres"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nível de Acesso
                  </label>
                  <select
                    value={isGestor ? 'operador' : formRole}
                    disabled={isGestor}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none disabled:opacity-75 disabled:bg-slate-100"
                  >
                    <option value="operador">Operador</option>
                    {!isGestor && (
                      <>
                        <option value="gestor">Gestor</option>
                        <option value="admin">Administrador</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Departamento {isGestor && <span className="text-[10px] text-blue-600 font-normal">(Fixo do seu setor)</span>}
                  </label>
                  <select
                    value={isGestor ? gestorDept : formDepartment}
                    disabled={isGestor}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none disabled:opacity-75 disabled:bg-slate-100"
                  >
                    <option value={gestorDept}>{gestorDept}</option>
                    {!isGestor && (
                      <>
                        <option value="Suporte Técnico">Suporte Técnico</option>
                        <option value="Financeiro">Financeiro</option>
                        <option value="Comercial">Comercial</option>
                        <option value="Atendimento Geral">Atendimento Geral</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isSubmittingCreate && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Salvar Atendente</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Atendente */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base">Editar Atendente</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail Corporativo *
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nível de Acesso
                  </label>
                  <select
                    value={isGestor ? 'operador' : editRole}
                    disabled={isGestor}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none disabled:opacity-75 disabled:bg-slate-100"
                  >
                    <option value="operador">Operador</option>
                    {!isGestor && (
                      <>
                        <option value="gestor">Gestor</option>
                        <option value="admin">Administrador</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Departamento
                  </label>
                  <select
                    value={isGestor ? gestorDept : editDepartment}
                    disabled={isGestor}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none disabled:opacity-75 disabled:bg-slate-100"
                  >
                    <option value={gestorDept}>{gestorDept}</option>
                    {!isGestor && (
                      <>
                        <option value="Suporte Técnico">Suporte Técnico</option>
                        <option value="Financeiro">Financeiro</option>
                        <option value="Comercial">Comercial</option>
                        <option value="Atendimento Geral">Atendimento Geral</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status
                </label>
                <div className="flex items-center gap-3 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="status"
                      checked={editActive}
                      onChange={() => setEditActive(true)}
                    />
                    <span>Ativo</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="status"
                      checked={!editActive}
                      onChange={() => setEditActive(false)}
                    />
                    <span>Inativo</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isSubmittingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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

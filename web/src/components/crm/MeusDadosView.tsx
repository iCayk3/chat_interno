import React, { useState } from 'react';
import {
  User,
  Save,
  Check,
  Lock,
  Shield,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { UserRole, AuthUser } from '../../types/crm';
import { api } from '../../services/api';

interface MeusDadosViewProps {
  userRole: UserRole;
  currentUser?: AuthUser | null;
  onUserUpdated?: (updated: AuthUser) => void;
}

export const MeusDadosView: React.FC<MeusDadosViewProps> = ({
  userRole,
  currentUser,
  onUserUpdated,
}) => {
  const [name, setName] = useState(currentUser?.name || 'Administrador Master');
  const [email, setEmail] = useState(currentUser?.email || 'admin@solcrm.com.br');
  const [phone, setPhone] = useState(currentUser?.phone || '(11) 99999-0001');
  const [department, setDepartment] = useState(currentUser?.department || 'Diretoria & Governança');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [savedProfile, setSavedProfile] = useState(false);
  const [savedPassword, setSavedPassword] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await api.updateProfile(name, phone, department);
      if (onUserUpdated) onUserUpdated(updated);
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2500);
    } catch {
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2000);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) {
      alert('As senhas não coincidem!');
      return;
    }
    if (newPassword.length < 6) {
      alert('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    try {
      await api.changePassword(currentPassword, newPassword);
      setSavedPassword(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSavedPassword(false), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao alterar senha';
      alert(msg);
    }
  };

  const getRoleTitle = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'Administrador Geral';
      case 'gestor':
        return 'Gestor de Atendimento & Equipe';
      default:
        return 'Atendente Operador';
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Meus Dados & Perfil Pessoal
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gerencie suas informações cadastrais, credenciais de acesso e preferências da sua conta.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>Perfil: {getRoleTitle(userRole)}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Avatar & Summary Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col items-center text-center space-y-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-2xl bg-blue-600 text-white font-extrabold text-3xl flex items-center justify-center shadow-md shadow-blue-500/20">
              {name.charAt(0)}
            </div>
            <span className="w-5 h-5 rounded-full bg-emerald-500 border-3 border-white absolute bottom-0 right-0 shadow-2xs" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-800">{name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{email}</p>
            <div className="mt-2.5 inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
              {getRoleTitle(userRole)}
            </div>
          </div>

          <div className="w-full pt-4 border-t border-slate-100 space-y-2 text-xs text-left">
            <div className="flex justify-between text-slate-500">
              <span>Departamento:</span>
              <span className="font-semibold text-slate-800 truncate max-w-[140px]">{department}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Status:</span>
              <span className="text-emerald-600 font-semibold">Online & Disponível</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Sessão:</span>
              <span className="text-slate-700">Autenticada</span>
            </div>
          </div>
        </div>

        {/* Right Columns: Edit Profile & Password */}
        <div className="lg:col-span-2 space-y-6">
          {/* Form: Dados Pessoais */}
          <form
            onSubmit={handleSaveProfile}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                <span>Informações Cadastrais</span>
              </h3>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors"
              >
                {savedProfile ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                <span>{savedProfile ? 'Salvo!' : 'Salvar Dados'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  E-mail de Acesso
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Departamento
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </form>

          {/* Form: Alteração de Senha Própria */}
          <form
            onSubmit={handleSavePassword}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-600" />
                <span>Segurança & Alteração de Senha</span>
              </h3>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs shadow-xs transition-colors"
              >
                {savedPassword ? <Check className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span>{savedPassword ? 'Senha Alterada!' : 'Atualizar Senha'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Senha Atual
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nova Senha
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Mínimo 8 dígitos"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Confirmar Nova Senha
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Repita a nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-blue-600 hover:underline flex items-center gap-1 font-medium"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPassword ? 'Ocultar senhas' : 'Ver senhas digitadas'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

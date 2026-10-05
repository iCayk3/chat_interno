import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
  AlertCircle,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../../services/api';
import type { AuthUser } from '../../types/crm';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Por favor, informe seu e-mail e sua senha.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.login(email.trim(), password);
      onLoginSuccess(response.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na autenticação. Tente novamente.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFillAdmin = () => {
    setEmail('admin@solcrm.com.br');
    setPassword('SolAdmin#2026');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-radial from-slate-900 via-slate-950 to-black text-slate-100 p-4 select-none relative overflow-hidden">
      {/* Background Decorative Blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-md p-8 relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white font-extrabold text-2xl shadow-lg shadow-blue-500/25 mx-auto">
            S
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-3">
            SOL CRM
          </h1>
          <p className="text-xs text-slate-400">
            Helpdesk Omnichannel & Central ERP
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-start gap-3 text-xs text-rose-300 animate-in fade-in zoom-in-95 duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="flex-1 leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              E-mail de Acesso
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@empresa.com.br"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 focus:border-blue-500 focus:bg-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all shadow-inner"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Senha
              </label>
              <button
                type="button"
                onClick={() => alert('Entre em contato com o administrador do sistema para redefinir sua senha.')}
                className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline transition-colors"
              >
                Esqueceu a senha?
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-11 py-2.5 bg-slate-800/80 border border-slate-700 focus:border-blue-500 focus:bg-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-0.5"
                title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded-md border-slate-700 bg-slate-800 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-xs text-slate-400">Lembrar-me</span>
            </label>
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Sessão TLS 1.3
            </span>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <span>Entrar no Sistema</span>
            )}
          </button>
        </form>

        {/* Quick Admin Credentials Card */}
        <div className="pt-4 border-t border-slate-800/80">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Acesso do Administrador</span>
              </div>
              <button
                type="button"
                onClick={handleFillAdmin}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-medium transition-colors cursor-pointer flex items-center gap-1"
                title="Preencher campos com e-mail e senha de Administrador"
              >
                <CheckCircle2 className="w-3 h-3 text-blue-400" />
                <span>Preencher</span>
              </button>
            </div>
            <div className="text-[11px] text-slate-400 font-mono space-y-0.5 bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <div>E-mail: <span className="text-slate-200">admin@solcrm.com.br</span></div>
              <div>Senha:  <span className="text-slate-200">SolAdmin#2026</span></div>
            </div>
          </div>
        </div>

        {/* Footer Security Badges */}
        <div className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-3 pt-1">
          <span>• Controle RBAC Estrito</span>
          <span>• Anti-IDOR Ativo</span>
          <span>• Rate Limiting</span>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  X,
  Shield,
  LogOut,
} from 'lucide-react';
import type { UserRole, AuthUser } from '../../types/crm';

interface MeuPerfilModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: UserRole;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
}

export const MeuPerfilModal: React.FC<MeuPerfilModalProps> = ({
  isOpen,
  onClose,
  userRole,
  currentUser,
  onLogout,
}) => {
  const [operatorStatus, setOperatorStatus] = useState<'online' | 'busy' | 'away'>('online');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-base">Meu Perfil</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* User Avatar & Info */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white font-extrabold text-lg flex items-center justify-center shadow-md shadow-blue-500/20 uppercase">
              {currentUser?.name ? currentUser.name.slice(0, 2) : 'AD'}
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-base">{currentUser?.name || 'Administrador Master'}</h4>
              <p className="text-xs text-slate-400">{currentUser?.email || 'admin@solcrm.com.br'}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-blue-600 font-semibold">
                <Shield className="w-3.5 h-3.5" />
                <span>
                  {userRole === 'admin'
                    ? 'Administrador Geral'
                    : userRole === 'gestor'
                    ? 'Gestor Master CRM'
                    : 'Atendente Suporte N2'}
                </span>
              </div>
            </div>
          </div>

          {/* Status Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Seu Status Atual
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
              <button
                onClick={() => setOperatorStatus('online')}
                className={`py-2 px-3 rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                  operatorStatus === 'online'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-bold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Disponível</span>
              </button>

              <button
                onClick={() => setOperatorStatus('busy')}
                className={`py-2 px-3 rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                  operatorStatus === 'busy'
                    ? 'border-amber-300 bg-amber-50 text-amber-800 font-bold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Ocupado</span>
              </button>

              <button
                onClick={() => setOperatorStatus('away')}
                className={`py-2 px-3 rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                  operatorStatus === 'away'
                    ? 'border-slate-400 bg-slate-100 text-slate-800 font-bold'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>Pausa</span>
              </button>
            </div>
          </div>

          {/* Preferences */}
          <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-700 font-medium">Sons de Novas Mensagens</span>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-700 font-medium">Notificações no Navegador</span>
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          {onLogout ? (
            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair da Conta</span>
            </button>
          ) : <div />}

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-xs cursor-pointer"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};

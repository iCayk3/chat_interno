import React from 'react';
import { Clock, ShieldCheck, Tag, AlertTriangle, Sparkles } from 'lucide-react';
import type { SystemLicense } from '../../types/crm';

interface TrialBannerProps {
  license: SystemLicense | null;
  onOpenLicenseModal?: () => void;
}

export const TrialBanner: React.FC<TrialBannerProps> = ({ license, onOpenLicenseModal }) => {
  if (!license) return null;

  // Se já for plano pago e ativo, não precisa de banner chamativo
  if (license.licenseType === 'paid' && license.status === 'active') {
    return null;
  }

  // Se estiver suspenso ou revogado, o LicenseSuspendedScreen cuidará da tela cheia
  if (license.status === 'suspended' || license.status === 'revoked') {
    return null;
  }

  const isTrial = license.status === 'trial' || license.licenseType === 'trial';
  const days = license.trialDaysRemaining ?? 0;
  const isExpiringSoon = days <= 5;

  return (
    <div
      className={`shrink-0 z-30 px-4 py-2.5 border-t text-xs flex flex-wrap items-center justify-between gap-3 bg-white shadow-md transition-colors ${
        isExpiringSoon
          ? 'border-amber-300 bg-amber-50/70'
          : 'border-slate-200/90 bg-white'
      }`}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        <div
          className={`p-1.5 rounded-lg shrink-0 ${
            isExpiringSoon
              ? 'bg-amber-100 text-amber-700 border border-amber-300'
              : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
          }`}
        >
          {isExpiringSoon ? (
            <AlertTriangle className="w-4 h-4 animate-pulse" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
        </div>

        <span className="font-bold text-slate-800">
          {isTrial
            ? 'Período de Avaliação Gratuita (Trial):'
            : 'Licença Cortesia Especial:'}
        </span>

        {isTrial && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-xs ${
              isExpiringSoon
                ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                : 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {days === 1 ? 'Resta 1 dia' : `Restam ${days} dias`}
          </span>
        )}

        <span className="text-slate-600 hidden md:inline font-medium">
          {isTrial
            ? 'Aproveite para testar todas as funcionalidades do sistema sem restrições.'
            : 'Seu sistema está liberado por cortesia da nossa equipe.'}
        </span>

        {license.discountDescription && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 border border-purple-300 text-purple-900 font-semibold shadow-2xs">
            <Tag className="w-3.5 h-3.5 text-purple-700" />
            {license.discountDescription}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onOpenLicenseModal && (
          <button
            onClick={onOpenLicenseModal}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-xs transition-all active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Planos & Assinatura
          </button>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  AlertOctagon,
  Copy,
  Check,
  RefreshCw,
  Key,
  QrCode,
  Phone,
  Mail,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import type { SystemLicense } from '../../types/crm';
import { api } from '../../services/api';

interface LicenseSuspendedScreenProps {
  license: SystemLicense | null;
  onLicenseUpdated: (updated: SystemLicense) => void;
}

export const LicenseSuspendedScreen: React.FC<LicenseSuspendedScreenProps> = ({
  license,
  onLicenseUpdated,
}) => {
  const [activationKey, setActivationKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedPix, setCopiedPix] = useState(false);

  const handleCopyPix = () => {
    if (license?.paymentPix) {
      navigator.clipboard.writeText(license.paymentPix);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 3000);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationKey.trim()) {
      setErrorMsg('Informe a chave de licença para ativação');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.activateLicense(activationKey.trim());
      setSuccessMsg(res.message || 'Licença ativada com sucesso!');
      if (res.license) {
        onLicenseUpdated(res.license);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao ativar chave de licença.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.refreshLicense();
      setSuccessMsg('Status de licença atualizado!');
      if (res.license) {
        onLicenseUpdated(res.license);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Não foi possível contatar o servidor de licenciamento.');
    } finally {
      setLoading(false);
    }
  };

  const suspensionReason =
    license?.suspensionReason ||
    'O período de testes gratuitos do sistema foi encerrado ou a assinatura encontra-se com renovação pendente.';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 sm:p-8 my-8 text-slate-800">
        {/* Header de Bloqueio */}
        <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 shadow-2xs">
            <AlertOctagon className="w-8 h-8 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
              Acesso ao Sistema Suspenso
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {license?.tenantName ? `${license.tenantName} — ` : ''}Licenciamento Pendente
            </p>
          </div>
        </div>

        {/* Motivo do Bloqueio */}
        <div className="mt-5 p-4 bg-red-50 border border-red-200 rounded-xl text-xs sm:text-sm text-red-900">
          <p className="font-bold flex items-center gap-2 text-red-700">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            Motivo da Suspensão:
          </p>
          <p className="mt-1 text-slate-700 leading-relaxed font-normal">{suspensionReason}</p>
        </div>

        {/* Informações de Pagamento PIX (se houver cobrança) */}
        {license?.paymentPix && (
          <div className="mt-6 p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-600" />
                Regularização Imediata via PIX
              </span>
              {license.paymentAmount && license.paymentAmount > 0 && (
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 block">Valor a pagar:</span>
                  <span className="text-lg font-extrabold text-emerald-700">
                    {license.paymentAmount.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </span>
                </div>
              )}
            </div>

            {license.discountDescription && (
              <div className="text-xs text-purple-900 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg flex items-center justify-between">
                <span>Desconto especial concedido:</span>
                <span className="font-bold">{license.discountDescription}</span>
              </div>
            )}

            {/* QR Code imagem se tiver */}
            {license.paymentQRCodeBase64 && (
              <div className="flex justify-center my-3">
                <img
                  src={
                    license.paymentQRCodeBase64.startsWith('data:')
                      ? license.paymentQRCodeBase64
                      : `data:image/png;base64,${license.paymentQRCodeBase64}`
                  }
                  alt="QR Code PIX"
                  className="w-44 h-44 bg-white p-2 rounded-xl border border-slate-200 shadow-xs"
                />
              </div>
            )}

            {/* PIX Copia e Cola */}
            <div className="mt-2">
              <label className="text-xs text-slate-600 font-semibold block mb-1">Chave / Código Copia e Cola:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={license.paymentPix}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono select-all focus:outline-none shadow-2xs"
                />
                <button
                  onClick={handleCopyPix}
                  type="button"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs"
                >
                  {copiedPix ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedPix ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ativação por Chave de Licença */}
        <form onSubmit={handleActivate} className="mt-6">
          <label className="text-xs sm:text-sm font-bold text-slate-700 block mb-1.5 flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-600" />
            Possui uma Chave de Licença?
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ex: PRO-XXXXXXXX-XXXXXXXX-XXXX"
              value={activationKey}
              onChange={(e) => setActivationKey(e.target.value.toUpperCase())}
              className="flex-1 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none uppercase font-semibold shadow-2xs"
            />
            <button
              type="submit"
              disabled={loading || !activationKey.trim()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-colors shrink-0 shadow-xs active:scale-95"
            >
              Ativar
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Feedback Messages */}
        {errorMsg && (
          <p className="mt-3 text-xs text-red-800 bg-red-50 border border-red-200 p-2.5 rounded-xl font-medium">
            {errorMsg}
          </p>
        )}
        {successMsg && (
          <p className="mt-3 text-emerald-800 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl font-medium">
            {successMsg}
          </p>
        )}

        {/* Ações inferiores e Suporte */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors border border-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Verificar Liberação Imediata
          </button>

          <div className="flex items-center gap-3 text-xs">
            {license?.contactSupportPhone && (
              <a
                href={`https://wa.me/55${license.contactSupportPhone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-200 font-semibold transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                {license.contactSupportPhone}
              </a>
            )}
            {license?.contactSupportEmail && (
              <a
                href={`mailto:${license.contactSupportEmail}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg border border-blue-200 font-semibold transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                {license.contactSupportEmail}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

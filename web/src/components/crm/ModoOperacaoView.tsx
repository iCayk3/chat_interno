import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  Database,
  Shuffle,
  CheckCircle2,
  Save,
  Key,
  CreditCard,
  Loader2,
  Lock,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { api } from '../../services/api';
import type { OperationMode, SystemSettings, SystemLicense } from '../../types/crm';

interface ModoOperacaoViewProps {
  onSettingsSaved?: (updated: SystemSettings) => void;
  license?: SystemLicense | null;
}

export const ModoOperacaoView: React.FC<ModoOperacaoViewProps> = ({
  onSettingsSaved,
  license: initialLicense,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [license, setLicense] = useState<SystemLicense | null>(initialLicense || null);

  const [mode, setMode] = useState<OperationMode>('erp');
  const [companyName, setCompanyName] = useState('');
  const [companyCnpj, setCompanyCnpj] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');

  const [accessToken, setAccessToken] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isSandbox, setIsSandbox] = useState(true);

  const [testingMp, setTestingMp] = useState(false);
  const [mpTestResult, setMpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/mercadopago`
    : '/api/webhooks/mercadopago';

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [data, lic] = await Promise.all([
        api.getSystemSettings(),
        api.getLicenseStatus().catch(() => null),
      ]);
      setSettings(data);
      if (lic) setLicense(lic);

      const allowed = lic?.allowedOperationMode || 'hybrid';
      let effectiveMode: OperationMode = data.operationMode || 'erp';
      if (allowed === 'erp' && effectiveMode !== 'erp') {
        effectiveMode = 'erp';
      } else if (allowed === 'native' && effectiveMode !== 'native') {
        effectiveMode = 'native';
      }

      setMode(effectiveMode);
      setCompanyName(data.companyName || '');
      setCompanyCnpj(data.companyCnpj || '');
      setCompanyPhone(data.companyPhone || '');
      setCompanyEmail(data.companyEmail || '');
      setPublicKey(data.mercadopago?.publicKey || '');
      setIsSandbox(data.mercadopago?.sandbox ?? true);
      setAccessToken('');
      setWebhookSecret('');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao carregar configurações' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const allowedMode = license?.allowedOperationMode || 'hybrid';
  const isErpDisabled = allowedMode === 'native';
  const isNativeDisabled = allowedMode === 'erp';
  const isHybridDisabled = allowedMode === 'erp' || allowedMode === 'native';

  const selectMode = (targetMode: OperationMode) => {
    if (targetMode === 'erp' && isErpDisabled) {
      setFeedback({
        type: 'error',
        message: 'O Modo ERP está bloqueado para esta instalação pelo Administrador Master.',
      });
      return;
    }
    if (targetMode === 'native' && isNativeDisabled) {
      setFeedback({
        type: 'error',
        message: 'O Modo Nativo está bloqueado para esta instalação pelo Administrador Master.',
      });
      return;
    }
    if (targetMode === 'hybrid' && isHybridDisabled) {
      setFeedback({
        type: 'error',
        message: 'O Modo Híbrido requer liberação de ambos os modos no Control Plane Master.',
      });
      return;
    }
    setMode(targetMode);
  };

  const handleTestMp = async () => {
    setTestingMp(true);
    setMpTestResult(null);
    try {
      const res = await api.testMercadoPago(accessToken.trim());
      setMpTestResult({ success: true, message: res.message || 'Conexão estabelecida com sucesso!' });
    } catch (err: any) {
      setMpTestResult({ success: false, message: err.message || 'Falha ao autenticar com o Mercado Pago' });
    } finally {
      setTestingMp(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const payload: any = {
        operationMode: mode,
        setupCompleted: true,
        companyName: companyName.trim(),
        companyCnpj: companyCnpj.replace(/\D/g, ''),
        companyPhone: companyPhone.replace(/\D/g, ''),
        companyEmail: companyEmail.trim(),
        mercadopago: {
          accessToken: accessToken.trim(),
          publicKey: publicKey.trim(),
          webhookSecret: webhookSecret.trim(),
          sandbox: isSandbox,
        },
      };

      const updated = await api.saveSystemSettings(payload);
      setSettings(updated);
      if (onSettingsSaved) {
        onSettingsSaved(updated);
      }
      setFeedback({ type: 'success', message: 'Configurações de operação e pagamento salvas com sucesso!' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao salvar configurações' });
    } finally {
      setSaving(false);
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  if (loading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Modo de Operação & Pagamentos
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
              {mode === 'erp' ? 'Modo ERP' : mode === 'native' ? 'Modo Nativo' : 'Modo Híbrido'}
            </span>
            {allowedMode !== 'hybrid' && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-1 border border-amber-200">
                <Lock className="w-3 h-3 text-amber-700" />
                <span>Restrito pelo Master: {allowedMode === 'erp' ? 'Apenas ERP' : 'Apenas Nativo'}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Defina como o software opera: integrado com ERP externo, base própria com Mercado Pago ou ambos simultâneos.
          </p>
        </div>

        <button
          onClick={loadSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors shadow-2xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Alerta de Política Master quando restrito */}
      {allowedMode !== 'hybrid' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 shadow-2xs">
          <div className="p-1.5 bg-amber-100 rounded-lg shrink-0 mt-0.5">
            <Lock className="w-4 h-4 text-amber-700" />
          </div>
          <div>
            <h4 className="font-bold text-amber-950">Política de Licença Mestre em Vigor</h4>
            <p className="text-amber-800 mt-0.5 leading-relaxed">
              O Administrador Master autorizou esta instalação exclusivamente para o{' '}
              <strong>{allowedMode === 'erp' ? 'Modo 1 (Integrado ao ERP RBXSoft ISP)' : 'Modo 2 (Banco Nativo + Mercado Pago)'}</strong>.
              Os outros modos estão bloqueados. Para desbloqueá-los, o administrador do Master Control Plane deve alterar a permissão.
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <Lock className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Seletor de Modo de Trabalho */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <span>1. Modo de Trabalho do Sistema</span>
          </div>
          <p className="text-xs text-slate-500">
            Alterne o modo operacional da aplicação conforme a arquitetura desejada:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Opção ERP */}
            <div
              onClick={() => selectMode('erp')}
              className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between relative ${
                isErpDisabled
                  ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-200'
                  : mode === 'erp'
                  ? 'border-blue-600 bg-blue-50/50 shadow-xs cursor-pointer'
                  : 'border-slate-200 hover:border-slate-300 bg-white cursor-pointer'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    isErpDisabled
                      ? 'bg-slate-200 text-slate-400'
                      : mode === 'erp'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Building2 className="w-5 h-5" />
                  </div>
                  {isErpDisabled ? (
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-500" />
                      <span>Restrito Master</span>
                    </span>
                  ) : mode === 'erp' ? (
                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                  ) : null}
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Modo 1: Integrado ao ERP</h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Utiliza exclusivamente a integração com o RBXSoft ISP para clientes, planos e títulos.
                </p>
              </div>
            </div>

            {/* Opção Nativo */}
            <div
              onClick={() => selectMode('native')}
              className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between relative ${
                isNativeDisabled
                  ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-200'
                  : mode === 'native'
                  ? 'border-emerald-600 bg-emerald-50/50 shadow-xs cursor-pointer'
                  : 'border-slate-200 hover:border-slate-300 bg-white cursor-pointer'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    isNativeDisabled
                      ? 'bg-slate-200 text-slate-400'
                      : mode === 'native'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Database className="w-5 h-5" />
                  </div>
                  {isNativeDisabled ? (
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-500" />
                      <span>Restrito Master</span>
                    </span>
                  ) : mode === 'native' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : null}
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Modo 2: Sistema Nativo + Mercado Pago</h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Gerencia clientes, planos e mensalidades no próprio banco com cobranças via Mercado Pago.
                </p>
              </div>
            </div>

            {/* Opção Híbrido */}
            <div
              onClick={() => selectMode('hybrid')}
              className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between relative ${
                isHybridDisabled
                  ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-200'
                  : mode === 'hybrid'
                  ? 'border-purple-600 bg-purple-50/50 shadow-xs cursor-pointer'
                  : 'border-slate-200 hover:border-slate-300 bg-white cursor-pointer'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    isHybridDisabled
                      ? 'bg-slate-200 text-slate-400'
                      : mode === 'hybrid'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Shuffle className="w-5 h-5" />
                  </div>
                  {isHybridDisabled ? (
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-500" />
                      <span>Restrito Master</span>
                    </span>
                  ) : mode === 'hybrid' ? (
                    <CheckCircle2 className="w-5 h-5 text-purple-600" />
                  ) : null}
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Modo 3: Híbrido (Ambos Ativos)</h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Permite consultar clientes no ERP e também gerenciar clientes na base nativa simultaneamente.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Integração Mercado Pago */}
        {(mode === 'native' || mode === 'hybrid') && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">2. Integração Mercado Pago (Pix & Boleto)</h3>
                  <p className="text-xs text-slate-500">Credenciais para emissão de cobranças e conciliação bancária</p>
                </div>
              </div>

              {settings?.mercadopago.configured && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Configurado</span>
                </span>
              )}
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">URL do Webhook do Mercado Pago:</span>
                <button
                  type="button"
                  onClick={copyWebhook}
                  className="px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium flex items-center gap-1 transition-colors self-start sm:self-auto"
                >
                  {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWebhook ? 'Copiado!' : 'Copiar URL'}</span>
                </button>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-slate-200 font-mono text-[11px] text-slate-600 break-all">
                {webhookUrl}
              </div>
              <p className="text-[11px] text-slate-400">
                Cadastre esta URL em seu painel do Mercado Pago com os eventos <code className="text-slate-600">payment.created</code> e <code className="text-slate-600">payment.updated</code> para baixa automática.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Access Token (Produção ou Sandbox)
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder={settings?.mercadopago.maskedToken || 'APP_USR-...'}
                    className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {settings?.mercadopago.maskedToken ? `Atual: ${settings.mercadopago.maskedToken} (deixe em branco para manter)` : 'Insira o token gerado no Mercado Pago'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Public Key (Chave Pública)</label>
                <input
                  type="text"
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder="APP_USR-..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Webhook Secret (Assinatura)</label>
                <input
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder={settings?.mercadopago.maskedWebhookSecret || 'Chave de assinatura HMAC'}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk-sandbox"
                  checked={isSandbox}
                  onChange={(e) => setIsSandbox(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="chk-sandbox" className="text-xs text-slate-700 cursor-pointer font-medium">
                  Modo de Testes (Sandbox)
                </label>
              </div>

              <button
                type="button"
                onClick={handleTestMp}
                disabled={testingMp || (!accessToken.trim() && !settings?.mercadopago.configured)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {testingMp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
                <span>Testar Conexão</span>
              </button>
            </div>

            {mpTestResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  mpTestResult.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {mpTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{mpTestResult.message}</span>
              </div>
            )}
          </div>
        )}

        {/* Dados da Empresa */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
            <Building2 className="w-5 h-5 text-blue-600" />
            <span>3. Dados da Empresa</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Comercial / Razão Social</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                placeholder="Ex: SOL Telecomunicações"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CNPJ</label>
              <input
                type="text"
                value={companyCnpj}
                onChange={(e) => setCompanyCnpj(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone Principal</label>
              <input
                type="text"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail de Contato / Suporte</label>
              <input
                type="email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                placeholder="suporte@provedor.com.br"
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Salvar Configurações</span>
          </button>
        </div>
      </form>
    </div>
  );
};

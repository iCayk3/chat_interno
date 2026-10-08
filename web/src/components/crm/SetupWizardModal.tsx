import React, { useState } from 'react';
import {
  ShieldCheck,
  Building2,
  Database,
  Shuffle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  CreditCard,
  Key,
  ExternalLink,
  Loader2,
  Lock,
} from 'lucide-react';
import { api } from '../../services/api';
import type { OperationMode, SystemSettings, SystemLicense } from '../../types/crm';

interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: (settings: SystemSettings) => void;
  currentSettings?: SystemSettings | null;
  license?: SystemLicense | null;
}

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({
  isOpen,
  onClose,
  onCompleted,
  currentSettings,
  license,
}) => {
  const allowedMode = license?.allowedOperationMode || 'hybrid';
  const isErpDisabled = allowedMode === 'native';
  const isNativeDisabled = allowedMode === 'erp';
  const isHybridDisabled = allowedMode === 'erp' || allowedMode === 'native';

  const initialMode: OperationMode =
    allowedMode === 'erp'
      ? 'erp'
      : allowedMode === 'native'
      ? 'native'
      : currentSettings?.operationMode || 'erp';

  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<OperationMode>(initialMode);
  const [companyName, setCompanyName] = useState(currentSettings?.companyName || 'SOL Provedor de Internet');
  const [companyCnpj, setCompanyCnpj] = useState(currentSettings?.companyCnpj || '');
  const [accessToken, setAccessToken] = useState('');
  const [publicKey, setPublicKey] = useState(currentSettings?.mercadopago.publicKey || '');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isSandbox, setIsSandbox] = useState(currentSettings?.mercadopago.sandbox ?? true);

  const [testingMp, setTestingMp] = useState(false);
  const [mpTestResult, setMpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTestMercadoPago = async () => {
    if (!accessToken.trim()) {
      setMpTestResult({ success: false, message: 'Digite o Access Token para realizar o teste.' });
      return;
    }
    setTestingMp(true);
    setMpTestResult(null);
    try {
      const res = await api.testMercadoPago(accessToken.trim());
      setMpTestResult({ success: true, message: res.message || 'Credenciais validadas com sucesso!' });
    } catch (err: any) {
      setMpTestResult({ success: false, message: err.message || 'Falha ao autenticar com o Mercado Pago' });
    } finally {
      setTestingMp(false);
    }
  };

  const handleFinishSetup = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        operationMode: mode,
        setupCompleted: true,
        companyName: companyName.trim(),
        companyCnpj: companyCnpj.replace(/\D/g, ''),
      };

      if (mode === 'native' || mode === 'hybrid') {
        payload.mercadopago = {
          accessToken: accessToken.trim(),
          publicKey: publicKey.trim(),
          webhookSecret: webhookSecret.trim(),
          sandbox: isSandbox,
        };
      }

      const updated = await api.saveSystemSettings(payload);
      onCompleted(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar configurações de instalação');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Assistente de Instalação & Ativação</h2>
              <p className="text-xs text-blue-100">
                Configure o modo operacional do sistema para a sua empresa ou clientes
              </p>
            </div>
          </div>

          {/* Stepper indicator */}
          <div className="flex items-center gap-2 mt-5">
            <div className={`flex-1 h-1.5 rounded-full ${step >= 1 ? 'bg-white' : 'bg-white/20'}`} />
            <div className={`flex-1 h-1.5 rounded-full ${step >= 2 ? 'bg-white' : 'bg-white/20'}`} />
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Passo 1 de 2: Selecione o Modo de Trabalho do Sistema
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Escolha como os clientes e as cobranças financeiras serão gerenciados:
                </p>
              </div>

              {allowedMode !== 'hybrid' && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Política do Master Ativa: </span>
                    Esta instalação está liberada exclusivamente para o{' '}
                    <strong>{allowedMode === 'erp' ? 'Modo 1 (ERP Externo)' : 'Modo 2 (Nativo + Mercado Pago)'}</strong>.
                    As opções não autorizadas estão bloqueadas.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3.5 pt-1">
                {/* Opção 1: Modo ERP */}
                <div
                  onClick={() => {
                    if (isErpDisabled) {
                      setError('O Modo ERP está bloqueado para esta instalação pelo Administrador Master.');
                      return;
                    }
                    setMode('erp');
                    setError(null);
                  }}
                  className={`p-4 rounded-xl border-2 transition-all flex items-start gap-3.5 relative ${
                    isErpDisabled
                      ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-200'
                      : mode === 'erp'
                      ? 'border-blue-600 bg-blue-50/60 shadow-xs cursor-pointer'
                      : 'border-slate-200 hover:border-slate-300 bg-white cursor-pointer'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    isErpDisabled
                      ? 'bg-slate-200 text-slate-400'
                      : mode === 'erp'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 text-sm">Modo 1: Integrado ao ERP (RBXSoft ISP)</h4>
                      {isErpDisabled ? (
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center gap-1">
                          <Lock className="w-3 h-3 text-slate-500" />
                          <span>Restrito Master</span>
                        </span>
                      ) : mode === 'erp' ? (
                        <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Ideal para quem já possui o RBXSoft. Os cadastros de clientes, planos, contratos e faturas são lidos diretamente do banco do ERP.
                    </p>
                  </div>
                </div>

                {/* Opção 2: Modo Nativo */}
                <div
                  onClick={() => {
                    if (isNativeDisabled) {
                      setError('O Modo Nativo está bloqueado para esta instalação pelo Administrador Master.');
                      return;
                    }
                    setMode('native');
                    setError(null);
                  }}
                  className={`p-4 rounded-xl border-2 transition-all flex items-start gap-3.5 relative ${
                    isNativeDisabled
                      ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-200'
                      : mode === 'native'
                      ? 'border-emerald-600 bg-emerald-50/60 shadow-xs cursor-pointer'
                      : 'border-slate-200 hover:border-slate-300 bg-white cursor-pointer'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    isNativeDisabled
                      ? 'bg-slate-200 text-slate-400'
                      : mode === 'native'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Database className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 text-sm">Modo 2: Banco de Dados Próprio + Mercado Pago</h4>
                      {isNativeDisabled ? (
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center gap-1">
                          <Lock className="w-3 h-3 text-slate-500" />
                          <span>Restrito Master</span>
                        </span>
                      ) : mode === 'native' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Ideal para venda e comercialização independente. O sistema gerencia seus próprios clientes, produtos/serviços, mensalidades e realiza cobranças via <strong>Mercado Pago (Pix e Boleto)</strong>.
                    </p>
                  </div>
                </div>

                {/* Opção 3: Modo Híbrido */}
                <div
                  onClick={() => {
                    if (isHybridDisabled) {
                      setError('O Modo Híbrido requer liberação de ambos os modos no Control Plane Master.');
                      return;
                    }
                    setMode('hybrid');
                    setError(null);
                  }}
                  className={`p-4 rounded-xl border-2 transition-all flex items-start gap-3.5 relative ${
                    isHybridDisabled
                      ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-200'
                      : mode === 'hybrid'
                      ? 'border-purple-600 bg-purple-50/60 shadow-xs cursor-pointer'
                      : 'border-slate-200 hover:border-slate-300 bg-white cursor-pointer'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    isHybridDisabled
                      ? 'bg-slate-200 text-slate-400'
                      : mode === 'hybrid'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Shuffle className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 text-sm">Modo 3: Híbrido (Ambos Ativos)</h4>
                      {isHybridDisabled ? (
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center gap-1">
                          <Lock className="w-3 h-3 text-slate-500" />
                          <span>Restrito Master</span>
                        </span>
                      ) : mode === 'hybrid' ? (
                        <CheckCircle2 className="w-5 h-5 text-purple-600 shrink-0" />
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Permite consultar tanto os clientes do ERP quanto cadastrar novos clientes diretamente na base nativa com cobranças do Mercado Pago.
                    </p>
                  </div>
                </div>
              </div>

              {/* Informações da Empresa */}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da Empresa / Provedor</label>
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
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Passo 2 de 2: {mode === 'erp' ? 'Conclusão da Instalação' : 'Credenciais do Mercado Pago'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {mode === 'erp'
                    ? 'O sistema está pronto para operar em modo integrado ao ERP RBXSoft.'
                    : 'Insira suas credenciais da API do Mercado Pago para emissão de Pix e Boletos.'}
                </p>
              </div>

              {mode === 'erp' ? (
                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-3">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>Modo ERP RBXSoft Selecionado</span>
                  </div>
                  <p>
                    O sistema utilizará a conexão já configurada com o seu servidor RBXSoft para localizar clientes, faturas, emitir segunda via e registrar promessas de pagamento.
                  </p>
                  <p className="text-slate-500">
                    Você pode alterar para o Modo Nativo ou configurar o Mercado Pago a qualquer momento na tela de <strong>Configurações do Sistema</strong>.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800 flex items-start justify-between gap-2">
                    <div>
                      Obtenha suas credenciais no{' '}
                      <a
                        href="https://www.mercadopago.com.br/developers/panel/app"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold underline inline-flex items-center gap-1"
                      >
                        Painel do Desenvolvedor do Mercado Pago <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Access Token <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Key className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        placeholder="APP_USR-..."
                        className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Token de Produção ou Testes (Sandbox)
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Public Key (Chave Pública)
                    </label>
                    <div className="relative">
                      <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={publicKey}
                        onChange={(e) => setPublicKey(e.target.value)}
                        placeholder="APP_USR-..."
                        className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Webhook Secret (Opcional - Validação de Assinatura)
                    </label>
                    <input
                      type="password"
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder="Chave secreta de assinatura do Webhook"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="mp-sandbox"
                      checked={isSandbox}
                      onChange={(e) => setIsSandbox(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="mp-sandbox" className="text-xs text-slate-700 cursor-pointer">
                      Modo de Testes (Sandbox) ativado
                    </label>
                  </div>

                  {/* Botão de teste de conexão */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleTestMercadoPago}
                      disabled={testingMp || !accessToken.trim()}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {testingMp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
                      <span>Testar Conexão com Mercado Pago</span>
                    </button>

                    {mpTestResult && (
                      <div
                        className={`mt-2 p-2.5 rounded-lg text-xs flex items-center gap-1.5 ${
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
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          {step === 1 ? (
            <div>
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium"
              >
                Pular por enquanto
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar</span>
            </button>
          )}

          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
            >
              <span>Avançar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinishSetup}
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>Concluir Instalação</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

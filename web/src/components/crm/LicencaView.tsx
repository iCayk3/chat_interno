import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Clock,
  Building,
  Users,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Tag,
  QrCode,
  Copy,
  Check,
  Phone,
  Mail,
  Lock,
  Sparkles,
  CreditCard,
  Zap,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';
import type { SystemLicense, LicensePlanOptions, LicenseCheckoutResult } from '../../types/crm';
import { api } from '../../services/api';

interface LicencaViewProps {
  onLicenseUpdated?: (lic: SystemLicense) => void;
}

export const LicencaView: React.FC<LicencaViewProps> = ({ onLicenseUpdated }) => {
  const [license, setLicense] = useState<SystemLicense | null>(null);
  const [plans, setPlans] = useState<LicensePlanOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedPix, setCopiedPix] = useState(false);

  // Seleção de contratação (Mensal vs Anual e Forma de Pagamento)
  const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'annual'>('monthly');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'mercadopago'>('pix');
  const [generatingPayment, setGeneratingPayment] = useState(false);
  const [checkoutData, setCheckoutData] = useState<LicenseCheckoutResult | null>(null);
  const [isWaitingPayment, setIsWaitingPayment] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);

  const pollIntervalRef = useRef<any>(null);

  const fetchLicenseData = async () => {
    try {
      setLoading(true);
      const [licData, planOptions] = await Promise.all([
        api.getLicenseStatus().catch(() => null),
        api.getLicensePlans().catch(() => null),
      ]);

      if (licData) {
        setLicense(licData);
        if (onLicenseUpdated) onLicenseUpdated(licData);
        // Se já tiver PIX ativo no registro da licença, pré-carrega
        if (licData.paymentPix && !checkoutData) {
          setCheckoutData({
            success: true,
            licenseKey: licData.licenseKey,
            cycle: 'monthly',
            amount: licData.paymentAmount || 299.9,
            paymentMethod: 'pix',
            paymentPix: licData.paymentPix,
            paymentQrCode: licData.paymentQRCodeBase64,
            status: 'pending',
            message: 'Cobrança ativa para regularização',
          });
        }
      }

      if (planOptions) {
        setPlans(planOptions);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar dados de licenciamento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenseData();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Polling automático enquanto aguarda pagamento
  useEffect(() => {
    if (isWaitingPayment) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await api.checkPaymentStatus();
          if (res.active && (res.license.status === 'active' || res.license.licenseType === 'paid')) {
            setLicense(res.license);
            setIsWaitingPayment(false);
            setCheckoutData(null);
            setSuccessMsg('🎉 Pagamento identificado pelo Master! Seu sistema foi liberado com sucesso.');
            if (onLicenseUpdated) onLicenseUpdated(res.license);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          }
        } catch {
          // Ignora falhas transitórias durante o polling
        }
      }, 3500);
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isWaitingPayment]);

  const handleRefresh = async () => {
    try {
      setSyncing(true);
      setErrorMsg('');
      setSuccessMsg('');
      const res = await api.checkPaymentStatus();
      setLicense(res.license);
      setSuccessMsg('Sincronização com o Servidor Master concluída com sucesso!');
      if (onLicenseUpdated && res.license) onLicenseUpdated(res.license);

      if (res.active && res.license.status === 'active') {
        setIsWaitingPayment(false);
        setCheckoutData(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao sincronizar com o Servidor Master.');
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateCheckout = async () => {
    try {
      setGeneratingPayment(true);
      setErrorMsg('');
      setSuccessMsg('');

      const result = await api.createLicenseCheckout(selectedCycle, paymentMethod);
      setCheckoutData(result);

      if (paymentMethod === 'mercadopago' && result.checkoutUrl) {
        window.open(result.checkoutUrl, '_blank');
      }

      setIsWaitingPayment(true);
      setSuccessMsg('Cobrança gerada com sucesso! Realize o pagamento para liberação automática.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao gerar pagamento. Verifique com o administrador.');
    } finally {
      setGeneratingPayment(false);
    }
  };

  const handleManualCheckPayment = async () => {
    try {
      setCheckingPayment(true);
      setErrorMsg('');
      const res = await api.checkPaymentStatus();
      setLicense(res.license);

      if (res.active && (res.license.status === 'active' || res.license.licenseType === 'paid')) {
        setIsWaitingPayment(false);
        setCheckoutData(null);
        setSuccessMsg('🎉 Pagamento aprovado! O sistema está ativo com atendentes ilimitados.');
        if (onLicenseUpdated) onLicenseUpdated(res.license);
      } else {
        setErrorMsg('O pagamento ainda não foi identificado pelo Master. Aguarde alguns instantes ou tente novamente.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao consultar status no Master.');
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleCopyPix = () => {
    const pixText = checkoutData?.paymentPix || license?.paymentPix;
    if (pixText) {
      navigator.clipboard.writeText(pixText);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-12 text-slate-500 bg-slate-50/60">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="text-sm font-medium">Carregando status de licenciamento...</p>
      </div>
    );
  }

  const isTrial = license?.status === 'trial' || license?.licenseType === 'trial';
  const isSuspended = license?.status === 'suspended' || license?.status === 'revoked';
  const isCortesia = license?.licenseType === 'cortesia';
  const isPaid = license?.status === 'active' && license?.licenseType === 'paid';

  // Preços calculados (com descontos do tenant se aplicáveis)
  const monthlyPrice = plans?.finalMonthlyPrice ?? 299.9;
  const annualPrice = plans?.finalAnnualPrice ?? 2990.0;
  const originalMonthly = plans?.monthlyPrice ?? 299.9;
  const hasDiscount = (plans?.discountAmount ?? 0) > 0;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Header Padronizado do CRM */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Licenciamento e Assinatura
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                isSuspended
                  ? 'bg-red-100 text-red-800'
                  : isTrial
                  ? 'bg-amber-100 text-amber-800'
                  : isCortesia
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {isSuspended ? 'Bloqueado' : isTrial ? 'Em Avaliação' : isCortesia ? 'Cortesia' : isPaid ? 'Assinatura Comercial Ativa' : 'Ativo'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Escolha seu plano mensal ou anual. Pagamento identificado e liberado automaticamente pelo Master.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={syncing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>Sincronizar com Master</span>
          </button>
        </div>
      </div>

      {/* Alertas de Feedback */}
      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span className="font-medium">{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-medium">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700 font-bold">×</button>
        </div>
      )}

      {/* Resumo de Status e Métricas (Sem limite de atendentes!) */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div
            className={`p-2.5 rounded-xl border ${
              isSuspended
                ? 'bg-red-50 border-red-200 text-red-600'
                : isTrial
                ? 'bg-amber-50 border-amber-200 text-amber-600'
                : 'bg-emerald-50 border-emerald-200 text-emerald-600'
            }`}
          >
            {isSuspended ? (
              <Lock className="w-5 h-5" />
            ) : isTrial ? (
              <Clock className="w-5 h-5" />
            ) : (
              <ShieldCheck className="w-5 h-5" />
            )}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">
              Situação da Instalação
            </h2>
            <p className="text-xs text-slate-500">
              Controle automatizado: pagou usou, não pagou bloqueou. Sem limites de operadores.
            </p>
          </div>
        </div>

        {/* Grade de 4 Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Status Geral */}
          <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl">
            <span className="text-xs text-slate-500 block mb-1.5 font-medium">Status do Sistema</span>
            <div className="flex items-center">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  isSuspended
                    ? 'bg-red-100 text-red-800 border border-red-200'
                    : isCortesia
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : isTrial
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {isSuspended
                  ? 'Acesso Suspenso'
                  : isCortesia
                  ? 'Cortesia Especial'
                  : isTrial
                  ? 'Período de Testes'
                  : 'Assinatura Ativa'}
              </span>
            </div>
          </div>

          {/* 2. Prazo Restante */}
          <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl">
            <span className="text-xs text-slate-500 block mb-1.5 font-medium">
              {isTrial ? 'Período Gratuito Restante' : 'Vigência da Licença'}
            </span>
            <span className="text-base font-bold text-slate-800 flex items-center gap-1.5">
              {isTrial ? (
                <>
                  <Clock className="w-4 h-4 text-amber-600" />
                  {license?.trialDaysRemaining ?? 0} dias restantes
                </>
              ) : isCortesia ? (
                'Permanente (Cortesia)'
              ) : (
                `Válido até ${license?.expiresAt ? new Date(license.expiresAt).toLocaleDateString('pt-BR') : 'Ativo'}`
              )}
            </span>
          </div>

          {/* 3. Atendentes ILIMITADOS (Conforme solicitação do usuário) */}
          <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-xl">
            <span className="text-xs text-emerald-800 block mb-1.5 font-semibold">Atendentes & Conexões</span>
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-700" />
              <span className="text-base font-extrabold text-emerald-800">Ilimitados</span>
            </div>
            <span className="text-[11px] text-emerald-600 font-medium block mt-0.5">Sem restrição de operadores</span>
          </div>

          {/* 4. Módulos Liberados */}
          <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl">
            <span className="text-xs text-slate-500 block mb-1.5 font-medium">Módulos Habilitados</span>
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 truncate">
              <Layers className="w-4 h-4 text-blue-600 shrink-0" />
              Todos os Recursos Liberados
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Omnichannel + CRM + Financeiro</span>
          </div>
        </div>

        {/* Informações da Instalação */}
        <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-500 font-medium block mb-0.5">Empresa / Razão Social:</span>
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-500" />
              {license?.tenantName || 'Empresa em Operação'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 font-medium block mb-0.5">CNPJ Cadastrado:</span>
            <span className="font-semibold text-slate-800">
              {license?.tenantCnpj || 'Não vinculado'}
            </span>
          </div>
        </div>

        {/* Benefício Promocional (se concedido) */}
        {license?.discountDescription && (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between text-xs text-purple-900">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-purple-700 shrink-0" />
              <span className="font-bold">Desconto Especial Concedido no Master:</span>
              <span>{license.discountDescription}</span>
            </div>
            {license.discountAmount && license.discountAmount > 0 && (
              <span className="font-bold text-purple-800 text-sm">
                -
                {license.discountAmount.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* SELEÇÃO DE PLANO E FORMA DE PAGAMENTO (100% AUTOMATIZADO) */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-6">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-600" />
            Escolha seu Plano de Assinatura
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Selecione entre cobrança mensal ou anual e a forma de pagamento. O Master identifica a liquidação e desbloqueia o sistema na mesma hora.
          </p>
        </div>

        {/* 2 Planos: Mensal vs Anual */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card Mensal */}
          <div
            onClick={() => setSelectedCycle('monthly')}
            className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
              selectedCycle === 'monthly'
                ? 'border-blue-600 bg-blue-50/40 shadow-xs ring-2 ring-blue-100'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                Plano Mensal
              </span>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedCycle === 'monthly'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300'
                }`}
              >
                {selectedCycle === 'monthly' && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">
                  {monthlyPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-xs font-semibold text-slate-500">/ mês</span>
              </div>
              {hasDiscount && (
                <span className="text-xs text-purple-700 font-semibold line-through">
                  De {originalMonthly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              )}
            </div>

            <ul className="space-y-2 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <strong className="text-slate-800">Atendentes e Operadores Ilimitados</strong>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Cobrança recorrente a cada 30 dias</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Sem multas ou fidelidade</span>
              </li>
            </ul>
          </div>

          {/* Card Anual (Mais Vantajoso) */}
          <div
            onClick={() => setSelectedCycle('annual')}
            className={`p-5 rounded-2xl border-2 cursor-pointer transition-all relative overflow-hidden ${
              selectedCycle === 'annual'
                ? 'border-blue-600 bg-blue-50/40 shadow-xs ring-2 ring-blue-100'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-600" />
                2 Meses Grátis (Econômico)
              </span>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedCycle === 'annual'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300'
                }`}
              >
                {selectedCycle === 'annual' && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">
                  {annualPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-xs font-semibold text-slate-500">/ ano</span>
              </div>
              <span className="text-xs text-emerald-700 font-semibold block">
                Equivalente a {(annualPrice / 12).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / mês
              </span>
            </div>

            <ul className="space-y-2 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <strong className="text-slate-800">Atendentes e Operadores Ilimitados</strong>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>365 dias de tranquilidade garantidos</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <strong className="text-emerald-700">Economia real de 2 mensalidades inteiras</strong>
              </li>
            </ul>
          </div>
        </div>

        {/* Escolha da Forma de Pagamento */}
        <div className="pt-2 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-700 block mb-2.5">
            Como deseja pagar?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentMethod('pix')}
              className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all text-left ${
                paymentMethod === 'pix'
                  ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-100'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
              }`}
            >
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold block">PIX (Liberação Automática Instantânea)</span>
                <span className="text-[11px] text-slate-500">QR Code e Chave Copia e Cola na hora</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('mercadopago')}
              className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all text-left ${
                paymentMethod === 'mercadopago'
                  ? 'border-blue-500 bg-blue-50/50 text-blue-900 ring-2 ring-blue-100'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
              }`}
            >
              <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold block">Mercado Pago (Cartão / Link Seguro)</span>
                <span className="text-[11px] text-slate-500">Checkout transparente oficial do Master</span>
              </div>
            </button>
          </div>
        </div>

        {/* Botão de Ação */}
        <div>
          <button
            type="button"
            disabled={generatingPayment}
            onClick={handleGenerateCheckout}
            className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            {generatingPayment ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : paymentMethod === 'pix' ? (
              <QrCode className="w-4 h-4" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            {paymentMethod === 'pix' ? 'Gerar PIX para Liberação' : 'Prosseguir para Checkout Seguro'}
          </button>
        </div>
      </div>

      {/* ÁREA DE PAGAMENTO ATIVA (PIX / MERCADO PAGO COM POLLING EM TEMPO REAL) */}
      {(checkoutData || license?.paymentPix) && (
        <div className="bg-white border-2 border-emerald-500/80 rounded-2xl p-6 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 pb-4">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
              Aguardando Liquidação do Pagamento
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-extrabold text-emerald-700">
                {(checkoutData?.amount ?? license?.paymentAmount ?? 299.9).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
              <button
                onClick={handleManualCheckPayment}
                disabled={checkingPayment}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingPayment ? 'animate-spin' : ''}`} />
                Já paguei, verificar agora
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-6">
            {(checkoutData?.paymentQrCode || license?.paymentQRCodeBase64) && (
              <div className="shrink-0 bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                <img
                  src={
                    (checkoutData?.paymentQrCode || license?.paymentQRCodeBase64 || '').startsWith('data:')
                      ? (checkoutData?.paymentQrCode || license?.paymentQRCodeBase64 || '')
                      : `data:image/png;base64,${checkoutData?.paymentQrCode || license?.paymentQRCodeBase64}`
                  }
                  alt="QR Code PIX"
                  className="w-40 h-40"
                />
              </div>
            )}

            <div className="flex-1 w-full space-y-3">
              <div>
                <label className="text-xs text-slate-700 font-bold block mb-1">
                  Código PIX Copia e Cola:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={checkoutData?.paymentPix || license?.paymentPix || ''}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 select-all focus:outline-none"
                  />
                  <button
                    onClick={handleCopyPix}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs"
                  >
                    {copiedPix ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedPix ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              {checkoutData?.checkoutUrl && (
                <div>
                  <a
                    href={checkoutData.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir link de pagamento no Mercado Pago em nova aba
                  </a>
                </div>
              )}

              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
                <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-emerald-600" />
                <span>
                  O Master está monitorando esta transação. Assim que o pagamento for concluído, esta tela será atualizada e o sistema liberado imediatamente.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contato Comercial & Suporte */}
      {(license?.contactSupportPhone || license?.contactSupportEmail) && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 shadow-2xs">
          <div>
            <span className="font-bold text-slate-800 block mb-0.5">
              Dúvidas sobre o licenciamento ou pagamentos?
            </span>
            <span>Entre em contato direto com a equipe de suporte do sistema.</span>
          </div>
          <div className="flex items-center gap-3">
            {license.contactSupportPhone && (
              <a
                href={`https://wa.me/55${license.contactSupportPhone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl border border-emerald-200 font-semibold transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                {license.contactSupportPhone}
              </a>
            )}
            {license.contactSupportEmail && (
              <a
                href={`mailto:${license.contactSupportEmail}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl border border-blue-200 font-semibold transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                {license.contactSupportEmail}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

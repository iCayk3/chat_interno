import React, { useState, useEffect } from 'react';
import {
  Server,
  CheckCircle,
  RefreshCw,
  ExternalLink,
  Database,
  Check,
  Save,
  AlertCircle,
  Wifi,
} from 'lucide-react';
import type { RBXConfig } from '../../types/crm';
import { api } from '../../services/api';

export const IntegracoesView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'rbx' | 'outros' | 'webhooks'>('rbx');

  // Estado da Configuração do RBXSoft ISP
  const [rbxConfig, setRbxConfig] = useState<RBXConfig>({
    baseUrl: 'https://provedor.rbxsoft.com/routerbox/ws_json/ws_json.php',
    apiKey: 'UAHS531AUSHUQ727182HNUHE18H37H',
    version: 'v1',
    enabled: true,
    simulationMode: true,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    loadRbxConfig();
  }, []);

  const loadRbxConfig = async () => {
    setIsLoading(true);
    try {
      const cfg = await api.getRbxConfig();
      setRbxConfig(cfg);
    } catch {
      // Mantém valores padrão
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveRbxConfig = async () => {
    setIsSaving(true);
    setSaveSuccess(null);
    try {
      await api.saveRbxConfig(rbxConfig);
      setSaveSuccess('Configurações do RBX salvas com sucesso no PostgreSQL!');
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar configurações do RBX');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestRbx = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testRbxConnection();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: err.message || 'Falha ao testar conexão com o RBX.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <span>Integrações & Conectores ERP</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
              RBXSoft ISP Oficial
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Conecte o chat diretamente ao RBXSoft ISP para busca de clientes por CPF/CNPJ, consulta de faturas e liberação em confiança.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isLoading ? (
            <div className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-spin" />
              <span>Carregando configurações...</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>RBX ISP Conectado</span>
            </div>
          )}
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          {saveSuccess}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('rbx')}
          className={`pb-3 transition-colors relative flex items-center gap-2 ${
            activeTab === 'rbx'
              ? 'text-blue-600 font-bold border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>RBXSoft ISP (V1 & V2)</span>
        </button>
        <button
          onClick={() => setActiveTab('outros')}
          className={`pb-3 transition-colors relative flex items-center gap-2 ${
            activeTab === 'outros'
              ? 'text-blue-600 font-bold border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>Outros ERPs Corporativos</span>
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          className={`pb-3 transition-colors relative flex items-center gap-2 ${
            activeTab === 'webhooks'
              ? 'text-blue-600 font-bold border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ExternalLink className="w-4 h-4" />
          <span>Webhooks & Eventos</span>
        </button>
      </div>

      {/* ABA 1: RBXSOFT ISP */}
      {activeTab === 'rbx' && (
        <div className="space-y-6 max-w-4xl">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Header do Card RBX */}
            <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/40">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold shadow-xs">
                  <Wifi className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <span>RBXSoft ISP Web Services</span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      REST + JSON
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Integração com ConsultaClientes (V1), Documentos em Aberto, Pix Copia e Cola e Aviso de Pagamento (V2).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestRbx}
                  disabled={isTesting}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-2 transition-colors disabled:opacity-50 shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-blue-600' : ''}`} />
                  <span>{isTesting ? 'Testando...' : 'Testar Conexão RBX'}</span>
                </button>

                <button
                  onClick={handleSaveRbxConfig}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-2 transition-colors shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Salvando...' : 'Salvar no Banco'}</span>
                </button>
              </div>
            </div>

            {/* Resultado do Teste */}
            {testResult && (
              <div
                className={`p-4 border-b text-xs flex items-center justify-between ${
                  testResult.success
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                    : 'bg-rose-50 border-rose-100 text-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span className="font-medium">{testResult.message}</span>
                </div>
                {testResult.latencyMs > 0 && (
                  <span className="font-mono font-bold text-emerald-700">
                    {testResult.latencyMs}ms
                  </span>
                )}
              </div>
            )}

            {/* Formulário de Configuração do RBX */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              <div className="md:col-span-2">
                <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[11px]">
                  URL do Web Service RBX (Endpoint ws_json.php)
                </label>
                <input
                  type="text"
                  value={rbxConfig.baseUrl}
                  onChange={(e) => setRbxConfig({ ...rbxConfig, baseUrl: e.target.value })}
                  placeholder="https://seuprovedor.rbxsoft.com/routerbox/ws_json/ws_json.php"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Disponível no menu: <em>Empresa &gt; Parâmetros &gt; Web Services</em> no painel do seu RBXSoft ISP.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[11px]">
                  Chave de Integração (ChaveIntegracao / authentication_key)
                </label>
                <input
                  type="password"
                  value={rbxConfig.apiKey}
                  onChange={(e) => setRbxConfig({ ...rbxConfig, apiKey: e.target.value })}
                  placeholder="Chave de acesso exclusiva gerada no RBX"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[11px]">
                  Versão da API do RBX
                </label>
                <select
                  value={rbxConfig.version}
                  onChange={(e) => setRbxConfig({ ...rbxConfig, version: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="v1">RBXSoft v1.0 (ChaveIntegracao no JSON)</option>
                  <option value="v2">RBXSoft v2.0 (Header authentication_key + Pix / Boletos)</option>
                </select>
              </div>

              <div className="md:col-span-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block">
                    Modo de Simulação / Homologação Local
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Permite testar todas as funcionalidades financeiras e de cadastro com dados realistas sem depender de um servidor RBX externo rodando.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rbxConfig.simulationMode}
                    onChange={(e) => setRbxConfig({ ...rbxConfig, simulationMode: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            {/* Módulos Integrados */}
            <div className="p-6 bg-slate-50/50 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                Recursos Habilitados da API RBX no Atendimento
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 text-blue-900 flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-xs">ConsultaClientes (CPF/CNPJ)</div>
                    <p className="text-[11px] text-slate-500">
                      Identificação obrigatória antes de abrir a fila do chat.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 text-emerald-900 flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-xs">Documentos em Aberto (V2)</div>
                    <p className="text-[11px] text-slate-500">
                      Títulos a receber exibidos na barra lateral do atendente.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/40 text-purple-900 flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-xs">Pix Copia e Cola & Boleto</div>
                    <p className="text-[11px] text-slate-500">
                      Envio instantâneo do código PIX diretamente no chat.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 text-amber-900 flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-xs">Aviso de Pagamento (Promessa)</div>
                    <p className="text-[11px] text-slate-500">
                      Desbloqueio temporário da conexão em confiança por 48 horas.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-cyan-200 bg-cyan-50/40 text-cyan-900 flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-xs">Status da Conexão & Fibra</div>
                    <p className="text-[11px] text-slate-500">
                      Verificação em tempo real se o cliente está online ou bloqueado.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: OUTROS ERPS */}
      {activeTab === 'outros' && (
        <div className="space-y-4 max-w-4xl">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="font-bold text-slate-800 text-sm">
              Conectores Adicionais de ERP & CRM
            </h3>
            <p className="text-xs text-slate-500">
              O sistema SOL CRM possui adaptadores extensíveis para integrar simultaneamente com outros sistemas legados.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-4 border rounded-xl bg-slate-50 text-slate-700">
                <span className="font-bold text-xs block">TOTVS Protheus</span>
                <span className="text-[11px] text-slate-500">Módulo Financeiro & Faturamento</span>
              </div>
              <div className="p-4 border rounded-xl bg-slate-50 text-slate-700">
                <span className="font-bold text-xs block">SAP Business One</span>
                <span className="text-[11px] text-slate-500">Service Layer REST</span>
              </div>
              <div className="p-4 border rounded-xl bg-slate-50 text-slate-700">
                <span className="font-bold text-xs block">Bling / Tiny</span>
                <span className="text-[11px] text-slate-500">E-commerce & Ordens</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: WEBHOOKS */}
      {activeTab === 'webhooks' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 max-w-4xl">
          <h3 className="font-bold text-slate-800 text-sm">
            Endpoints de Webhooks para Eventos do RBX
          </h3>
          <p className="text-xs text-slate-500">
            Configure estes webhooks na interface do RBX ISP para que eventos de faturamento e baixa de pagamentos atualizem o CRM em tempo real:
          </p>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs flex justify-between items-center">
            <span className="text-slate-700">POST https://chat.solcrm.com.br/api/webhooks/rbx/payment-received</span>
            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold">Ativo</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs flex justify-between items-center">
            <span className="text-slate-700">POST https://chat.solcrm.com.br/api/webhooks/rbx/contract-status</span>
            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold">Ativo</span>
          </div>
        </div>
      )}
    </div>
  );
};

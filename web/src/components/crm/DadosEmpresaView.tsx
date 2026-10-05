import React, { useState } from 'react';
import {
  Save,
  Check,
} from 'lucide-react';

export const DadosEmpresaView: React.FC = () => {
  const [company, setCompany] = useState({
    razaoSocial: 'SOL PROVEDOR DE INTERNET E TELECOMUNICACOES LTDA',
    nomeFantasia: 'SOL Telecom Fibra',
    cnpj: '18.492.381/0001-94',
    inscricaoEstadual: '901.849.201.112',
    telefone: '(11) 3456-7890',
    whatsapp: '(11) 98765-4321',
    emailSuporte: 'atendimento@solprovedor.com.br',
    endereco: 'Av. Paulista, 1500, Bela Vista, São Paulo - SP',
    horarioExpediente: 'Segunda a Sexta das 08:00 às 18:00 | Sábado das 08:00 às 12:00',
    plantaoTecnico: '24 horas / 7 dias por semana para emergências de fibra',
  });

  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Dados da Empresa & Expediente
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Informações cadastrais exibidas aos clientes e utilizadas na integração com o ERP.
          </p>
        </div>

        <button
          onClick={handleSubmit}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors"
        >
          {saved ? <Check className="w-4 h-4 text-white" /> : <Save className="w-4 h-4" />}
          <span>{saved ? 'Salvo com Sucesso!' : 'Salvar Alterações'}</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Razão Social (Oficial)
            </label>
            <input
              type="text"
              value={company.razaoSocial}
              onChange={(e) => setCompany({ ...company, razaoSocial: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Nome Fantasia
            </label>
            <input
              type="text"
              value={company.nomeFantasia}
              onChange={(e) => setCompany({ ...company, nomeFantasia: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              CNPJ
            </label>
            <input
              type="text"
              value={company.cnpj}
              onChange={(e) => setCompany({ ...company, cnpj: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Inscrição Estadual
            </label>
            <input
              type="text"
              value={company.inscricaoEstadual}
              onChange={(e) => setCompany({ ...company, inscricaoEstadual: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              WhatsApp Oficial de Atendimento
            </label>
            <input
              type="text"
              value={company.whatsapp}
              onChange={(e) => setCompany({ ...company, whatsapp: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              E-mail de Suporte ao Cliente
            </label>
            <input
              type="email"
              value={company.emailSuporte}
              onChange={(e) => setCompany({ ...company, emailSuporte: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Horário de Atendimento Comercial
          </label>
          <input
            type="text"
            value={company.horarioExpediente}
            onChange={(e) => setCompany({ ...company, horarioExpediente: e.target.value })}
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};

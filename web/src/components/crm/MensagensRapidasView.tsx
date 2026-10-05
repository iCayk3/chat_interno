import React, { useState } from 'react';
import {
  Plus,
  Search,
  Copy,
  Check,
} from 'lucide-react';
import type { QuickReplyTemplate } from '../../types/crm';

export const MensagensRapidasView: React.FC = () => {
  const [templates] = useState<QuickReplyTemplate[]>([
    {
      id: 'tmpl-01',
      shortcut: '/ola',
      title: 'Saudação Padrão',
      content: 'Olá {{cliente_nome}}! Seja bem-vindo ao canal de atendimento SOL. Como posso ajudar você hoje?',
      category: 'Geral',
      variables: ['cliente_nome'],
    },
    {
      id: 'tmpl-02',
      shortcut: '/pix',
      title: 'Envio de Chave e Código PIX',
      content: 'Aqui está sua fatura com desconto! Você pode pagar instantaneamente usando nosso código PIX Copia-e-Cola abaixo. A baixa no sistema é imediata.',
      category: 'Financeiro',
      variables: ['cliente_nome', 'valor_fatura'],
    },
    {
      id: 'tmpl-03',
      shortcut: '/suporte',
      title: 'Reinicialização de Roteador',
      content: 'Por favor, desconecte o roteador da tomada, aguarde cerca de 30 segundos e ligue-o novamente. Assim que as luzes estabilizarem, me confirme por aqui.',
      category: 'Suporte',
      variables: [],
    },
    {
      id: 'tmpl-04',
      shortcut: '/encerramento',
      title: 'Encerramento com Pesquisa de Satisfação',
      content: 'Foi um prazer atender você! Para finalizar, por favor avalie nosso atendimento de 1 a 5 estrelas. Tenha um ótimo dia!',
      category: 'Geral',
      variables: ['operador_nome'],
    },
    {
      id: 'tmpl-05',
      shortcut: '/upgrade',
      title: 'Oferta de Upgrade de Fibra',
      content: 'Temos uma condição exclusiva para o seu endereço: upgrade para 600 Mega Fibra pelo mesmo valor da sua mensalidade atual nos primeiros 3 meses!',
      category: 'Comercial',
      variables: ['cliente_nome', 'plano_atual'],
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = ['Todas', 'Geral', 'Financeiro', 'Suporte', 'Comercial'];

  const filtered = templates.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.shortcut.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'Todas' || t.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleCopy = (t: QuickReplyTemplate) => {
    navigator.clipboard.writeText(t.content);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/60 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/70">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Mensagens Rápidas & Respostas Prontas
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Padronize o atendimento e aumente a produtividade dos atendentes com atalhos inteligentes.
          </p>
        </div>

        <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors">
          <Plus className="w-4 h-4" />
          <span>Nova Resposta Rápida</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por atalho (/ola) ou texto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((tmpl) => (
          <div
            key={tmpl.id}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between hover:border-blue-300 transition-all"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                  {tmpl.shortcut}
                </span>
                <span className="text-[11px] font-semibold text-slate-500 px-2 py-0.5 rounded-md bg-slate-100">
                  {tmpl.category}
                </span>
              </div>

              <h4 className="font-bold text-slate-800 text-sm mb-1">{tmpl.title}</h4>
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 font-normal">
                {tmpl.content}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                {tmpl.variables.map((v, i) => (
                  <span
                    key={i}
                    className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-1.5 py-0.5 rounded-md font-mono"
                  >
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>

              <button
                onClick={() => handleCopy(tmpl)}
                className="flex items-center gap-1 text-slate-500 hover:text-blue-600 font-medium transition-colors"
              >
                {copiedId === tmpl.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-bold">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

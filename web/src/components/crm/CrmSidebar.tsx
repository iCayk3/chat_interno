import React from 'react';
import {
  Home,
  BarChart3,
  Building2,
  Users,
  UserCog,
  Layers,
  Radio,
  Keyboard,
  Workflow,
  MessageCircle,
  Gem,
  History,
  Rocket,
  Lock,
  User,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  LogOut,
  Network,
  Search,
  CreditCard,
  Package,
  Sliders,
  UserCheck,
} from 'lucide-react';
import type { CrmMenuId, UserRole, AuthUser, SystemSettings, SystemLicense } from '../../types/crm';

interface CrmSidebarProps {
  activeMenu: CrmMenuId;
  onSelectMenu: (menu: CrmMenuId) => void;
  waitingQueueCount: number;
  userRole: UserRole;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
  systemSettings?: SystemSettings | null;
  license?: SystemLicense | null;
}

interface MenuItem {
  id: CrmMenuId;
  label: string;
  icon: React.ElementType;
  badge?: string;
  badgeType?: 'novidade' | 'count';
  allowedRoles: UserRole[];
}

interface MenuSection {
  title?: string;
  items: MenuItem[];
}

export const CrmSidebar: React.FC<CrmSidebarProps> = ({
  activeMenu,
  onSelectMenu,
  waitingQueueCount,
  userRole,
  isCollapsed,
  onToggleCollapse,
  currentUser,
  onLogout,
  systemSettings,
  license,
}) => {
  const allowedMode = license?.allowedOperationMode || 'hybrid';
  const isNativeAllowed =
    (systemSettings?.operationMode === 'native' || systemSettings?.operationMode === 'hybrid') &&
    allowedMode !== 'erp';
  const isErpAllowed =
    (!systemSettings || systemSettings.operationMode === 'erp' || systemSettings.operationMode === 'hybrid') &&
    allowedMode !== 'native';

  // Configuração mestre de menus com controle de acesso estrito (RBAC)
  const allSections: MenuSection[] = [
    {
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: Home,
          allowedRoles: ['gestor', 'admin'],
        },
        {
          id: 'relatorios',
          label: 'Relatórios',
          icon: BarChart3,
          allowedRoles: ['gestor', 'admin'],
        },
      ],
    },
    ...(isNativeAllowed
      ? [
          {
            title: 'CLIENTES & COBRANÇA',
            items: [
              {
                id: 'clientes_nativos' as CrmMenuId,
                label: 'Clientes & Assinantes',
                icon: UserCheck,
                allowedRoles: ['gestor', 'admin'] as UserRole[],
              },
              {
                id: 'planos_servicos' as CrmMenuId,
                label: 'Planos & Serviços',
                icon: Package,
                allowedRoles: ['admin'] as UserRole[],
              },
              {
                id: 'faturas_cobrancas' as CrmMenuId,
                label: 'Faturas & Mercado Pago',
                icon: CreditCard,
                allowedRoles: ['gestor', 'admin'] as UserRole[],
              },
            ],
          },
        ]
      : []),
    {
      title: 'EMPRESA',
      items: [
        {
          id: 'empresa_dados',
          label: 'Dados da empresa',
          icon: Building2,
          allowedRoles: ['admin'], // Somente Administrador tem acesso aos dados da empresa
        },
        {
          id: 'usuarios_gerencia',
          label: 'Gerência de Usuários',
          icon: UserCog,
          allowedRoles: ['admin'], // Somente Administrador gerencia usuários do sistema
        },
        {
          id: 'empresa_atendentes',
          label: 'Atendentes',
          icon: Users,
          allowedRoles: ['gestor', 'admin'],
        },
        {
          id: 'empresa_departamentos',
          label: 'Departamentos',
          icon: Layers,
          allowedRoles: ['gestor', 'admin'],
        },
        {
          id: 'empresa_atendimentos',
          label: 'Consulta de Atendimentos',
          icon: Search,
          allowedRoles: ['operador', 'gestor', 'admin'],
        },
        {
          id: 'empresa_relatorios',
          label: 'Relatórios & Métricas',
          icon: BarChart3,
          allowedRoles: ['gestor', 'admin'],
        },
      ],
    },
    {
      title: 'ATENDIMENTO',
      items: [
        {
          id: 'atendimento_canais',
          label: 'Canais',
          icon: Radio,
          allowedRoles: ['admin'], // Somente Administrador tem acesso aos Canais
        },
        {
          id: 'atendimento_mensagens',
          label: 'Mensagens',
          icon: Keyboard,
          allowedRoles: ['operador', 'gestor', 'admin'], // Operador usa respostas rápidas no chat
        },
        {
          id: 'atendimento_fluxo',
          label: 'Fluxo & Configurações',
          icon: Workflow,
          allowedRoles: ['gestor', 'admin'],
        },
        {
          id: 'atendimento_chat',
          label: 'Atendimento',
          icon: MessageCircle,
          badge: waitingQueueCount > 0 ? String(waitingQueueCount) : undefined,
          badgeType: 'count',
          allowedRoles: ['operador', 'gestor', 'admin'],
        },
        {
          id: 'atendimento_campanhas',
          label: 'Campanhas',
          icon: Gem,
          allowedRoles: ['gestor', 'admin'],
        },
        {
          id: 'atendimento_auditoria',
          label: 'Auditoria',
          icon: History,
          allowedRoles: ['admin'], // Somente Administrador acessa trilha de auditoria
        },
      ],
    },
    {
      title: 'INTEGRAÇÕES & MODO',
      items: [
        ...(isErpAllowed
          ? [
              {
                id: 'integracoes_gerenciar' as CrmMenuId,
                label: 'Gerenciar (ERP)',
                icon: Rocket,
                allowedRoles: ['admin'] as UserRole[],
              },
            ]
          : []),
        {
          id: 'modo_operacao' as CrmMenuId,
          label: 'Modo de Operação',
          icon: Sliders,
          allowedRoles: ['admin'] as UserRole[],
        },
        {
          id: 'integracoes_chaves' as CrmMenuId,
          label: 'Chaves para acesso',
          icon: Lock,
          allowedRoles: ['admin'] as UserRole[],
        },
      ],
    },
    {
      title: 'CONFIGURAÇÕES',
      items: [
        {
          id: 'config_rede',
          label: 'Rede',
          icon: Network,
          allowedRoles: ['gestor', 'admin'],
        },
        {
          id: 'licenca_sistema' as CrmMenuId,
          label: 'Licença & Assinatura',
          icon: ShieldCheck,
          allowedRoles: ['gestor', 'admin'] as UserRole[],
        },
      ],
    },
    {
      title: 'MEU ESPAÇO',
      items: [
        {
          id: 'meus_dados',
          label: 'Meus Dados',
          icon: User,
          allowedRoles: ['operador', 'gestor', 'admin'], // Todos podem alterar seus próprios dados
        },
      ],
    },
  ];

  // Filtra as seções e menus com base no nível de permissão do usuário
  const filteredSections = allSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.allowedRoles.includes(userRole)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={`h-full bg-white border-r border-slate-200/90 flex flex-col shrink-0 select-none transition-all duration-200 z-30 ${
        isCollapsed ? 'w-18' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 truncate">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs font-bold text-sm">
              S
            </div>
            <div className="truncate">
              <span className="font-bold text-slate-800 text-sm tracking-tight block truncate">
                SOL CRM
              </span>
              <span className="text-[10px] text-blue-600 font-semibold tracking-wide uppercase flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500 inline" />
                Helpdesk & ERP
              </span>
            </div>
          </div>
        )}

        {isCollapsed && (
          <div className="w-full flex justify-center">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
              S
            </div>
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors hidden md:block"
          title={isCollapsed ? 'Expandir Menu' : 'Recolher Menu'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Menu List */}
      <div className="flex-1 overflow-y-auto py-2 px-2.5 space-y-4 custom-scrollbar">
        {filteredSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-0.5">
            {section.title && !isCollapsed && (
              <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {section.title}
              </div>
            )}
            {section.title && isCollapsed && (
              <div className="h-px bg-slate-100 my-2 mx-1" />
            )}

            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeMenu === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onSelectMenu(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-all text-left relative group ${
                    isActive
                      ? 'bg-blue-50/80 text-blue-600 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-blue-600 stroke-[2.2]' : 'text-slate-400 group-hover:text-slate-600 stroke-[1.8]'
                    }`}
                  />

                  {!isCollapsed && (
                    <span className="truncate flex-1 text-[13px]">{item.label}</span>
                  )}

                  {!isCollapsed && item.badge && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-bold shadow-2xs">
                      {item.badge}
                    </span>
                  )}

                  {isCollapsed && item.badge && item.badgeType === 'count' && (
                    <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-amber-500" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer: Perfil Resumido e Logout */}
      <div className="p-2 border-t border-slate-100 bg-slate-50/50 shrink-0 flex items-center gap-1">
        <button
          onClick={() => onSelectMenu('meu_perfil')}
          title={isCollapsed ? 'Meu perfil' : undefined}
          className={`flex-1 flex items-center gap-2.5 p-2 rounded-lg text-slate-700 hover:bg-white hover:shadow-xs transition-all text-left ${
            activeMenu === 'meu_perfil' ? 'bg-white shadow-xs ring-1 ring-blue-100 font-semibold text-blue-600' : ''
          } ${isCollapsed ? 'justify-center p-2' : ''}`}
        >
          <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0 font-bold text-xs uppercase">
            {currentUser?.name ? currentUser.name.slice(0, 2) : 'MS'}
          </div>
          {!isCollapsed && (
            <div className="truncate flex-1">
              <div className="text-xs font-semibold text-slate-800 truncate">
                {currentUser?.name || 'Administrador'}
              </div>
              <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                <span className="capitalize font-semibold text-slate-500">
                  {userRole === 'admin'
                    ? 'Administrador'
                    : userRole === 'gestor'
                    ? 'Gestor'
                    : 'Operador'}
                </span>
              </div>
            </div>
          )}
          {!isCollapsed && <User className="w-3.5 h-3.5 text-slate-400" />}
        </button>

        {!isCollapsed && onLogout && (
          <button
            onClick={onLogout}
            title="Sair do Sistema (Logout)"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
};

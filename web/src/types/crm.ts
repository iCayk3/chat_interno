export type UserRole = 'operador' | 'gestor' | 'admin';

export type CrmMenuId =
  | 'dashboard'
  | 'relatorios'
  | 'empresa_dados'
  | 'usuarios_gerencia'
  | 'empresa_atendentes'
  | 'empresa_departamentos'
  | 'atendimento_canais'
  | 'atendimento_mensagens'
  | 'atendimento_automacoes'
  | 'atendimento_fluxo'
  | 'atendimento_chat'
  | 'atendimento_campanhas'
  | 'atendimento_auditoria'
  | 'integracoes_gerenciar'
  | 'integracoes_chaves'
  | 'meus_dados'
  | 'meu_perfil';

export type FlowActionType = 'submenu' | 'transfer' | 'close' | 'erp' | 'ai';

export interface FlowNode {
  id: string;
  title: string;
  emoji?: string;
  message: string;
  action: FlowActionType;
  department?: string;
  erpAction?: string;
  children?: FlowNode[];
}

export interface ChatSettings {
  closeMessage: string;
  welcomeMessage: string;
  queueTransferMessage: string;
  outOfHoursMessage: string;
  enableBotFlow: boolean;
  chatbotFlow?: FlowNode;
  aiEnabled: boolean;
  aiPrompt: string;
}

// Modelos de Integração com o ERP RBXSoft ISP
export interface RBXClient {
  codigo: string;
  nome: string;
  nomeFantasia?: string;
  tipo: string;
  cpfCnpj: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
  email: string;
  telefone: string;
  celular: string;
  avisoPagamento: string;
  status: string;
  contratoDescricao?: string;
  conexaoStatus?: string;
}

export interface RBXUnpaidDocument {
  id: number;
  accountNumber: number;
  dueDate: string;
  documentNumber: string;
  bankNumber: string;
  value: number;
  historic: string;
  comments?: string;
  pixCopiaCola?: string;
  boletoLink?: string;
  status: 'aberto' | 'vencido' | 'hoje';
}

export interface RBXFinancialSummary {
  customerId: string;
  customerName: string;
  cpfCnpj: string;
  totalUnpaid: number;
  overdueCount: number;
  canRequestPromessa: boolean;
  avisoPagamento: string;
  documents: RBXUnpaidDocument[];
}

export interface RBXConfig {
  baseUrl: string;
  apiKey: string;
  version: 'v1' | 'v2';
  enabled: boolean;
  simulationMode: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  active: boolean;
  createdAt: string;
  lastLogin: string;
  phone?: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface CrmUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  status: 'active' | 'inactive';
  lastLogin: string;
  phone?: string;
  createdAt: string;
}

export interface Attendant {
  id: string;
  name: string;
  email: string;
  role: 'operator' | 'supervisor' | 'manager';
  departments: string[];
  status: 'online' | 'busy' | 'offline';
  activeChatsCount: number;
  maxChats: number;
  avatarUrl?: string;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  slaMinutes: number;
  color: string;
  activeAttendantsCount: number;
  openTicketsCount: number;
  routingMode: 'round_robin' | 'least_busy' | 'manual';
}

export interface ErpIntegrationConfig {
  systemName: string;
  erpType: 'protheus' | 'sap' | 'bling' | 'tiny' | 'omie' | 'custom_rest';
  endpointUrl: string;
  apiKey: string;
  syncIntervalMinutes: number;
  status: 'connected' | 'error' | 'disconnected';
  lastSyncAt: string;
  syncedModules: {
    customers: boolean;
    invoicesAndBoleto: boolean;
    serviceOrders: boolean;
    contracts: boolean;
    creditLimit: boolean;
  };
}

export interface QuickReplyTemplate {
  id: string;
  shortcut: string;
  title: string;
  content: string;
  category: 'Geral' | 'Financeiro' | 'Suporte' | 'Comercial';
  variables: string[];
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  operatorName: string;
  operatorId: string;
  action: string;
  resource: string;
  ipAddress: string;
  severity: 'info' | 'warning' | 'security';
}

export type UserRole = 'operador' | 'gestor' | 'admin';

export type CrmMenuId =
  | 'dashboard'
  | 'relatorios'
  | 'empresa_dados'
  | 'usuarios_gerencia'
  | 'empresa_atendentes'
  | 'empresa_departamentos'
  | 'empresa_atendimentos'
  | 'empresa_relatorios'
  | 'atendimento_canais'
  | 'atendimento_mensagens'
  | 'atendimento_automacoes'
  | 'atendimento_fluxo'
  | 'atendimento_chat'
  | 'atendimento_campanhas'
  | 'atendimento_auditoria'
  | 'clientes_nativos'
  | 'planos_servicos'
  | 'faturas_cobrancas'
  | 'modo_operacao'
  | 'licenca_sistema'
  | 'integracoes_gerenciar'
  | 'integracoes_chaves'
  | 'config_rede'
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
  botTimeoutMinutes?: number;
  botFallbackDept?: string;
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
  pixQrCode?: string;
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

export interface RBXCustomerGroup {
  codigo: string;
  nome: string;
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

export interface DeviceRegistration {
  deviceId: string;
  cpfCnpj: string;
  clientName: string;
  platform: string;
  pushToken?: string;
  appVersion?: string;
  olt?: string;
  pon?: string;
  cto?: string;
  rbxGroup?: string;
  lastSeenAt: string;
  createdAt: string;
}

export type CampaignTargetType = 'all' | 'specific' | 'dept' | 'network' | 'rbx_group';

export interface Campaign {
  id: string;
  title: string;
  message: string;
  department: string;
  targetType: CampaignTargetType;
  targetCpfs?: string[];
  targetOlt?: string;
  targetPon?: string;
  targetCto?: string;
  targetOlts?: string[];
  targetPons?: string[];
  targetCtos?: string[];
  targetRbxGroup?: string;
  targetRbxGroupName?: string;
  targetRbxGroups?: string[];
  targetRbxGroupNames?: string[];
  target: string;
  actionType: 'chat_and_view' | 'view_only';
  chatInitialMsg?: string;
  status: 'rascunho' | 'ativa' | 'concluida';
  sentCount: number;
  deliveredRate: string;
  createdAt: string;
  createdBy?: string;
}

export interface DispatchResult {
  campaignId: string;
  totalTargeted: number;
  deliveredRealtime: number;
  message: string;
}

// Modelos da Infraestrutura de Rede FTTH
export interface NetworkCto {
  id: string;
  ponId: string;
  slotId: string;
  oltId: string;
  name: string;
  splitterRatio?: string;
  totalPorts: number;
  address?: string;
  coordinates?: string;
  notes?: string;
  createdAt?: string;
}

export interface NetworkPon {
  id: string;
  slotId: string;
  oltId: string;
  ponNumber: number;
  name: string;
  sfpType?: string;
  ctos?: NetworkCto[];
  createdAt?: string;
}

export interface NetworkSlot {
  id: string;
  oltId: string;
  slotNumber: number;
  name: string;
  cardType?: string;
  ponCount?: number;
  pons?: NetworkPon[];
  createdAt?: string;
}

export interface NetworkOlt {
  id: string;
  name: string;
  model?: string;
  ip?: string;
  location?: string;
  description?: string;
  slotCount?: number;
  ponsPerSlot?: number;
  slots?: NetworkSlot[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCtosBatchRequest {
  ponId: string;
  names?: string[];
  prefix?: string;
  startIndex?: number;
  count?: number;
  splitterRatio?: string;
  totalPorts?: number;
  address?: string;
  coordinates?: string;
  notes?: string;
}

// Modelos para Consulta de Atendimentos & Relatórios Gerenciais
export interface ConversationItem {
  id: string;
  clientId: string;
  clientName: string;
  contactName?: string;
  cpfCnpj?: string;
  department: string;
  status: 'waiting' | 'active' | 'closed';
  operator?: {
    id: string;
    name: string;
  };
  olt?: string;
  pon?: string;
  cto?: string;
  rbxGroup?: string;
  assignedAt?: string;
  closedAt?: string;
  closedBy?: string;
  closeReason?: string;
  rating?: number;
  ratingComment?: string;
  ratedAt?: string;
  channel?: 'mobile' | 'web' | 'telegram' | 'whatsapp_official' | 'whatsapp_evolution';
  channelId?: string;
  channelMeta?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface SearchConversationsParams {
  operatorId?: string;
  department?: string;
  rbxGroup?: string;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  rating?: number;
  limit?: number;
  offset?: number;
}

export interface SearchConversationsResponse {
  conversations: ConversationItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ConversationFullResponse {
  conversation: ConversationItem;
  messages: Array<{
    id: string;
    conversationId: string;
    senderId: string;
    senderType: 'client' | 'operator' | 'system';
    senderName: string;
    content: string;
    timestamp: string;
    status: string;
  }>;
}

export interface DepartmentMetric {
  department: string;
  totalTickets: number;
  avgTmaSeconds: number;
  avgTmeSeconds: number;
  avgRating: number;
  ratedCount: number;
}

export interface OperatorMetric {
  operatorId: string;
  operatorName: string;
  department: string;
  totalTickets: number;
  avgTmaSeconds: number;
  avgTmeSeconds: number;
  avgRating: number;
  ratedCount: number;
}

export interface DailyVolumeMetric {
  date: string;
  totalTickets: number;
  closedTickets: number;
}

export interface ReportSummaryResponse {
  totalTickets: number;
  closedTickets: number;
  activeTickets: number;
  waitingTickets: number;
  avgTmaSeconds: number;
  avgTmeSeconds: number;
  avgRating: number;
  totalRated: number;
  ratingDistribution: Record<string, number>;
  departments: DepartmentMetric[];
  operators: OperatorMetric[];
  dailyVolume: DailyVolumeMetric[];
}

// Configurações de Canais Omnichannel (Telegram, WhatsApp Oficial, WhatsApp Evolution)
export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  botName: string;
  botUsername: string;
  webhookUrl: string;
  status: 'connected' | 'disconnected' | 'error';
}

export interface WhatsAppOfficialConfig {
  enabled: boolean;
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  verifyToken: string;
  displayPhoneNumber: string;
  status: 'connected' | 'disconnected' | 'error';
}

export interface WhatsAppEvolutionConfig {
  enabled: boolean;
  serverUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl: string;
  status: 'connected' | 'disconnected' | 'error';
}

export interface ChannelsConfig {
  telegram: TelegramConfig;
  whatsappOfficial: WhatsAppOfficialConfig;
  whatsappEvolution: WhatsAppEvolutionConfig;
}

export interface EvolutionInstance {
  id?: string;
  name: string;
  connectionStatus: string;
  ownerJid?: string;
  profileName?: string;
  profilePicUrl?: string;
  integration?: string;
  token?: string;
}

// Modos de Operação do Sistema (ERP vs Nativo vs Híbrido)
export type OperationMode = 'erp' | 'native' | 'hybrid';

export interface SystemSettings {
  operationMode: OperationMode;
  setupCompleted: boolean;
  companyName: string;
  companyCnpj: string;
  companyPhone: string;
  companyEmail: string;
  mercadopago: {
    publicKey: string;
    maskedToken: string;
    maskedWebhookSecret: string;
    sandbox: boolean;
    configured: boolean;
  };
  updatedAt?: string;
}

export interface SaveSystemSettingsPayload {
  operationMode: OperationMode;
  setupCompleted?: boolean;
  companyName?: string;
  companyCnpj?: string;
  companyPhone?: string;
  companyEmail?: string;
  mercadopago?: {
    accessToken?: string;
    publicKey?: string;
    webhookSecret?: string;
    sandbox?: boolean;
  };
}

export interface NativePlan {
  id: string;
  name: string;
  description: string;
  price: number;
  billingCycle: string;
  speedDownload: string;
  speedUpload: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface NativeCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  address: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  planId?: string;
  planName?: string;
  monthlyPrice: number;
  dueDay: number;
  status: 'active' | 'blocked' | 'canceled';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NativeInvoice {
  id: string;
  customerId: string;
  customerName?: string;
  cpfCnpj: string;
  amount: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'canceled';
  description: string;
  paymentMethod: string;
  mpPaymentId?: string;
  pixQrCode?: string;
  pixQrCodeBase64?: string;
  boletoUrl?: string;
  boletoBarcode?: string;
  paidAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SystemLicense {
  licenseKey: string;
  tenantCnpj: string;
  tenantName: string;
  licenseType: 'trial' | 'cortesia' | 'paid';
  status: 'active' | 'trial' | 'suspended' | 'revoked';
  trialDaysRemaining: number;
  expiresAt: string;
  gracePeriodUntil?: string;
  lastHeartbeatAt?: string;
  maxOperators: number;
  allowedModules: string;
  allowedOperationMode?: 'erp' | 'native' | 'hybrid';
  suspensionReason?: string;
  paymentPix?: string;
  paymentQrCodeBase64?: string;
  paymentQRCodeBase64?: string;
  paymentAmount?: number;
  discountDescription?: string;
  discountAmount?: number;
  contactSupportPhone?: string;
  contactSupportEmail?: string;
  updatedAt?: string;
}

export interface LicensePlanOptions {
  monthlyPrice: number;
  annualPrice: number;
  discountAmount?: number;
  discountDescription?: string;
  finalMonthlyPrice: number;
  finalAnnualPrice: number;
}

export interface LicenseCheckoutResult {
  success: boolean;
  licenseKey: string;
  cycle: 'monthly' | 'annual';
  amount: number;
  discountAmount?: number;
  paymentMethod: 'pix' | 'mercadopago';
  paymentPix?: string;
  paymentQrCode?: string;
  checkoutUrl?: string;
  paymentId?: string;
  status: string;
  message: string;
}

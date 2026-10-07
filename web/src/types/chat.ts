export type SenderType = 'client' | 'operator' | 'system';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read';
export type ConversationStatus = 'waiting' | 'active' | 'closed' | 'waiting_rating';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: SenderType;
  senderName: string;
  content: string;
  timestamp: string;
  status: MessageStatus;
}

export interface OperatorInfo {
  id: string;
  name: string;
}

export interface Conversation {
  id: string;
  clientId: string;
  clientName: string;
  contactName?: string;
  cpfCnpj?: string;
  department?: string;
  olt?: string;
  pon?: string;
  cto?: string;
  status: ConversationStatus;
  operator?: OperatorInfo;
  channel?: 'mobile' | 'web' | 'telegram' | 'whatsapp_official' | 'whatsapp_evolution';
  channelId?: string;
  channelMeta?: Record<string, any>;
  rating?: number;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerEnrichment {
  documentOrEmail: string;
  crmData?: {
    tier?: string;
    lastContact?: string;
    [key: string]: any;
  };
  financialStatus?: {
    status?: string;
    activePlan?: string;
    pendingOrders?: number;
    [key: string]: any;
  };
  openTickets: number;
  fetchedAt: string;
}

export interface WSAction {
  type: string;
  payload?: any;
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  category: string;
  status: string;
  bodyText: string;
  paramLabels: string[];
}

export interface StartOutboundChatPayload {
  channel: 'whatsapp_evolution' | 'whatsapp_official' | 'telegram' | 'mobile';
  channelId: string;
  clientName: string;
  contactName?: string;
  cpfCnpj?: string;
  department?: string;
  operatorId: string;
  operatorName: string;
  initialMessage?: string;
  templateName?: string;
  templateLanguage?: string;
  templateParams?: string[];
}


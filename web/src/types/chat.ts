export type SenderType = 'client' | 'operator' | 'system';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read';
export type ConversationStatus = 'waiting' | 'active' | 'closed';

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

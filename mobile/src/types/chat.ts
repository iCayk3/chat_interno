export type SenderType = 'client' | 'operator' | 'system';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read';

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

export interface ClientProfile {
  id: string;
  name: string;
  contactName?: string;
  emailOrDoc?: string;
  cpfCnpj?: string;
  department?: string;
}

export interface ConversationSession {
  id: string;
  clientId: string;
  clientName: string;
  contactName?: string;
  cpfCnpj?: string;
  department?: string;
  status: 'waiting' | 'active' | 'closed';
  operator?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  createdAt: string;
}

export type RootStackParamList = {
  Welcome: undefined;
  Chat: {
    client: ClientProfile;
    session?: ConversationSession;
  };
};

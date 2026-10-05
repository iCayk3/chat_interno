import type { Conversation, Message, CustomerEnrichment } from '../types/chat';

export const api = {
  async getConversations(status?: string): Promise<Conversation[]> {
    const url = status ? `/api/conversations?status=${encodeURIComponent(status)}` : '/api/conversations';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Falha ao buscar atendimentos');
    return res.json();
  },

  async getConversation(id: string): Promise<Conversation> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Conversa não encontrada');
    return res.json();
  },

  async getMessages(id: string, limit = 50): Promise<Message[]> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/messages?limit=${limit}`);
    if (!res.ok) throw new Error('Falha ao carregar mensagens');
    return res.json();
  },

  async assignOperator(id: string, operatorId: string, operatorName: string): Promise<Conversation> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorId, operatorName }),
    });
    if (!res.ok) throw new Error('Falha ao assumir atendimento');
    return res.json();
  },

  async closeConversation(id: string): Promise<void> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/close`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Falha ao encerrar conversa');
  },

  async lookupCustomer(query: string): Promise<CustomerEnrichment> {
    const res = await fetch(`/api/customers/lookup?query=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Falha na consulta externa do cliente');
    return res.json();
  },
};

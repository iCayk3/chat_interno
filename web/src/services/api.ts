import type { Conversation, Message, CustomerEnrichment } from '../types/chat';
import type {
  AuthUser,
  LoginResponse,
  ChatSettings,
  RBXClient,
  RBXFinancialSummary,
  RBXConfig,
  RBXCustomerGroup,
  Campaign,
  DeviceRegistration,
  DispatchResult,
  NetworkOlt,
  NetworkSlot,
  NetworkPon,
  NetworkCto,
  CreateCtosBatchRequest,
} from '../types/crm';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('sol_crm_auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // --- Autenticação e Sessão ---
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao autenticar.');
    }

    // Salva sessão localmente
    this.setSession(data.token, data.user);
    return data;
  },

  async getMe(): Promise<AuthUser> {
    const res = await fetch('/api/auth/me', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Sessão expirada ou não autorizada');
    return res.json();
  },

  async listUsers(): Promise<AuthUser[]> {
    const res = await fetch('/api/auth/users', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Falha ao listar usuários');
    return res.json();
  },

  async createUser(payload: {
    name: string;
    email: string;
    role: string;
    department: string;
    password?: string;
    phone?: string;
  }): Promise<AuthUser> {
    const res = await fetch('/api/auth/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao cadastrar usuário');
    return data;
  },

  async updateUser(id: string, payload: {
    name: string;
    email: string;
    role: string;
    department: string;
    phone?: string;
    active: boolean;
  }): Promise<AuthUser> {
    const res = await fetch(`/api/auth/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao atualizar usuário');
    return data;
  },

  async updateProfile(name: string, phone: string, department: string): Promise<AuthUser> {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, phone, department }),
    });
    if (!res.ok) throw new Error('Falha ao atualizar dados de perfil');
    const updated = await res.json();
    const token = this.getToken();
    if (token) {
      this.setSession(token, updated);
    }
    return updated;
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<{ message: string }> {
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao alterar senha');
    return data;
  },

  getToken(): string | null {
    return localStorage.getItem('sol_crm_auth_token');
  },

  setSession(token: string, user: AuthUser): void {
    localStorage.setItem('sol_crm_auth_token', token);
    localStorage.setItem('sol_crm_user', JSON.stringify(user));
  },

  clearSession(): void {
    localStorage.removeItem('sol_crm_auth_token');
    localStorage.removeItem('sol_crm_user');
  },

  getStoredUser(): AuthUser | null {
    const raw = localStorage.getItem('sol_crm_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  // --- Atendimentos e Chat ---
  async getConversations(status?: string): Promise<Conversation[]> {
    const url = status ? `/api/conversations?status=${encodeURIComponent(status)}` : '/api/conversations';
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Falha ao buscar atendimentos');
    return res.json();
  },

  async getConversation(id: string): Promise<Conversation> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Conversa não encontrada');
    return res.json();
  },

  async getMessages(id: string, limit = 50): Promise<Message[]> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/messages?limit=${limit}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Falha ao carregar mensagens');
    return res.json();
  },

  async assignOperator(id: string, operatorId: string, operatorName: string): Promise<Conversation> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/assign`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ operatorId, operatorName }),
    });
    if (!res.ok) throw new Error('Falha ao assumir atendimento');
    return res.json();
  },

  async closeConversation(id: string, reason?: string): Promise<void> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/close`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error('Falha ao encerrar conversa');
  },

  async updateConversationNetwork(
    id: string,
    data: { olt: string; pon: string; cto: string; cpfCnpj?: string }
  ): Promise<{ success: boolean; olt: string; pon: string; cto: string }> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/network`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar dados de rede');
    }
    return res.json();
  },

  // --- Configurações de Atendimento, Mensagens & Fluxo do Bot ---
  async getSettings(): Promise<ChatSettings> {
    const res = await fetch('/api/settings', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Falha ao buscar configurações');
    return res.json();
  },

  async saveSettings(settings: ChatSettings): Promise<void> {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(settings),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao salvar configurações');
    }
  },

  async lookupCustomer(query: string): Promise<CustomerEnrichment> {
    const res = await fetch(`/api/customers/lookup?query=${encodeURIComponent(query)}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Falha na consulta externa do cliente');
    return res.json();
  },

  // --- Integração ERP RBXSoft ISP ---
  async searchRbxCustomer(cpfCnpj: string): Promise<RBXClient> {
    const res = await fetch(`/api/erp/rbx/customer?cpfCnpj=${encodeURIComponent(cpfCnpj)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Cliente não localizado no RBX');
    }
    return res.json();
  },

  async getRbxFinancial(customerId?: string, cpfCnpj?: string): Promise<RBXFinancialSummary> {
    const params = new URLSearchParams();
    if (customerId) params.append('customerId', customerId);
    if (cpfCnpj) params.append('cpfCnpj', cpfCnpj);

    const res = await fetch(`/api/erp/rbx/financial?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao consultar financeiro no RBX');
    }
    return res.json();
  },

  async getRbxPix(billetId: number): Promise<{ billetId: number; pixCopiaCola: string; pixQrCode?: string }> {
    const res = await fetch('/api/erp/rbx/pix', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ billetId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao obter Pix do boleto');
    }
    return res.json();
  },

  async getRbxQRCode(billetId: number): Promise<{ billetId: number; pixQrCode: string }> {
    const res = await fetch('/api/erp/rbx/qrcode', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ billetId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao obter QR Code do Pix');
    }
    return res.json();
  },

  async getRbxBoleto(documentId: number): Promise<{ documentId: number; boletoLink: string }> {
    const res = await fetch('/api/erp/rbx/boleto', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ documentId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao gerar boleto em PDF no RBX');
    }
    return res.json();
  },

  async sendRbxBoletoToChat(params: {
    conversationId: string;
    documentId: number;
    documentNumber?: string;
    value?: number;
    dueDate?: string;
    historic?: string;
    senderId?: string;
    senderName?: string;
  }): Promise<{ success: boolean; message: string; fileUrl: string; chatMsg: any }> {
    const res = await fetch('/api/erp/rbx/boleto/send', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao enviar boleto no chat');
    }
    return res.json();
  },

  async sendRbxPromessa(customerId: string, documentId: number | string): Promise<{ success: boolean; message: string; ticketId: string }> {
    const res = await fetch('/api/erp/rbx/promessa', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ customerId, documentId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao registrar promessa no RBX');
    }
    return res.json();
  },

  async getRbxConfig(): Promise<RBXConfig> {
    const res = await fetch('/api/erp/rbx/config', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Falha ao carregar configurações do RBX');
    return res.json();
  },

  async saveRbxConfig(cfg: RBXConfig): Promise<void> {
    const res = await fetch('/api/erp/rbx/config', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(cfg),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao salvar configurações do RBX');
    }
  },

  async testRbxConnection(): Promise<{ success: boolean; latencyMs: number; message: string }> {
    const res = await fetch('/api/erp/rbx/test', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return res.json();
  },

  async getRbxGroups(): Promise<RBXCustomerGroup[]> {
    const res = await fetch('/api/erp/rbx/groups', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao buscar grupos do RBX');
    }
    return res.json();
  },

  async getRbxGroupClients(groupCode: string): Promise<RBXClient[]> {
    const res = await fetch(`/api/erp/rbx/groups/${encodeURIComponent(groupCode)}/clients`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao buscar clientes do grupo no RBX');
    }
    return res.json();
  },

  async resetAll(): Promise<void> {
    const res = await fetch('/api/conversations/reset', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Falha ao resetar histórico');
  },

  // --- Campanhas & Disparos em Massa ---
  async listCampaigns(): Promise<Campaign[]> {
    const res = await fetch('/api/campaigns', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Falha ao listar campanhas');
    return res.json();
  },

  async saveCampaign(camp: Partial<Campaign>): Promise<Campaign> {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(camp),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao salvar campanha');
    }
    return res.json();
  },

  async dispatchCampaign(id: string): Promise<DispatchResult> {
    const res = await fetch(`/api/campaigns/${id}/dispatch`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao disparar campanha');
    }
    return res.json();
  },

  async listDevices(): Promise<DeviceRegistration[]> {
    const res = await fetch('/api/devices', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Falha ao listar dispositivos');
    return res.json();
  },

  // --- Gestão da Hierarquia FTTH (OLT -> Slot -> PON -> CTO) ---
  async getNetworkTree(): Promise<NetworkOlt[]> {
    const res = await fetch('/api/network/tree', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Falha ao buscar árvore de rede FTTH');
    return res.json();
  },

  async createOlt(data: Partial<NetworkOlt>): Promise<NetworkOlt> {
    const res = await fetch('/api/network/olts', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao cadastrar OLT');
    }
    return res.json();
  },

  async updateOlt(id: string, data: Partial<NetworkOlt>): Promise<NetworkOlt> {
    const res = await fetch(`/api/network/olts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar OLT');
    }
    return res.json();
  },

  async deleteOlt(id: string): Promise<void> {
    const res = await fetch(`/api/network/olts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Falha ao excluir OLT');
  },

  async createSlot(data: Partial<NetworkSlot>): Promise<NetworkSlot> {
    const res = await fetch('/api/network/slots', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao cadastrar Slot');
    }
    return res.json();
  },

  async updateSlot(id: string, data: Partial<NetworkSlot>): Promise<NetworkSlot> {
    const res = await fetch(`/api/network/slots/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar Slot');
    }
    return res.json();
  },

  async deleteSlot(id: string): Promise<void> {
    const res = await fetch(`/api/network/slots/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Falha ao excluir Slot');
  },

  async createPon(data: Partial<NetworkPon>): Promise<NetworkPon> {
    const res = await fetch('/api/network/pons', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao cadastrar porta PON');
    }
    return res.json();
  },

  async updatePon(id: string, data: Partial<NetworkPon>): Promise<NetworkPon> {
    const res = await fetch(`/api/network/pons/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar porta PON');
    }
    return res.json();
  },

  async deletePon(id: string): Promise<void> {
    const res = await fetch(`/api/network/pons/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Falha ao excluir porta PON');
  },

  async createCto(data: Partial<NetworkCto>): Promise<NetworkCto> {
    const res = await fetch('/api/network/ctos', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao cadastrar CTO');
    }
    return res.json();
  },

  async createCtosBatch(data: CreateCtosBatchRequest): Promise<{ success: boolean; count: number; ctos: NetworkCto[] }> {
    const res = await fetch('/api/network/ctos/batch', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao cadastrar lote de CTOs');
    }
    return res.json();
  },

  async updateCto(id: string, data: Partial<NetworkCto>): Promise<NetworkCto> {
    const res = await fetch(`/api/network/ctos/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar CTO');
    }
    return res.json();
  },

  async deleteCto(id: string): Promise<void> {
    const res = await fetch(`/api/network/ctos/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Falha ao excluir CTO');
  },

  // Consulta e associação de infraestrutura FTTH (OLT/PON/CTO) por CPF do cliente
  async getCustomerNetwork(cpf: string): Promise<{ cpfCnpj: string; olt: string; pon: string; cto: string }> {
    const res = await fetch(`/api/network/customer?cpf=${encodeURIComponent(cpf)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Falha ao buscar rede do cliente');
    return res.json();
  },

  async saveCustomerNetwork(data: { cpfCnpj: string; olt: string; pon: string; cto: string }): Promise<any> {
    const res = await fetch('/api/network/customer', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao salvar associação da rede ao cliente');
    }
    return res.json();
  },
};

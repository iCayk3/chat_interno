import type { Conversation, Message, CustomerEnrichment, WhatsAppTemplate, StartOutboundChatPayload } from '../types/chat';
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
  ConversationItem,
  SearchConversationsParams,
  SearchConversationsResponse,
  ConversationFullResponse,
  ReportSummaryResponse,
  ChannelsConfig,
  TelegramConfig,
  WhatsAppOfficialConfig,
  WhatsAppEvolutionConfig,
  EvolutionInstance,
  SystemSettings,
  SaveSystemSettingsPayload,
  NativePlan,
  NativeCustomer,
  NativeInvoice,
  SystemLicense,
  LicensePlanOptions,
  LicenseCheckoutResult,
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

// Interceptor global para interceptar 402 (licença suspensa) instantaneamente em qualquer tela
if (typeof window !== 'undefined' && !(window as any).__solFetchIntercepted) {
  (window as any).__solFetchIntercepted = true;
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await originalFetch(...args);
    if (res.status === 402) {
      try {
        const clone = res.clone();
        clone.json().then((data) => {
          window.dispatchEvent(new CustomEvent('license:suspended', { detail: data }));
        }).catch(() => {});
      } catch {}
    }
    return res;
  };
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
    if (!res.ok) {
      if (res.status === 401) {
        this.clearSession();
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Sessão expirada ou não autorizada');
    }
    return res.json();
  },

  async listUsers(): Promise<AuthUser[]> {
    const res = await fetch('/api/auth/users', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      if (res.status === 401) {
        this.clearSession();
        window.dispatchEvent(new CustomEvent('auth:expired'));
        throw new Error('Sessão expirada. Por favor, faça login novamente.');
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao listar usuários');
    }
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
    if (!res.ok) {
      if (res.status === 401) {
        this.clearSession();
        window.dispatchEvent(new CustomEvent('auth:expired'));
        throw new Error('Sessão expirada. Por favor, faça login novamente.');
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao cadastrar usuário');
    }
    return res.json();
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
    if (!res.ok) {
      if (res.status === 401) {
        this.clearSession();
        window.dispatchEvent(new CustomEvent('auth:expired'));
        throw new Error('Sessão expirada. Por favor, faça login novamente.');
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao atualizar usuário');
    }
    return res.json();
  },

  async updateProfile(name: string, phone: string, department: string): Promise<AuthUser> {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, phone, department }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        this.clearSession();
        window.dispatchEvent(new CustomEvent('auth:expired'));
        throw new Error('Sessão expirada. Por favor, faça login novamente.');
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao atualizar dados de perfil');
    }
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
    if (!res.ok) {
      if (res.status === 401) {
        this.clearSession();
        window.dispatchEvent(new CustomEvent('auth:expired'));
        throw new Error('Sessão expirada. Por favor, faça login novamente.');
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao alterar senha');
    }
    return res.json();
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
    const token = localStorage.getItem('sol_crm_auth_token');
    if (!token) {
      localStorage.removeItem('sol_crm_user');
      return null;
    }
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

  async closeConversation(id: string, reason?: string, closedBy?: string): Promise<void> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/close`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason, closedBy }),
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

  // --- Consulta e Auditoria Geral de Atendimentos ---
  async searchConversations(params: SearchConversationsParams = {}): Promise<SearchConversationsResponse> {
    const query = new URLSearchParams();
    if (params.operatorId) query.set('operatorId', params.operatorId);
    if (params.department) query.set('department', params.department);
    if (params.rbxGroup) query.set('rbxGroup', params.rbxGroup);
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.rating) query.set('rating', String(params.rating));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));

    const res = await fetch(`/api/conversations/search?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao buscar atendimentos');
    }
    return res.json();
  },

  async getConversationFull(id: string): Promise<ConversationFullResponse> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/full`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao carregar detalhes do atendimento');
    }
    return res.json();
  },

  async rateConversation(id: string, rating: number, comment: string = ''): Promise<{ success: boolean; conversation: ConversationItem }> {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/rate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ rating, comment }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao registrar avaliação');
    }
    return res.json();
  },

  // --- Relatórios e Métricas Gerenciais (TMA, TME, Satisfação, Volumetria) ---
  async getReportSummary(params: {
    period?: string;
    department?: string;
    operatorId?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<ReportSummaryResponse> {
    const query = new URLSearchParams();
    if (params.period) query.set('period', params.period);
    if (params.department) query.set('department', params.department);
    if (params.operatorId) query.set('operatorId', params.operatorId);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);

    const res = await fetch(`/api/reports/summary?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao carregar relatório');
    }
    return res.json();
  },

  // --- Canais Omnichannel (Telegram, WhatsApp Oficial, WhatsApp Evolution) ---
  async getChannelsConfig(): Promise<ChannelsConfig> {
    const res = await fetch('/api/channels/config', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao buscar configurações dos canais');
    }
    return res.json();
  },

  async saveTelegramConfig(config: Partial<TelegramConfig>): Promise<{ success: boolean; config: TelegramConfig }> {
    const res = await fetch('/api/channels/telegram', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao salvar configuração do Telegram');
    }
    return res.json();
  },

  async testTelegram(): Promise<{ success: boolean; botName: string; botUsername: string }> {
    const res = await fetch('/api/channels/telegram/test', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao testar Bot do Telegram');
    }
    return res.json();
  },

  async setupTelegramWebhook(webhookUrl: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/channels/telegram/webhook', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ webhookUrl }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao registrar webhook do Telegram');
    }
    return res.json();
  },

  async saveWhatsAppOfficialConfig(config: Partial<WhatsAppOfficialConfig>): Promise<{ success: boolean; config: WhatsAppOfficialConfig }> {
    const res = await fetch('/api/channels/whatsapp-official', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao salvar configuração do WhatsApp Oficial');
    }
    return res.json();
  },

  async testWhatsAppOfficial(): Promise<{ success: boolean; displayPhoneNumber: string }> {
    const res = await fetch('/api/channels/whatsapp-official/test', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao testar credenciais do WhatsApp Oficial');
    }
    return res.json();
  },

  async saveEvolutionConfig(config: Partial<WhatsAppEvolutionConfig>): Promise<{ success: boolean; config: WhatsAppEvolutionConfig }> {
    const res = await fetch('/api/channels/evolution', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao salvar configuração do Evolution');
    }
    return res.json();
  },

  async fetchEvolutionInstances(): Promise<EvolutionInstance[]> {
    const res = await fetch('/api/channels/evolution/instances', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao listar instâncias do Evolution API');
    }
    return res.json();
  },

  async createEvolutionInstance(instanceName: string): Promise<{ success: boolean; instance: any }> {
    const res = await fetch('/api/channels/evolution/instance', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ instanceName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao criar instância no Evolution API');
    }
    return res.json();
  },

  async getEvolutionQRCode(instanceName?: string): Promise<{ pairingCode?: string; code?: string; base64?: string; count?: number }> {
    const query = instanceName ? `?instance=${encodeURIComponent(instanceName)}` : '';
    const res = await fetch(`/api/channels/evolution/qrcode${query}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao gerar QR Code do Evolution');
    }
    return res.json();
  },

  async setupEvolutionWebhook(webhookUrl?: string, instanceName?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/channels/evolution/webhook', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ webhookUrl, instanceName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao configurar Webhook no Evolution');
    }
    return res.json();
  },

  async logoutEvolutionInstance(instanceName: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/channels/evolution/instance/${encodeURIComponent(instanceName)}/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao desconectar instância no Evolution');
    }
    return res.json();
  },

  async deleteEvolutionInstance(instanceName: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/channels/evolution/instance/${encodeURIComponent(instanceName)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao excluir instância no Evolution');
    }
    return res.json();
  },

  // Templates aprovados para início de atendimento no WhatsApp Oficial (Meta)
  async getWhatsAppOfficialTemplates(): Promise<WhatsAppTemplate[]> {
    const res = await fetch('/api/channels/whatsapp-official/templates', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao listar templates do WhatsApp Oficial');
    }
    return res.json();
  },

  // Iniciar atendimento avulso (outbound) em qualquer canal
  async startOutboundConversation(payload: StartOutboundChatPayload): Promise<{ conversation: Conversation; message: Message }> {
    const res = await fetch('/api/conversations/outbound', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao iniciar atendimento avulso');
    }
    return res.json();
  },

  // ==========================================================================
  // CONFIGURAÇÕES DO SISTEMA & MODOS DE OPERAÇÃO (ERP vs NATIVO vs HÍBRIDO)
  // ==========================================================================
  async getSystemSettings(): Promise<SystemSettings> {
    const res = await fetch('/api/system/settings', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao carregar configurações do sistema');
    }
    return res.json();
  },

  async saveSystemSettings(payload: SaveSystemSettingsPayload): Promise<SystemSettings> {
    const res = await fetch('/api/system/settings', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao salvar configurações do sistema');
    }
    return res.json();
  },

  async testMercadoPago(accessToken?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/system/mercadopago/test', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ accessToken: accessToken || '' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Falha ao autenticar com o Mercado Pago');
    }
    return data;
  },

  // ==========================================================================
  // PLANOS E SERVIÇOS NATIVOS
  // ==========================================================================
  async getNativePlans(): Promise<NativePlan[]> {
    const res = await fetch('/api/native/plans', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao buscar planos');
    }
    return res.json();
  },

  async createNativePlan(plan: Partial<NativePlan>): Promise<NativePlan> {
    const res = await fetch('/api/native/plans', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(plan),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao criar plano');
    }
    return res.json();
  },

  async updateNativePlan(id: string, plan: Partial<NativePlan>): Promise<NativePlan> {
    const res = await fetch(`/api/native/plans/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(plan),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar plano');
    }
    return res.json();
  },

  async deleteNativePlan(id: string): Promise<void> {
    const res = await fetch(`/api/native/plans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao desativar plano');
    }
  },

  // ==========================================================================
  // CLIENTES NATIVOS
  // ==========================================================================
  async getNativeCustomers(params?: { search?: string; status?: string; planId?: string }): Promise<NativeCustomer[]> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.planId) query.set('planId', params.planId);

    const res = await fetch(`/api/native/customers?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao listar clientes');
    }
    return res.json();
  },

  async getNativeCustomer(id: string): Promise<NativeCustomer> {
    const res = await fetch(`/api/native/customers/${encodeURIComponent(id)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Cliente não encontrado');
    }
    return res.json();
  },

  async lookupNativeCustomer(cpfCnpj: string): Promise<NativeCustomer> {
    const res = await fetch(`/api/native/customers/lookup?cpfCnpj=${encodeURIComponent(cpfCnpj)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Cliente não localizado na base nativa');
    }
    return res.json();
  },

  async createNativeCustomer(data: any): Promise<NativeCustomer> {
    const res = await fetch('/api/native/customers', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao cadastrar cliente');
    }
    return res.json();
  },

  async updateNativeCustomer(id: string, data: any): Promise<NativeCustomer> {
    const res = await fetch(`/api/native/customers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar cliente');
    }
    return res.json();
  },

  async deleteNativeCustomer(id: string): Promise<void> {
    const res = await fetch(`/api/native/customers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao excluir cliente');
    }
  },

  // ==========================================================================
  // FATURAS E MERCADO PAGO
  // ==========================================================================
  async getNativeInvoices(params?: { customerId?: string; cpfCnpj?: string; status?: string }): Promise<NativeInvoice[]> {
    const query = new URLSearchParams();
    if (params?.customerId) query.set('customerId', params.customerId);
    if (params?.cpfCnpj) query.set('cpfCnpj', params.cpfCnpj);
    if (params?.status) query.set('status', params.status);

    const res = await fetch(`/api/native/invoices?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao listar faturas');
    }
    return res.json();
  },

  async getNativeInvoice(id: string): Promise<NativeInvoice> {
    const res = await fetch(`/api/native/invoices/${encodeURIComponent(id)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Fatura não encontrada');
    }
    return res.json();
  },

  async createNativeInvoice(data: any): Promise<NativeInvoice> {
    const res = await fetch('/api/native/invoices', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao emitir fatura');
    }
    return res.json();
  },

  async generateNativePix(id: string): Promise<{ success: boolean; pixQrCode: string; pixQrCodeBase64: string }> {
    const res = await fetch(`/api/native/invoices/${encodeURIComponent(id)}/pix`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao gerar Pix no Mercado Pago');
    }
    return res.json();
  },

  async generateNativeBoleto(id: string): Promise<{ success: boolean; boletoUrl: string; boletoBarcode: string }> {
    const res = await fetch(`/api/native/invoices/${encodeURIComponent(id)}/boleto`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao emitir boleto no Mercado Pago');
    }
    return res.json();
  },

  async payNativeInvoiceManual(id: string): Promise<NativeInvoice> {
    const res = await fetch(`/api/native/invoices/${encodeURIComponent(id)}/pay-manual`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao registrar pagamento manual');
    }
    return res.json();
  },

  async sendNativeInvoiceToChat(data: {
    conversationId: string;
    invoiceId: string;
    method: 'pix' | 'boleto';
    operatorId?: string;
    operatorName?: string;
  }): Promise<any> {
    const res = await fetch(`/api/native/invoices/${encodeURIComponent(data.invoiceId)}/send-to-chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao enviar fatura para a conversa');
    }
    return res.json();
  },

  // --- Licenciamento do Sistema ---
  async getLicenseStatus(): Promise<SystemLicense> {
    const res = await fetch('/api/system/license', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao consultar status da licença');
    }
    return res.json();
  },

  async activateLicense(licenseKey: string): Promise<{ success: boolean; message: string; license: SystemLicense }> {
    const res = await fetch('/api/system/license/activate', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ licenseKey }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao ativar chave de licença');
    }
    return res.json();
  },

  async refreshLicense(): Promise<{ success: boolean; message: string; license: SystemLicense }> {
    const res = await fetch('/api/system/license/refresh', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao sincronizar licença');
    }
    return res.json();
  },

  async getLicensePlans(): Promise<LicensePlanOptions> {
    const res = await fetch('/api/system/license/plans', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao consultar planos de licença');
    }
    return res.json();
  },

  async createLicenseCheckout(
    cycle: 'monthly' | 'annual',
    paymentMethod: 'pix' | 'mercadopago'
  ): Promise<LicenseCheckoutResult> {
    const res = await fetch('/api/system/license/checkout', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ cycle, paymentMethod }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao gerar cobrança da licença');
    }
    return res.json();
  },

  async checkPaymentStatus(): Promise<{ success: boolean; active: boolean; license: SystemLicense }> {
    const res = await fetch('/api/system/license/check-payment', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao verificar pagamento');
    }
    return res.json();
  },
};

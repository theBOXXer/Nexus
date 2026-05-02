const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('nexus_token');
}

export function setToken(token: string) {
  localStorage.setItem('nexus_token', token);
}

export function clearToken() {
  localStorage.removeItem('nexus_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      window.location.reload();
      throw new Error('Session expired');
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}

function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
}

function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

function patch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
}

export type Category = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
};

export type Chat = {
  id: string;
  user_id: string;
  category_id: string | null;
  title: string;
  model: string;
  archived: number;
  created_at: string;
  updated_at: string;
};

export type SharedLink = {
  id: string;
  chat_id: string;
  user_id: string;
  token: string;
  created_at: string;
  chat_title: string;
};

export type Message = {
  id: string;
  chat_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  images: string;
  created_at: string;
};

export const auth = {
  signUp: (email: string, password: string) =>
    post<{ token: string; user: { id: string; email: string } }>('/auth/signup', { email, password }),
  signIn: (email: string, password: string) =>
    post<{ token: string; user: { id: string; email: string } }>('/auth/signin', { email, password }),
  me: () => get<{ id: string; email: string }>('/auth/me'),
  signOut: () => { clearToken(); },
  getToken,
};

export const categories = {
  list: () => get<Category[]>('/categories'),
  create: () => post<Category>('/categories'),
  update: (id: string, data: { name?: string; position?: number; color?: string }) =>
    put<{ success: boolean }>(`/categories/${id}`, data),
  remove: (id: string) => del<{ success: boolean }>(`/categories/${id}`),
};

export const chats = {
  list: () => get<Chat[]>('/chats'),
  create: (data: { category_id?: string | null; title?: string; model?: string; created_at?: string }) =>
    post<Chat>('/chats', data),
  update: (id: string, data: Record<string, unknown>) =>
    put<{ success: boolean }>(`/chats/${id}`, data),
  remove: (id: string) => del<{ success: boolean }>(`/chats/${id}`),
};

export const messages = {
  list: (chatId: string) => get<Message[]>(`/messages?chat_id=${encodeURIComponent(chatId)}`),
  create: (data: { chat_id: string; role: string; content: string; model?: string; images?: string[] }) =>
    post<Message>('/messages', data),
  update: (id: string, data: { content?: string; images?: string[] }) =>
    patch<Message>(`/messages/${id}`, data),
};

export const upload = {
  image: async (file: File): Promise<{ url: string }> => {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  },
};

export const llm = {
  chat: (model: string, msgs: { role: string; content: string; images?: string[] }[], size?: string) =>
    post<{ content: string; images?: string[] }>('/llm-chat', { model, messages: msgs, size }),
};

export const generate = {
  image: (prompt: string, chatId: string, size?: string) =>
    post<Message>('/generate-image', { prompt, chat_id: chatId, size }),
};

export const share = {
  create: (chatId: string) =>
    post<{ id: string; token: string; url: string }>('/share', { chat_id: chatId }),
  list: () => get<SharedLink[]>('/shares'),
  revoke: (id: string) => del<{ success: boolean }>(`/share/${id}`),
  get: (token: string) =>
    get<{ chat: { id: string; title: string; model: string; created_at: string }; messages: Message[] }>(`/shared?token=${encodeURIComponent(token)}`),
};

export const webSearch = {
  search: (query: string) =>
    post<{ results: string }>('/web-search', { query }),
};

export const MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', simpleLabel: 'O-4o $$$', beginnerLabel: 'GPT ★★★' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', simpleLabel: 'O-Mini $', beginnerLabel: 'GPT ★' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'OpenAI', simpleLabel: 'O-4T $$$', beginnerLabel: 'GPT ★★★' },
  { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'OpenAI', simpleLabel: 'O-3.5 $', beginnerLabel: 'GPT ★' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'Anthropic', simpleLabel: 'C-Op4.7 $$$', beginnerLabel: 'Claude ★★★' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'Anthropic', simpleLabel: 'C-Op4.6 $$$', beginnerLabel: 'Claude ★★★' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', simpleLabel: 'C-So4.6 $$', beginnerLabel: 'Claude ★★' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'Anthropic', simpleLabel: 'C-So4.5 $$', beginnerLabel: 'Claude ★★' },
  { id: 'claude-3-7-sonnet-20250219', label: 'Claude Sonnet 3.7', provider: 'Anthropic', simpleLabel: 'C-So3.7 $$', beginnerLabel: 'Claude ★★' },
  { id: 'claude-3-opus-20240229', label: 'Claude Opus 3', provider: 'Anthropic', simpleLabel: 'C-Op3 $$$', beginnerLabel: 'Claude ★★★' },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'Anthropic', simpleLabel: 'C-Hk $', beginnerLabel: 'Claude ★' },
  { id: 'deepseek-chat', label: 'DeepSeek V3', provider: 'DeepSeek', simpleLabel: 'D-V3 $', beginnerLabel: 'DeepSeek ★' },
  { id: 'deepseek-reasoner', label: 'DeepSeek R1', provider: 'DeepSeek', simpleLabel: 'D-R1 $$', beginnerLabel: 'DeepSeek ★★' },
  { id: 'dall-e-3', label: 'DALL-E 3', provider: 'OpenAI', simpleLabel: 'O-D3 $$', beginnerLabel: 'DALL-E ★★' },
  { id: 'none', label: 'Notes (No AI)', provider: 'Local', simpleLabel: 'Notes', beginnerLabel: 'Notes' },
] as const;

export const CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#0ea5e9', '#3b82f6', '#ec4899',
  '#64748b', '#78716c',
];

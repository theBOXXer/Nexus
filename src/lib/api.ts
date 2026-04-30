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

export type Message = {
  id: string;
  chat_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
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
  create: (data: { category_id?: string | null; title?: string; model?: string }) =>
    post<Chat>('/chats', data),
  update: (id: string, data: Record<string, unknown>) =>
    put<{ success: boolean }>(`/chats/${id}`, data),
  remove: (id: string) => del<{ success: boolean }>(`/chats/${id}`),
};

export const messages = {
  list: (chatId: string) => get<Message[]>(`/messages?chat_id=${encodeURIComponent(chatId)}`),
  create: (data: { chat_id: string; role: string; content: string; model?: string }) =>
    post<Message>('/messages', data),
};

export const llm = {
  chat: (model: string, msgs: { role: string; content: string }[]) =>
    post<{ content: string }>('/llm-chat', { model, messages: msgs }),
};

export const MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'OpenAI' },
  { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'OpenAI' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'Anthropic' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'Anthropic' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'Anthropic' },
  { id: 'claude-3-7-sonnet-20250219', label: 'Claude Sonnet 3.7', provider: 'Anthropic' },
  { id: 'claude-3-opus-20240229', label: 'Claude Opus 3', provider: 'Anthropic' },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'Anthropic' },
  { id: 'deepseek-chat', label: 'DeepSeek V3', provider: 'DeepSeek' },
  { id: 'deepseek-reasoner', label: 'DeepSeek R1', provider: 'DeepSeek' },
] as const;

export const CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#0ea5e9', '#3b82f6', '#ec4899',
  '#64748b', '#78716c',
];

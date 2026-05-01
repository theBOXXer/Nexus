interface Env {
  DB: { prepare(sql: string): { bind(...args: unknown[]): { run(): Promise<{ changes: number }>; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> } } };
  JWT_SECRET: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  IMAGES?: { put(key: string, value: ArrayBuffer | ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<{ key: string } | null>; get(key: string): Promise<{ body: ReadableStream } | null> };
  GOOGLE_API_KEY?: string;
  GOOGLE_CX?: string;
}

interface JWTPayload {
  sub: string;
  email: string;
  exp: number;
  iat: number;
}

// ─── JWT ────────────────────────────────────────────────────────────────────

function base64urlEncode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const full: JWTPayload = { ...payload, iat: now, exp: now + 86400 * 7 };
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = base64urlEncode(enc.encode(JSON.stringify(header)));
  const p = base64urlEncode(enc.encode(JSON.stringify(full)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${base64urlEncode(sig)}`;
}

async function verifyJWT(token: string, secret: string): Promise<JWTPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [h, p, s] = parts;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, base64urlDecode(s), enc.encode(`${h}.${p}`));
  if (!valid) throw new Error('Invalid signature');
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(p))) as JWTPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

// ─── Password hashing ───────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashHex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const computed = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return computed === hashHex;
}

// ─── Auth middleware ─────────────────────────────────────────────────────────

async function requireAuth(request: Request, env: Env): Promise<{ userId: string; email: string }> {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) throw new Error('Missing token');
  const payload = await verifyJWT(auth.slice(7), env.JWT_SECRET);
  return { userId: payload.sub, email: payload.email };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Route handlers ──────────────────────────────────────────────────────────

async function handleAuthSignup(req: Request, env: Env): Promise<Response> {
  const { email, password } = await req.json() as { email?: string; password?: string };
  if (!email || !password) return error('Email and password required');
  if (password.length < 6) return error('Password must be at least 6 characters');

  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  try {
    await env.DB.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').bind(id, email.toLowerCase(), hash).run();
  } catch (e: unknown) {
    if (e instanceof Error && e.message?.includes('UNIQUE')) return error('Email already registered', 409);
    throw e;
  }
  const token = await signJWT({ sub: id, email: email.toLowerCase() }, env.JWT_SECRET);
  return json({ token, user: { id, email: email.toLowerCase() } });
}

async function handleAuthSignin(req: Request, env: Env): Promise<Response> {
  const { email, password } = await req.json() as { email?: string; password?: string };
  if (!email || !password) return error('Email and password required');

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first<{ id: string; password_hash: string }>();
  if (!user) return error('Invalid email or password', 401);

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return error('Invalid email or password', 401);

  const token = await signJWT({ sub: user.id, email: email.toLowerCase() }, env.JWT_SECRET);
  return json({ token, user: { id: user.id, email: email.toLowerCase() } });
}

async function handleAuthMe(req: Request, env: Env): Promise<Response> {
  const { userId, email } = await requireAuth(req, env);
  return json({ id: userId, email });
}

// ─── Categories ──────────────────────────────────────────────────────────────

async function listCategories(_req: Request, env: Env, userId: string): Promise<Response> {
  const rows = await env.DB.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY position').bind(userId).all();
  return json(rows.results);
}

async function createCategory(req: Request, env: Env, userId: string): Promise<Response> {
  const id = crypto.randomUUID();
  const color = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6', '#ec4899', '#64748b'][Math.floor(Math.random() * 9)];
  await env.DB.prepare('INSERT INTO categories (id, user_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, userId, 'New Category', color, 0, new Date().toISOString()).run();
  const row = await env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
  return json(row, 201);
}

async function updateCategory(req: Request, env: Env, userId: string, catId: string): Promise<Response> {
  const body = await req.json() as { name?: string; position?: number; color?: string };
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name.trim()); }
  if (body.position !== undefined) { sets.push('position = ?'); vals.push(body.position); }
  if (body.color !== undefined) { sets.push('color = ?'); vals.push(body.color); }
  if (sets.length === 0) return error('No valid fields');
  vals.push(catId, userId);
  const result = await env.DB.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...vals.map(v => v === undefined ? null : v) as unknown[]).run();
  if (result.changes === 0) return error('Not found', 404);
  return json({ success: true });
}

async function deleteCategory(_req: Request, env: Env, userId: string, catId: string): Promise<Response> {
  await env.DB.prepare('UPDATE chats SET archived = 1, category_id = NULL WHERE category_id = ? AND user_id = ?').bind(catId, userId).run();
  const result = await env.DB.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').bind(catId, userId).run();
  if (result.changes === 0) return error('Not found', 404);
  return json({ success: true });
}

// ─── Chats ───────────────────────────────────────────────────────────────────

async function listChats(_req: Request, env: Env, userId: string): Promise<Response> {
  const rows = await env.DB.prepare('SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC').bind(userId).all();
  return json(rows.results);
}

async function createChat(req: Request, env: Env, userId: string): Promise<Response> {
  const { category_id, title, model, created_at } = await req.json() as { category_id?: string; title?: string; model?: string; created_at?: string };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const catCreatedAt = created_at || now;
  await env.DB.prepare('INSERT INTO chats (id, user_id, category_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, userId, category_id || null, title || 'New Chat', model || 'gpt-4o-mini', catCreatedAt, now).run();
  const row = await env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(id).first();
  return json(row, 201);
}

async function updateChat(req: Request, env: Env, userId: string, chatId: string): Promise<Response> {
  const body = await req.json() as Record<string, unknown>;
  const allowed = ['title', 'model', 'archived', 'category_id', 'created_at'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (allowed.includes(k)) {
      sets.push(`${k} = ?`);
      vals.push(k === 'archived' ? (v ? 1 : 0) : v);
    }
  }
  if (sets.length === 0) return error('No valid fields');
  const bindVals = [...vals, new Date().toISOString(), chatId, userId];
  const result = await env.DB.prepare(`UPDATE chats SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`)
    .bind(...bindVals.map(v => v === undefined ? null : v) as unknown[]).run();
  if (result.changes === 0) return error('Not found', 404);
  return json({ success: true });
}

async function deleteChat(_req: Request, env: Env, userId: string, chatId: string): Promise<Response> {
  const result = await env.DB.prepare('DELETE FROM chats WHERE id = ? AND user_id = ?').bind(chatId, userId).run();
  if (result.changes === 0) return error('Not found', 404);
  return json({ success: true });
}

// ─── Messages ────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  chat_id: string;
  user_id: string;
  role: string;
  content: string;
  model: string | null;
  images: string;
  created_at: string;
}

async function listMessages(req: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(req.url);
  const chatId = url.searchParams.get('chat_id');
  if (!chatId) return error('chat_id required');
  // Verify chat belongs to user
  const chat = await env.DB.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').bind(chatId, userId).first();
  if (!chat) return error('Chat not found', 404);
  const rows = await env.DB.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC').bind(chatId).all();
  return json(rows.results);
}

async function createMessage(req: Request, env: Env, userId: string): Promise<Response> {
  const { chat_id, role, content, model, images } = await req.json() as { chat_id?: string; role?: string; content?: string; model?: string; images?: string[] };
  if (!chat_id || (!content && (!images || images.length === 0))) return error('chat_id and content required');
  const chat = await env.DB.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').bind(chat_id, userId).first();
  if (!chat) return error('Chat not found', 404);
  const id = crypto.randomUUID();
  const imagesJson = JSON.stringify(images || []);
  await env.DB.prepare('INSERT INTO messages (id, chat_id, user_id, role, content, model, images) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, chat_id, userId, role || 'user', content, model || null, imagesJson).run();
  await env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(new Date().toISOString(), chat_id).run();
  const row = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first();
  return json(row, 201);
}

async function updateMessage(req: Request, env: Env, userId: string, msgId: string): Promise<Response> {
  const { content, images } = await req.json() as { content?: string; images?: string[] };
  const msg = await env.DB.prepare('SELECT m.*, c.user_id FROM messages m JOIN chats c ON m.chat_id = c.id WHERE m.id = ?').bind(msgId).first<{ id: string; user_id: string }>();
  if (!msg || msg.user_id !== userId) return error('Message not found', 404);

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (content !== undefined) { sets.push('content = ?'); vals.push(content); }
  if (images !== undefined) { sets.push('images = ?'); vals.push(JSON.stringify(images)); }
  if (sets.length === 0) return error('No valid fields');
  vals.push(msgId);
  await env.DB.prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  const updated = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(msgId).first();
  return json(updated);
}

// ─── Image Upload ────────────────────────────────────────────────────────────

async function handleUpload(req: Request, env: Env, _userId: string): Promise<Response> {
  if (!env.IMAGES) return error('R2 not configured', 500);
  const contentType = req.headers.get('Content-Type') || '';
  if (!contentType.includes('multipart/form-data') && !contentType.includes('application/octet-stream')) {
    return error('Expected image data', 400);
  }

  let buffer: ArrayBuffer;
  let mimeType = 'image/png';

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) return error('No file provided', 400);
    if (file.size > 5 * 1024 * 1024) return error('File too large (max 5MB)', 400);
    mimeType = file.type || 'image/png';
    buffer = await file.arrayBuffer();
  } else {
    if ((req.body?.length || 0) > 5 * 1024 * 1024) return error('File too large (max 5MB)', 400);
    const blob = await req.blob();
    mimeType = blob.type || 'image/png';
    buffer = await blob.arrayBuffer();
  }

  const key = `${crypto.randomUUID()}.${mimeType.split('/').pop() || 'png'}`;
  await env.IMAGES.put(key, buffer, { httpMetadata: { contentType: mimeType } });

  const url = `https://pub-a5ed7db69cbb4f71a14a3706092b8c99.r2.dev/${key}`;
  return json({ url }, 201);
}

// ─── LLM Chat ────────────────────────────────────────────────────────────────

const MODEL_MAP: Record<string, 'openai' | 'anthropic' | 'deepseek'> = {
  'gpt-4o': 'openai', 'gpt-4o-mini': 'openai', 'gpt-4-turbo': 'openai', 'gpt-3.5-turbo': 'openai',
  'claude-opus-4-7': 'anthropic', 'claude-opus-4-6': 'anthropic',
  'claude-sonnet-4-6': 'anthropic', 'claude-sonnet-4-5': 'anthropic',
  'claude-3-7-sonnet-20250219': 'anthropic', 'claude-3-opus-20240229': 'anthropic',
  'claude-3-5-haiku-20241022': 'anthropic',
  'deepseek-chat': 'deepseek', 'deepseek-reasoner': 'deepseek',
  'dall-e-3': 'openai',
};

async function handleLLMChat(req: Request, env: Env): Promise<Response> {
  const { model, messages } = await req.json() as { model?: string; messages?: { role: string; content: string; images?: string[] }[] };
  if (!model || !messages) return error('model and messages required');

  const provider = MODEL_MAP[model];
  if (!provider) return error(`Unsupported model: ${model}`);

  const hasImages = messages.some((m) => m.images && m.images.length > 0);

  if (model === 'dall-e-3') {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const prompt = lastUserMsg?.content || '';
    if (!prompt) return error('No user message to use as prompt', 400);

    const key = env.OPENAI_API_KEY;
    if (!key) return error('OPENAI_API_KEY not configured', 500);

    const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024' }),
    });
    if (!imgRes.ok) return error(`DALL-E: ${await imgRes.text()}`, 502);
    const imgData = await imgRes.json() as { data: { url: string }[] };
    const imageUrl = imgData.data[0].url;

    let r2Url = imageUrl;
    if (env.IMAGES) {
      try {
        const imgBlob = await fetch(imageUrl);
        const buffer = await imgBlob.arrayBuffer();
        const r2Key = `${crypto.randomUUID()}.png`;
        await env.IMAGES.put(r2Key, buffer, { httpMetadata: { contentType: 'image/png' } });
        r2Url = `https://pub-a5ed7db69cbb4f71a14a3706092b8c99.r2.dev/${r2Key}`;
      } catch { /* use original URL if R2 upload fails */ }
    }

    return json({ content: '', images: [r2Url] });
  }

  if (provider === 'openai') {
    const key = env.OPENAI_API_KEY;
    if (!key) return error('OPENAI_API_KEY not configured', 500);

    const openaiMessages = messages.map((m) => {
      if (!m.images || m.images.length === 0) return { role: m.role, content: m.content };
      const parts: { type: string; text?: string; image_url?: { url: string } }[] = [];
      if (m.content) parts.push({ type: 'text', text: m.content });
      for (const url of m.images) {
        parts.push({ type: 'image_url', image_url: { url } });
      }
      return { role: m.role, content: parts };
    });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: openaiMessages }),
    });
    if (!res.ok) return error(`OpenAI: ${await res.text()}`, 502);
    const data = await res.json() as { choices: { message: { content: string } }[] };
    return json({ content: data.choices[0].message.content });
  }

  if (provider === 'deepseek') {
    if (hasImages) {
      return error('DeepSeek does not support image analysis. Switch to GPT-4o or Claude.', 400);
    }
    const key = env.DEEPSEEK_API_KEY;
    if (!key) return error('DEEPSEEK_API_KEY not configured', 500);
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages }),
    });
    if (!res.ok) return error(`DeepSeek: ${await res.text()}`, 502);
    const data = await res.json() as { choices: { message: { content: string } }[] };
    return json({ content: data.choices[0].message.content });
  }

  const key = env.ANTHROPIC_API_KEY;
  if (!key) return error('ANTHROPIC_API_KEY not configured', 500);
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');

  const anthropicMessages = await Promise.all(messages.filter((m) => m.role !== 'system').map(async (m) => {
    if (!m.images || m.images.length === 0) return { role: m.role, content: [{ type: 'text', text: m.content }] };
    const parts: { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[] = [];
    if (m.content) parts.push({ type: 'text', text: m.content });
    for (const url of m.images) {
      try {
        const imgRes = await fetch(url);
        if (!imgRes.ok) continue;
        const imgBuffer = await imgRes.arrayBuffer();
        const mediaType = imgRes.headers.get('Content-Type') || 'image/png';
        const bytes = new Uint8Array(imgBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        const base64 = btoa(binary);
        parts.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
      } catch { continue; }
    }
    return { role: m.role, content: parts };
  }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 4096, system: system || undefined, messages: anthropicMessages }),
  });
  if (!res.ok) return error(`Anthropic: ${await res.text()}`, 502);
  const data = await res.json() as { content: { text: string }[] };
  return json({ content: data.content[0].text });
}

// ─── Image Generation ──────────────────────────────────────────────────────

async function handleGenerateImage(req: Request, env: Env, userId: string): Promise<Response> {
  const { prompt, chat_id, size } = await req.json() as { prompt?: string; chat_id?: string; size?: string };
  if (!prompt || !chat_id) return error('prompt and chat_id required');

  const chat = await env.DB.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').bind(chat_id, userId).first();
  if (!chat) return error('Chat not found', 404);

  const key = env.OPENAI_API_KEY;
  if (!key) return error('OPENAI_API_KEY not configured', 500);

  const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: size || '1024x1024' }),
  });
  if (!imgRes.ok) return error(`DALL-E: ${await imgRes.text()}`, 502);
  const imgData = await imgRes.json() as { data: { url: string }[] };
  const imageUrl = imgData.data[0].url;

  let r2Url = imageUrl;
  if (env.IMAGES) {
    try {
      const imgBlob = await fetch(imageUrl);
      const buffer = await imgBlob.arrayBuffer();
      const r2Key = `${crypto.randomUUID()}.png`;
      await env.IMAGES.put(r2Key, buffer, { httpMetadata: { contentType: 'image/png' } });
      r2Url = `https://pub-a5ed7db69cbb4f71a14a3706092b8c99.r2.dev/${r2Key}`;
    } catch { /* keep fallback */ }
  }

  const userMsgId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO messages (id, chat_id, user_id, role, content, model) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(userMsgId, chat_id, userId, 'user', prompt, null).run();
  await env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').bind(new Date().toISOString(), chat_id).run();

  const aiMsgId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO messages (id, chat_id, user_id, role, content, model, images) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(aiMsgId, chat_id, userId, 'assistant', '', 'dall-e-3', JSON.stringify([r2Url])).run();

  const aiMsg = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(aiMsgId).first();
  return json(aiMsg, 201);
}

// ─── Chat Sharing ──────────────────────────────────────────────────────────

async function handleCreateShare(req: Request, env: Env, userId: string): Promise<Response> {
  const { chat_id } = await req.json() as { chat_id?: string };
  if (!chat_id) return error('chat_id required');

  const chat = await env.DB.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').bind(chat_id, userId).first();
  if (!chat) return error('Chat not found', 404);

  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO shared_chats (id, chat_id, user_id, token) VALUES (?, ?, ?, ?)')
    .bind(id, chat_id, userId, token).run();
  return json({ id, token, url: `/?share=${token}` }, 201);
}

async function handleListShares(_req: Request, env: Env, userId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    'SELECT s.*, c.title as chat_title FROM shared_chats s JOIN chats c ON s.chat_id = c.id WHERE s.user_id = ? ORDER BY s.created_at DESC'
  ).bind(userId).all();
  return json(rows.results);
}

async function handleRevokeShare(_req: Request, env: Env, userId: string, shareId: string): Promise<Response> {
  const result = await env.DB.prepare('DELETE FROM shared_chats WHERE id = ? AND user_id = ?').bind(shareId, userId).run();
  if (result.changes === 0) return error('Not found', 404);
  return json({ success: true });
}

async function handleGetShared(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return error('token required');

  const share = await env.DB.prepare('SELECT * FROM shared_chats WHERE token = ?').bind(token).first<{ chat_id: string }>();
  if (!share) return error('Shared chat not found', 404);

  const chat = await env.DB.prepare('SELECT id, title, model, created_at FROM chats WHERE id = ?').bind(share.chat_id).first<{ id: string; title: string; model: string; created_at: string }>();
  if (!chat) return error('Chat not found', 404);

  const msgs = await env.DB.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC').bind(share.chat_id).all();
  return json({ chat, messages: msgs.results });
}

// ─── Web Search ────────────────────────────────────────────────────────────

async function handleWebSearch(req: Request, env: Env): Promise<Response> {
  const { query } = await req.json() as { query?: string };
  if (!query) return error('query required');

  const apiKey = env.GOOGLE_API_KEY;
  const cx = env.GOOGLE_CX;
  if (!apiKey || !cx) return error('Google search not configured', 500);

  const res = await fetch(
    `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=5`
  );
  if (!res.ok) return error(`Google Search: ${await res.text()}`, 502);
  const data = await res.json() as { items?: { title: string; link: string; snippet: string }[] };

  if (!data.items || data.items.length === 0) {
    return json({ results: 'No search results found.' });
  }

  const results = data.items
    .map((item, i) => `${i + 1}. **${item.title}**\n   ${item.snippet}\n   ${item.link}`)
    .join('\n\n');

  return json({ results });
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '');

  try {
    // Auth routes (no token required)
    if (path === '/auth/signup' && request.method === 'POST') {
      const res = await handleAuthSignup(request, env);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    if (path === '/auth/signin' && request.method === 'POST') {
      const res = await handleAuthSignin(request, env);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }

    // Shared chat (public — no auth required)
    if (path === '/shared' && request.method === 'GET') {
      const res = await handleGetShared(request, env);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }

    // Protected routes
    const { userId } = await requireAuth(request, env);

    if (path === '/auth/me' && request.method === 'GET') {
      const res = await handleAuthMe(request, env);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }

    // Categories
    if (path === '/categories' && request.method === 'GET') {
      const res = await listCategories(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    if (path === '/categories' && request.method === 'POST') {
      const res = await createCategory(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    const catMatch = path.match(/^\/categories\/(.+)$/);
    if (catMatch) {
      const catId = catMatch[1];
      if (request.method === 'PUT') {
        const res = await updateCategory(request, env, userId, catId);
        for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
        return res;
      }
      if (request.method === 'DELETE') {
        const res = await deleteCategory(request, env, userId, catId);
        for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
        return res;
      }
    }

    // Chats
    if (path === '/chats' && request.method === 'GET') {
      const res = await listChats(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    if (path === '/chats' && request.method === 'POST') {
      const res = await createChat(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    const chatMatch = path.match(/^\/chats\/(.+)$/);
    if (chatMatch) {
      const chatId = chatMatch[1];
      if (request.method === 'PUT') {
        const res = await updateChat(request, env, userId, chatId);
        for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
        return res;
      }
      if (request.method === 'DELETE') {
        const res = await deleteChat(request, env, userId, chatId);
        for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
        return res;
      }
    }

    // Messages
    if (path === '/messages' && request.method === 'GET') {
      const res = await listMessages(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    if (path === '/messages' && request.method === 'POST') {
      const res = await createMessage(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    const msgMatch = path.match(/^\/messages\/(.+)$/);
    if (msgMatch) {
      const msgId = msgMatch[1];
      if (request.method === 'PATCH') {
        const res = await updateMessage(request, env, userId, msgId);
        for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
        return res;
      }
    }

    // LLM Chat
    if (path === '/llm-chat' && request.method === 'POST') {
      const res = await handleLLMChat(request, env);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }

    // Image Upload
    if (path === '/upload' && request.method === 'POST') {
      const res = await handleUpload(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }

    // Image Generation
    if (path === '/generate-image' && request.method === 'POST') {
      const res = await handleGenerateImage(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }

    // Chat Sharing
    if (path === '/share' && request.method === 'POST') {
      const res = await handleCreateShare(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    if (path === '/shares' && request.method === 'GET') {
      const res = await handleListShares(request, env, userId);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }
    const shareMatch = path.match(/^\/share\/(.+)$/);
    if (shareMatch) {
      const shareId = shareMatch[1];
      if (request.method === 'DELETE') {
        const res = await handleRevokeShare(request, env, userId, shareId);
        for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
        return res;
      }
    }

    // Web Search
    if (path === '/web-search' && request.method === 'POST') {
      const res = await handleWebSearch(request, env);
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      return res;
    }

    return error('Not found', 404);
  } catch (e) {
    if (e instanceof Error && (e.message === 'Missing token' || e.message === 'Invalid token' || e.message === 'Invalid signature' || e.message === 'Token expired')) {
      return error('Unauthorized', 401);
    }
    console.error(e);
    return error(e instanceof Error ? e.message : 'Internal error', 500);
  }
};

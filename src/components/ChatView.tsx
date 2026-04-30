import { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, Sparkles, Loader2, Hash, Copy, Check } from 'lucide-react';
import { Chat, Message, Category, MODELS, messages, chats, llm } from '../lib/api';
import { marked } from 'marked';

interface Props {
  chat: Chat | null;
  category: Category | null;
  onRefresh: () => void;
  updateChatLocally: (chatId: string, updates: Partial<Chat>) => void;
}

export default function ChatView({ chat, category, onRefresh, updateChatLocally }: Props) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldScrollRef = useRef(false);

  useEffect(() => {
    if (!chat) {
      setMsgs([]);
      return;
    }
    setSending(false);
    setError(null);
    shouldScrollRef.current = true;
    let cancelled = false;
    messages.list(chat.id).then((data) => {
      if (!cancelled) setMsgs(data);
    });
    return () => { cancelled = true; };
  }, [chat]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (shouldScrollRef.current) {
      shouldScrollRef.current = false;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      return;
    }
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60;
    if (atBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs]);

  async function changeModel(model: string) {
    if (!chat) return;
    updateChatLocally(chat.id, { model });
    await chats.update(chat.id, { model });
  }

  function handleMsgEnter(id: string) {
    if (leaveTimeoutRef.current) { clearTimeout(leaveTimeoutRef.current); leaveTimeoutRef.current = null; }
    setHoveredId(id);
  }

  function handleMsgLeave() {
    leaveTimeoutRef.current = setTimeout(() => setHoveredId(null), 300);
  }

  function handleBtnEnter() {
    if (leaveTimeoutRef.current) { clearTimeout(leaveTimeoutRef.current); leaveTimeoutRef.current = null; }
  }

  function handleBtnLeave() {
    setHoveredId(null);
  }

  async function copyFloating() {
    if (!hoveredId) return;
    const msg = msgs.find((m) => m.id === hoveredId);
    if (!msg) return;
    await navigator.clipboard.writeText(msg.content);
    setCopiedId(hoveredId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function startRename() {
    if (!chat) return;
    setTitleDraft(chat.title);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  }

  async function commitRename() {
    if (!chat || !titleDraft.trim()) {
      setEditingTitle(false);
      return;
    }
    const newTitle = titleDraft.trim();
    updateChatLocally(chat.id, { title: newTitle });
    setEditingTitle(false);
    await chats.update(chat.id, { title: newTitle });
  }

  function cancelRename() {
    setEditingTitle(false);
  }

  async function sendMessage() {
    if (!chat || !input.trim() || sending) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    setError(null);
    shouldScrollRef.current = true;

    try {
      const userMsg = await messages.create({ chat_id: chat.id, role: 'user', content });
      setMsgs((prev) => [...prev, userMsg]);

      if (msgs.length === 0) {
        const title = content.length > 50 ? content.slice(0, 50) + '...' : content;
        await chats.update(chat.id, { title });
      }

      const conversation = [...msgs, { role: 'user', content } as Message].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await llm.chat(chat.model, conversation);
      const aiMsg = await messages.create({
        chat_id: chat.id,
        role: 'assistant',
        content: res.content,
        model: chat.model,
      });
      setMsgs((prev) => [...prev, aiMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response');
    } finally {
      setSending(false);
    }
  }

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500/20 to-emerald-500/20 border border-slate-800 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-sky-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Start a conversation</h2>
          <p className="text-slate-400 text-sm">
            Create a new chat or select one from the sidebar. Organize chats into categories and switch between AI models per conversation.
          </p>
        </div>
      </div>
    );
  }

  const currentModel = MODELS.find((m) => m.id === chat.model);

  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-w-0">
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-5 bg-slate-900/40 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <Hash className="w-4 h-4 text-slate-500 flex-shrink-0" />
          {editingTitle && chat ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') cancelRename();
              }}
              className="bg-slate-800 border border-sky-500/50 text-white text-sm font-semibold px-2 py-0.5 rounded outline-none min-w-0"
            />
          ) : (
            <span
              onClick={startRename}
              className="font-semibold text-white truncate cursor-pointer hover:text-sky-300 transition-colors"
              title="Click to rename"
            >
              {chat.title}
            </span>
          )}
          {category && (
            <span
              className="text-xs px-2 py-0.5 rounded-full border"
              style={{
                color: category.color,
                borderColor: category.color + '40',
                background: category.color + '10',
              }}
            >
              {category.name}
            </span>
          )}
        </div>
        <select
          value={chat.model}
          onChange={(e) => changeModel(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.provider} — {m.label}
            </option>
          ))}
        </select>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {msgs.length === 0 && (
          <div className="max-w-2xl mx-auto mt-12 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400 mb-4">
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
              {currentModel?.provider} · {currentModel?.label}
            </div>
            <h3 className="text-2xl font-semibold text-white mb-2">How can I help you today?</h3>
            <p className="text-slate-400 text-sm">Ask anything, or try switching models for different perspectives.</p>
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-6">
          {msgs.map((m) => (
            <MessageBubble key={m.id} message={m} onHover={handleMsgEnter} onLeave={handleMsgLeave} />
          ))}
          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="flex items-center gap-2 text-slate-400 text-sm pt-1.5">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking...
              </div>
            </div>
          )}
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </div>

      {hoveredId && (
        <button
          onClick={copyFloating}
          onMouseEnter={handleBtnEnter}
          onMouseLeave={handleBtnLeave}
          style={{ position: 'fixed', right: 'calc(50% - 368px)', top: '50%', transform: 'translateY(-50%)', zIndex: 50 }}
          className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-700/50 bg-slate-800/80 backdrop-blur shadow-lg"
          title="Copy"
        >
          {copiedId === hoveredId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      )}

      <div className="p-4 border-t border-slate-800 bg-slate-900/40">
        <div className="max-w-3xl mx-auto">
          <div className="relative bg-slate-900 border border-slate-800 rounded-2xl focus-within:border-sky-500/50 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={1}
              placeholder={`Message ${currentModel?.label}...`}
              className="w-full bg-transparent text-white placeholder-slate-500 px-4 py-3 pr-12 resize-none focus:outline-none max-h-40"
              style={{ minHeight: '48px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="absolute right-2 bottom-2 w-8 h-8 rounded-lg bg-gradient-to-r from-sky-500 to-emerald-500 text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center hover:scale-105 transition-transform"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-2 text-center">Shift + Enter for newline · Enter to send</p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, onHover, onLeave }: { message: Message; onHover: (id: string) => void; onLeave: () => void }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-slate-700' : 'bg-gradient-to-br from-sky-500 to-emerald-500'
        }`}
      >
        {isUser ? <User className="w-4 h-4 text-slate-200" /> : <Bot className="w-4 h-4 text-white" />}
      </div>
      <div
        className={`min-w-0 max-w-[75%] ${isUser ? 'items-end' : ''}`}
        onMouseEnter={isUser ? undefined : () => onHover(message.id)}
        onMouseLeave={isUser ? undefined : onLeave}
      >
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-sm font-semibold text-white">{isUser ? 'You' : 'Assistant'}</span>
          {message.model && !isUser && (
            <span className="text-xs text-slate-500">{message.model}</span>
          )}
          <span className="text-xs text-slate-600">
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {isUser ? (
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words bg-slate-700/60 text-slate-200 rounded-2xl rounded-br-sm px-4 py-3">
            {message.content}
          </div>
        ) : (
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words bg-slate-800/60 text-slate-200 rounded-2xl rounded-bl-sm px-4 py-3">
            <div
              className="markdown-content"
              dangerouslySetInnerHTML={{ __html: marked.parse(message.content) as string }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

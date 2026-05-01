import { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, Sparkles, Loader2, Hash, Copy, Check, CalendarDays, ImagePlus, X } from 'lucide-react';
import { Chat, Message, Category, MODELS, messages, chats, llm, upload } from '../lib/api';
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
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState('');
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldScrollRef = useRef(false);
  const prevMsgCountRef = useRef(0);

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
  }, [chat?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) { prevMsgCountRef.current = msgs.length; return; }
    if (shouldScrollRef.current) {
      shouldScrollRef.current = false;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      prevMsgCountRef.current = msgs.length;
      return;
    }
    const newMsgsArrived = msgs.length > prevMsgCountRef.current;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60;
    if (newMsgsArrived && atBottom) {
      el.scrollTop = el.scrollHeight;
    }
    prevMsgCountRef.current = msgs.length;
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

  function startEditDate() {
    if (!chat) return;
    setDateDraft(new Date(chat.created_at).toISOString().slice(0, 10));
    setEditingDate(true);
  }

  async function commitDate() {
    if (!chat || !dateDraft) {
      setEditingDate(false);
      return;
    }
    const [y, m, d] = dateDraft.split('-').map(Number);
    const iso = new Date(Date.UTC(y, m - 1, d)).toISOString();
    updateChatLocally(chat.id, { created_at: iso });
    setEditingDate(false);
    await chats.update(chat.id, { created_at: iso });
  }

  function cancelDate() {
    setEditingDate(false);
  }

  function addImages(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024);
    if (arr.length === 0) return;
    const combined = [...pendingImages, ...arr].slice(0, 4);
    setPendingImages(combined);
    setPreviewUrls(combined.map((f) => URL.createObjectURL(f)));
  }

  function removeImage(idx: number) {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
    setPreviewUrls((prev) => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const blob = items[i].getAsFile();
      if (blob && blob.type.startsWith('image/')) files.push(blob);
    }
    if (files.length > 0) {
      e.preventDefault();
      addImages(files);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) addImages(e.dataTransfer.files);
  }

  async function sendMessage() {
    if (!chat || (!input.trim() && pendingImages.length === 0) || sending) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    setError(null);
    shouldScrollRef.current = true;

    const imageUrls: string[] = [];
    if (pendingImages.length > 0) {
      const uploads = new Promise<void>((resolve) => {
        let done = 0;
        pendingImages.forEach(async (file, idx) => {
          try {
            const res = await upload.image(file);
            imageUrls[idx] = res.url;
          } catch { /* skip failed uploads */ }
          done++;
          if (done === pendingImages.length) resolve();
        });
      });
      await uploads;
      setPendingImages([]);
      setPreviewUrls([]);
    }

    try {
      const userMsg = await messages.create({ chat_id: chat.id, role: 'user', content, images: imageUrls.length > 0 ? imageUrls : undefined });
      setMsgs((prev) => [...prev, userMsg]);

      if (msgs.length === 0 && content) {
        const title = content.length > 50 ? content.slice(0, 50) + '...' : content;
        await chats.update(chat.id, { title });
      }

      if (chat.model === 'none') {
        setSending(false);
        return;
      }

      const conversation = [...msgs, userMsg].map((m) => {
        let msgImages: string[] = [];
        try { msgImages = JSON.parse(m.images || '[]'); } catch { /* ignore */ }
        return { role: m.role, content: m.content, images: msgImages.length > 0 ? msgImages : undefined };
      });

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
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500/20 to-emerald-500/20 border border-slate-200 dark:border-slate-800 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-sky-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Start a conversation</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Create a new chat or select one from the sidebar. Organize chats into categories and switch between AI models per conversation.
          </p>
        </div>
      </div>
    );
  }

  const currentModel = MODELS.find((m) => m.id === chat.model);

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 min-w-0" onDragOver={handleDragOver} onDrop={handleDrop}>
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-5 bg-slate-100/40 dark:bg-slate-900/40 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <Hash className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
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
              className="bg-slate-200 dark:bg-slate-800 border border-sky-500/50 text-slate-900 dark:text-white text-sm font-semibold px-2 py-0.5 rounded outline-none min-w-0"
            />
          ) : (
            <span
              onClick={startRename}
              className="font-semibold text-slate-900 dark:text-white truncate cursor-pointer hover:text-sky-300 transition-colors"
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
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {editingDate ? (
              <input
                type="date"
                autoFocus
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                onBlur={commitDate}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDate();
                  if (e.key === 'Escape') cancelDate();
                }}
                className="bg-slate-200 dark:bg-slate-800 border border-sky-500/50 text-slate-900 dark:text-white text-xs px-2 py-0.5 rounded outline-none"
              />
            ) : (
              <button
                onClick={startEditDate}
                className="flex items-center gap-1 hover:text-sky-300 transition-colors cursor-pointer"
                title="Change date"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span className="truncate">
                  {new Date(chat.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </button>
            )}
          </div>
        </div>
        <select
          value={chat.model}
          onChange={(e) => changeModel(e.target.value)}
          className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
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
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 mb-4">
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
              {currentModel?.provider} · {currentModel?.label}
            </div>
            <h3 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">How can I help you today?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Ask anything, or try switching models for different perspectives.</p>
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
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm pt-1.5">
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
          className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-300/50 dark:hover:bg-slate-700/50 bg-slate-200/80 dark:bg-slate-800/80 backdrop-blur shadow-lg"
          title="Copy"
        >
          {copiedId === hoveredId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      )}

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40">
        <div className="max-w-3xl mx-auto">
          {pendingImages.length > 0 && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {previewUrls.map((url, idx) => (
                <div key={idx} className="relative group">
                  <img src={url} alt="Preview" className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {chat && (chat.model === 'deepseek-chat' || chat.model === 'deepseek-reasoner') && (
                <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2 py-1">
                  DeepSeek doesn&apos;t support images — switch to GPT-4o or Claude
                </span>
              )}
            </div>
          )}
          <div className="relative bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus-within:border-sky-500/50 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={1}
              placeholder={pendingImages.length > 0 ? 'Add a caption or just send...' : `Message ${currentModel?.label}...`}
              className="w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-500 px-4 py-3 pr-20 resize-none focus:outline-none max-h-40"
              style={{ minHeight: '48px' }}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                id="image-upload"
                onChange={(e) => { if (e.target.files) { addImages(e.target.files); e.target.value = ''; } }}
              />
              <label
                htmlFor="image-upload"
                className="w-8 h-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-sky-400 dark:hover:text-sky-400 flex items-center justify-center cursor-pointer hover:bg-slate-300/40 dark:hover:bg-slate-700/40 transition-colors"
                title="Add images"
              >
                <ImagePlus className="w-4 h-4" />
              </label>
              <button
                onClick={sendMessage}
                disabled={(!input.trim() && pendingImages.length === 0) || sending}
                className="w-8 h-8 rounded-lg bg-gradient-to-r from-sky-500 to-emerald-500 text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center hover:scale-105 transition-transform"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-600 mt-2 text-center">Shift + Enter for newline · Enter to send · Paste or drag images</p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, onHover, onLeave }: { message: Message; onHover: (id: string) => void; onLeave: () => void }) {
  const isUser = message.role === 'user';
  let images: string[] = [];
  try { images = JSON.parse(message.images || '[]'); } catch { /* ignore */ }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-slate-300 dark:bg-slate-700' : 'bg-gradient-to-br from-sky-500 to-emerald-500'
        }`}
      >
        {isUser ? <User className="w-4 h-4 text-slate-700 dark:text-slate-200" /> : <Bot className="w-4 h-4 text-white" />}
      </div>
      <div
        className={`min-w-0 max-w-[75%] ${isUser ? 'items-end' : ''}`}
        onMouseEnter={isUser ? undefined : () => onHover(message.id)}
        onMouseLeave={isUser ? undefined : onLeave}
      >
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{isUser ? 'You' : 'Assistant'}</span>
          {message.model && !isUser && (
            <span className="text-xs text-slate-500 dark:text-slate-400">{message.model}</span>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-600">
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {isUser ? (
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words bg-slate-300/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 rounded-2xl rounded-br-sm px-4 py-3">
            {images.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-2">
                {images.map((url, i) => (
                  <img key={i} src={url} alt="Attached" className="max-h-60 rounded-lg object-cover" />
                ))}
              </div>
            )}
            {message.content}
          </div>
        ) : (
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words bg-slate-200/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 rounded-2xl rounded-bl-sm px-4 py-3">
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

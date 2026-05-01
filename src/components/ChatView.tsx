import { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, Sparkles, Loader2, Hash, Copy, Check, CalendarDays, ImagePlus, X, Trash2, Pencil, Share2, FileText, Globe } from 'lucide-react';
import { Chat, Message, Category, MODELS, messages, chats, llm, upload, generate, share, webSearch } from '../lib/api';
import { useMode } from '../contexts/ModeContext';
import { marked, Renderer } from 'marked';
import { extractFromFile, getSupportedTypes, getDocPreviewText, ExtractionResult } from '../lib/fileExtraction';
import ImageViewer from './ImageViewer';

marked.use({
  gfm: true,
  breaks: true,
  renderer: new class extends Renderer {
    link({ href, text }: { href: string; text: string }) {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
    image({ href, text, title }: { href: string; text: string; title: string | null }) {
      return `<img src="${href}" alt="${text}"${title ? ` title="${title}"` : ''}>`;
    }
  },
});

function linkify(text: string) {
  const regex = /(https?:\/\/[^\s<>"')\]]+)/g;
  const tokens = text.split(regex);
  return tokens.map((t, i) => {
    if (regex.test(t)) {
      return `<a href="${t}" target="_blank" rel="noopener noreferrer" class="text-sky-500 hover:underline">${t}</a>`;
    }
    return t;
  }).join('');
}

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
  const { mode } = useMode();
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
  const [genMode, setGenMode] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [pendingDocs, setPendingDocs] = useState<{ file: File; result?: ExtractionResult }[]>([]);
  const [extractingDoc, setExtractingDoc] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<string | null>(null);
  const [viewerImg, setViewerImg] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
  async function handleSearch() {
    if (!searchQuery.trim() || searchLoading) return;
    setSearchLoading(true);
    setError(null);
    try {
      const res = await webSearch.search(searchQuery.trim());
      setSearchResults(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  }

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

  async function handleShare() {
    if (!chat) return;
    setShareLoading(true);
    setShareModal(true);
    setShareUrl(null);
    setShareCopied(false);
    try {
      const res = await share.create(chat.id);
      setShareUrl(`${window.location.origin}${res.url}`);
    } catch (err) {
      setShareUrl(null);
      setError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setShareLoading(false);
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
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

  async function deleteMessage(msgId: string) {
    if (!confirm('Delete this message?')) return;
    setMsgs((prev) => prev.map((m) => m.id === msgId ? { ...m, content: '[deleted]', images: '[]' } : m));
    await messages.update(msgId, { content: '[deleted]', images: [] });
  }

  async function editMessage(msgId: string, content: string) {
    setMsgs((prev) => prev.map((m) => m.id === msgId ? { ...m, content } : m));
    await messages.update(msgId, { content });
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
    const arr = Array.from(files);
    if (arr.length === 0) return;

    const imgFiles = arr.filter((f) => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024);
    const docFiles = arr.filter((f) => !f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024);

    if (imgFiles.length > 0) {
      const combined = [...pendingImages, ...imgFiles].slice(0, 4);
      setPendingImages(combined);
      setPreviewUrls(combined.map((f) => URL.createObjectURL(f)));
    }

    if (docFiles.length > 0) {
      const combined = [...pendingDocs, ...docFiles.map((f) => ({ file: f }))].slice(0, 4);
      setPendingDocs(combined);
      setExtractingDoc(true);
      Promise.all(combined.map(async (d, i) => {
        if (d.result) return;
        try {
          const result = await extractFromFile(d.file);
          setPendingDocs((prev) => prev.map((p, j) => j === i ? { ...p, result } : p));
        } catch { /* extraction failed, will show error */ }
      })).finally(() => setExtractingDoc(false));
    }
  }

  function removeImage(idx: number) {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
    setPreviewUrls((prev) => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function removeDoc(idx: number) {
    setPendingDocs((prev) => prev.filter((_, i) => i !== idx));
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const blob = items[i].getAsFile();
      if (blob) files.push(blob);
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
    if (!chat || (!input.trim() && pendingImages.length === 0 && pendingDocs.length === 0) || sending) return;
    let content = input.trim();
    setInput('');
    setSending(true);
    setError(null);
    shouldScrollRef.current = true;

    if (searchResults) {
      content = `Search results for: "${searchQuery}"\n\n${searchResults}\n\n---\n\nUser message: ${content}`;
      setSearchResults(null);
      setSearchQuery('');
      setSearchMode(false);
    }

    let extraText = '';
    for (const doc of pendingDocs) {
      if (doc.result) {
        extraText += `\n\n[File: ${doc.file.name}]\n${doc.result.text}`;
      }
    }
    setPendingDocs([]);

    let imageUrls: string[] = [];
    if (pendingImages.length > 0) {
      const results = await Promise.all(
        pendingImages.map((file) => upload.image(file).then((r) => r.url).catch(() => null))
      );
      imageUrls = results.filter((u): u is string => u !== null);
      if (imageUrls.length !== pendingImages.length) {
        setError('Some images failed to upload. They will not be included.');
      }
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
      setPendingImages([]);
      setPreviewUrls([]);
    }

    try {
      const userMsg = await messages.create({ chat_id: chat.id, role: 'user', content: content + extraText, images: imageUrls.length > 0 ? imageUrls : undefined });
      setMsgs((prev) => [...prev, userMsg]);

      if (msgs.length === 0 && content && chat.title === 'New Chat') {
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
        ...(res.images ? { images: res.images } : {}),
      });
      setMsgs((prev) => [...prev, aiMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response');
    } finally {
      setSending(false);
    }
  }

  async function generateImageFn() {
    if (!chat || !genPrompt.trim() || genLoading) return;
    setGenLoading(true);
    setError(null);
    shouldScrollRef.current = true;
    try {
      const aiMsg = await generate.image(genPrompt.trim(), chat.id);
      const promptText = genPrompt.trim();
      setGenPrompt('');
      setGenMode(false);

      if (chat.title === 'New Chat') {
        const title = promptText.length > 50 ? promptText.slice(0, 50) + '...' : promptText;
        updateChatLocally(chat.id, { title });
        chats.update(chat.id, { title }).catch(() => {});
      }

      setMsgs((prev) => {
        const existing = prev.find((m) => m.id === aiMsg.id);
        if (existing) return prev;
        const userMsgId = crypto.randomUUID();
        const userMsg: Message = {
          id: userMsgId,
          chat_id: chat.id,
          user_id: '',
          role: 'user',
          content: promptText,
          model: null,
          images: '[]',
          created_at: new Date().toISOString(),
        };
        return [...prev, userMsg, aiMsg];
      });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed');
    } finally {
      setGenLoading(false);
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
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 min-w-0 min-h-0" onDragOver={handleDragOver} onDrop={handleDrop} onPaste={handlePaste}>
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
              {mode === 'professional' ? `${m.provider} — ${m.label}` : mode === 'intermediate' ? m.simpleLabel : m.beginnerLabel}
            </option>
          ))}
        </select>
        <button
          onClick={handleShare}
          className="w-8 h-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-sky-400 dark:hover:text-sky-400 flex items-center justify-center hover:bg-slate-300/40 dark:hover:bg-slate-700/40 transition-colors"
          title="Share chat"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {msgs.length === 0 && (
          <div className="max-w-2xl mx-auto mt-12 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 mb-4">
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
              {mode === 'professional' ? `${currentModel?.provider} · ${currentModel?.label}` : mode === 'intermediate' ? currentModel?.simpleLabel : currentModel?.beginnerLabel}
            </div>
            <h3 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
              {chat.model === 'dall-e-3' ? 'Describe an image to create' : 'How can I help you today?'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {chat.model === 'dall-e-3' ? 'Describe what you want DALL-E 3 to draw. Be specific about style, composition, and details.' : 'Ask anything, or try switching models for different perspectives.'}
            </p>
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-6">
          {msgs.map((m) => (
            <MessageBubble key={m.id} message={m} onHover={handleMsgEnter} onLeave={handleMsgLeave} onDelete={deleteMessage} onEdit={editMessage} onViewImage={(src, alt) => setViewerImg({ src, alt })} />
          ))}
          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm pt-1.5">
                <Loader2 className="w-4 h-4 animate-spin" />
                {chat.model === 'dall-e-3' ? 'Generating image...' : 'Thinking...'}
      </div>

      {shareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShareModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Share Chat</h3>
              <button onClick={() => setShareModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            {shareLoading ? (
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating share link...
              </div>
            ) : shareUrl ? (
              <>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Anyone with this link can view this conversation:</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none"
                  />
                  <button
                    onClick={copyShareUrl}
                    className="px-3 py-2 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-400 transition-colors flex items-center gap-1.5"
                  >
                    {shareCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {shareCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-600 mt-3">This link never expires. You can revoke it later from Settings.</p>
              </>
            ) : null}
          </div>
        </div>
      )}
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
          {pendingImages.length > 0 && chat.model !== 'dall-e-3' && (
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
          {pendingDocs.length > 0 && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {pendingDocs.map((doc, idx) => (
                <div key={idx} className="relative group">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                    <FileText className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                    <span className="truncate max-w-[120px]">{doc.file.name}</span>
                    {!doc.result && (
                      <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                    )}
                  </div>
                  <button
                    onClick={() => removeDoc(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {genMode && (
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                autoFocus
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); generateImageFn(); }
                  if (e.key === 'Escape') { setGenMode(false); setGenPrompt(''); }
                }}
                placeholder="Describe an image to generate..."
                className="flex-1 bg-slate-100 dark:bg-slate-900 border border-amber-500/50 text-slate-900 dark:text-white text-sm px-3 py-2 rounded-lg outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
              />
              <button
                onClick={generateImageFn}
                disabled={!genPrompt.trim() || genLoading}
                className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium disabled:opacity-40 hover:bg-amber-400 transition-colors flex items-center gap-1.5 flex-shrink-0"
              >
                {genLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Generate
              </button>
              <button
                onClick={() => { setGenMode(false); setGenPrompt(''); }}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {searchMode && (
            <div className="mb-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleSearch(); }
                    if (e.key === 'Escape') { setSearchMode(false); setSearchQuery(''); setSearchResults(null); }
                  }}
                  placeholder="Search the web..."
                  className="flex-1 bg-slate-100 dark:bg-slate-900 border border-sky-500/50 text-slate-900 dark:text-white text-sm px-3 py-2 rounded-lg outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                />
                <button
                  onClick={handleSearch}
                  disabled={!searchQuery.trim() || searchLoading}
                  className="px-3 py-2 rounded-lg bg-sky-500 text-white text-sm font-medium disabled:opacity-40 hover:bg-sky-400 transition-colors flex items-center gap-1.5 flex-shrink-0"
                >
                  {searchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                  Search
                </button>
                <button
                  onClick={() => { setSearchMode(false); setSearchQuery(''); setSearchResults(null); }}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {searchResults && (
                <div className="bg-sky-500/5 border border-sky-500/20 rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-300 max-h-32 overflow-y-auto">
                  <p className="font-medium text-sky-400 mb-1">Search results will be included with your next message</p>
                  <div className="markdown-content opacity-80" dangerouslySetInnerHTML={{ __html: marked.parse(searchResults) as string }} />
                </div>
              )}
            </div>
          )}
          <div className="relative bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus-within:border-sky-500/50 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all">
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
              placeholder={pendingImages.length > 0 ? 'Add a caption or just send...' : chat.model === 'dall-e-3' ? 'Describe the image you want...' : `Message ${currentModel?.label}...`}
              className="w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-500 px-4 py-3 pr-20 resize-none focus:outline-none max-h-40"
              style={{ minHeight: '48px' }}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              {chat.model !== 'dall-e-3' && chat.model !== 'none' && (
                <>
                  <input
                    type="file"
                    accept={`image/*,${getSupportedTypes()}`}
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
                    onClick={() => { setGenMode(!genMode); setGenPrompt(''); }}
                    className="w-8 h-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-amber-400 dark:hover:text-amber-400 flex items-center justify-center cursor-pointer hover:bg-slate-300/40 dark:hover:bg-slate-700/40 transition-colors"
                    title="Generate image"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setSearchMode(!searchMode); setSearchQuery(''); setSearchResults(null); }}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${searchMode ? 'bg-sky-500/10 text-sky-400' : 'text-slate-500 dark:text-slate-400 hover:text-sky-400 dark:hover:text-sky-400 hover:bg-slate-300/40 dark:hover:bg-slate-700/40'}`}
                    title="Search the web"
                  >
                    <Globe className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={sendMessage}
                disabled={(!input.trim() && pendingImages.length === 0 && pendingDocs.length === 0) || sending}
                className="w-8 h-8 rounded-lg bg-gradient-to-r from-sky-500 to-emerald-500 text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center hover:scale-105 transition-transform"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-600 mt-2 text-center">Shift + Enter for newline · Enter to send · Paste or drag images</p>
        </div>
      </div>

      {viewerImg && (
        <ImageViewer src={viewerImg.src} alt={viewerImg.alt} onClose={() => setViewerImg(null)} />
      )}
    </div>
  );
}

function MessageBubble({ message, onHover, onLeave, onDelete, onEdit, onViewImage }: { message: Message; onHover: (id: string) => void; onLeave: () => void; onDelete: (id: string) => void; onEdit: (id: string, content: string) => void; onViewImage: (src: string, alt: string) => void }) {
  const isUser = message.role === 'user';
  const isDeleted = message.content === '[deleted]';
  const [delHover, setDelHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
      textareaRef.current.focus();
    }
  }, [editing]);
  let images: string[] = [];
  try { images = JSON.parse(message.images || '[]'); } catch { /* ignore */ }

  if (isDeleted) {
    return (
      <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-slate-300 dark:bg-slate-700 opacity-30' : 'bg-gradient-to-br from-sky-500/30 to-emerald-500/30'}`}>
          {isUser ? <User className="w-4 h-4 text-slate-400" /> : <Bot className="w-4 h-4 text-white/30" />}
        </div>
        <div className="min-w-0 max-w-[75%]">
          <div className={`flex items-center gap-2 mb-1 ${isUser ? 'flex-row-reverse' : ''}`}>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-500">{isUser ? 'You' : 'Assistant'}</span>
            <span className="text-xs text-slate-400 dark:text-slate-600">
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className={`text-[15px] leading-relaxed italic text-slate-400 dark:text-slate-500 bg-slate-100/50 dark:bg-slate-800/30 rounded-2xl ${isUser ? 'rounded-br-sm' : 'rounded-bl-sm'} px-4 py-3 flex items-center gap-2`}>
            <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span>This message was deleted</span>
          </div>
        </div>
      </div>
    );
  }

  function startEdit() {
    setEditDraft(message.content);
    setEditing(true);
  }

  function commitEdit() {
    if (editDraft.trim() && editDraft.trim() !== message.content) {
      onEdit(message.id, editDraft.trim());
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

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
        className={`min-w-0 max-w-[90%] md:max-w-[75%] group relative ${isUser ? 'items-end' : ''} ${editing ? '!min-w-[600px]' : ''}`}
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
        {editing ? (
          <div className={`w-full min-w-[600px] rounded-2xl ${isUser ? 'rounded-br-sm' : 'rounded-bl-sm'} px-4 py-3 ${isUser ? 'bg-slate-300/60 dark:bg-slate-700/60' : 'bg-slate-200/60 dark:bg-slate-800/60'}`}>
            <textarea
              ref={textareaRef}
              autoFocus
              value={editDraft}
              onChange={(e) => { setEditDraft(e.target.value); if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'; } }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); } if (e.key === 'Escape') cancelEdit(); }}
              className="w-full bg-transparent text-slate-900 dark:text-white text-[15px] leading-relaxed resize-none focus:outline-none overflow-hidden"
            />
            <div className="flex items-center gap-2 mt-2 justify-end">
              <button onClick={cancelEdit} className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" title="Cancel">
                <X className="w-3.5 h-3.5" />
              </button>
              <button onClick={commitEdit} className="w-7 h-7 rounded flex items-center justify-center text-sky-500 hover:text-sky-400 hover:bg-sky-500/10 transition-colors" title="Save">
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : isUser ? (
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words bg-slate-300/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 rounded-2xl rounded-br-sm px-4 py-3">
            {images.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-2">
                {images.map((url, i) => (
                  <img key={i} src={url} alt="Attached" className="max-h-60 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => onViewImage(url, 'Attached image')} />
                ))}
              </div>
            )}
            <div
              className="markdown-content"
              dangerouslySetInnerHTML={{ __html: linkify(message.content) }}
            />
          </div>
        ) : (
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words bg-slate-200/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 rounded-2xl rounded-bl-sm px-4 py-3">
            {images.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-2">
                {images.map((url, i) => (
                  <img key={i} src={url} alt="Generated" className="max-h-80 rounded-lg object-cover w-full cursor-pointer hover:opacity-90 transition-opacity" onClick={() => onViewImage(url, 'AI generated image')} />
                ))}
              </div>
            )}
            <div
              className="markdown-content"
              dangerouslySetInnerHTML={{ __html: marked.parse(linkify(message.content)) as string }}
            />
          </div>
        )}
        {!editing && (
          <div className="absolute -bottom-1 -right-14 flex gap-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity">
            <button
              onClick={startEdit}
              className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-sky-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Edit message"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onMouseEnter={() => setDelHover(true)}
              onMouseLeave={() => setDelHover(false)}
              onClick={() => onDelete(message.id)}
              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${delHover ? 'bg-red-500/90 text-white' : 'text-slate-400 hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              title="Delete message"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Bot, User, Hash, Sparkles } from 'lucide-react';
import { share, Message } from '../lib/api';
import { marked, Renderer } from 'marked';

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
  return tokens.map((t) => tokens.indexOf(t) % 2 === 1
    ? `<a href="${t}" target="_blank" rel="noopener noreferrer" class="text-sky-500 hover:underline">${t}</a>`
    : t
  ).join('');
}

export default function SharedChatView({ token }: { token: string }) {
  const [chat, setChat] = useState<{ id: string; title: string; model: string; created_at: string } | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    share.get(token)
      .then((data) => {
        setChat(data.chat);
        setMsgs(data.messages);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shared chat'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-slate-400 dark:text-slate-500 text-sm">Loading shared chat...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-dvh flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Hash className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Not found</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!chat) return null;

  return (
    <div className="h-dvh flex flex-col bg-white dark:bg-slate-950">
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-5 bg-slate-100/40 dark:bg-slate-900/40 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <Hash className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-white truncate">{chat.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Sparkles className="w-3.5 h-3.5 text-sky-400" />
          <span>Shared via Nexus</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {msgs.map((m) => {
            const isUser = m.role === 'user';
            const isDeleted = m.content === '[deleted]';
            let images: string[] = [];
            try { images = JSON.parse(m.images || '[]'); } catch { /* ignore */ }

            if (isDeleted) {
              return (
                <div key={m.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-slate-300 dark:bg-slate-700 opacity-30' : 'bg-gradient-to-br from-sky-500/30 to-emerald-500/30'}`}>
                    {isUser ? <User className="w-4 h-4 text-slate-400" /> : <Bot className="w-4 h-4 text-white/30" />}
                  </div>
                  <div className="min-w-0 max-w-[75%]">
                    <div className={`flex items-center gap-2 mb-1 ${isUser ? 'flex-row-reverse' : ''}`}>
                      <span className="text-sm font-semibold text-slate-500 dark:text-slate-500">{isUser ? 'You' : 'Assistant'}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-600">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className={`text-[15px] leading-relaxed italic text-slate-400 dark:text-slate-500 bg-slate-100/50 dark:bg-slate-800/30 rounded-2xl ${isUser ? 'rounded-br-sm' : 'rounded-bl-sm'} px-4 py-3`}>
                      This message was deleted
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-slate-300 dark:bg-slate-700' : 'bg-gradient-to-br from-sky-500 to-emerald-500'}`}>
                  {isUser ? <User className="w-4 h-4 text-slate-700 dark:text-slate-200" /> : <Bot className="w-4 h-4 text-white" />}
                </div>
                <div className="min-w-0 max-w-[75%]">
                  <div className={`flex items-center gap-2 mb-1 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{isUser ? 'You' : 'Assistant'}</span>
                    {m.model && !isUser && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">{m.model}</span>
                    )}
                    <span className="text-xs text-slate-400 dark:text-slate-600">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${isUser ? 'bg-slate-300/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 rounded-2xl rounded-br-sm' : 'bg-slate-200/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 rounded-2xl rounded-bl-sm'} px-4 py-3`}>
                    {images.length > 0 && (
                      <div className="flex flex-col gap-1.5 mb-2">
                        {images.map((url, i) => (
                          <img key={i} src={url} alt="Generated" className="max-h-80 rounded-lg object-cover w-full" />
                        ))}
                      </div>
                    )}
                    <div
                      className="markdown-content"
                      dangerouslySetInnerHTML={{ __html: isUser ? linkify(m.content) : (marked.parse(linkify(m.content)) as string) }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40 text-center">
        <p className="text-xs text-slate-400 dark:text-slate-600">
          This is a read-only shared conversation from Nexus
        </p>
      </div>
    </div>
  );
}

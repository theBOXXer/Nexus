import { useState } from 'react';
import { Folder, FolderOpen, MessageSquare, Inbox } from 'lucide-react';
import { Chat, Category, supabase } from '../lib/supabase';

interface Props {
  chats: Chat[];
  categories: Category[];
  onSelectChat: (id: string) => void;
}

export default function FolderView({ chats, categories, onSelectChat }: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);

  function onDragStart(e: React.DragEvent, chatId: string) {
    e.dataTransfer.setData('chatId', chatId);
    e.dataTransfer.effectAllowed = 'move';
  }

  async function onDrop(e: React.DragEvent, categoryId: string | null) {
    e.preventDefault();
    setDragOver(null);
    const chatId = e.dataTransfer.getData('chatId');
    if (!chatId) return;
    await supabase.from('chats').update({ category_id: categoryId }).eq('id', chatId);
  }

  const buckets: { id: string | null; name: string; color: string; chats: Chat[]; icon: typeof Folder }[] = [
    {
      id: null,
      name: 'Unfiled',
      color: '#64748b',
      chats: chats.filter((c) => !c.category_id),
      icon: Inbox,
    },
    ...categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      color: cat.color,
      chats: chats.filter((c) => c.category_id === cat.id),
      icon: Folder,
    })),
  ];

  return (
    <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-5 bg-slate-900/40">
        <h2 className="font-semibold text-white">Folders</h2>
        <span className="text-xs text-slate-500">Drag chats between folders to organize</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-7xl mx-auto">
          {buckets.map((b) => {
            const Icon = dragOver === (b.id || '_unfiled') ? FolderOpen : b.icon;
            const active = dragOver === (b.id || '_unfiled');
            return (
              <div
                key={b.id || '_unfiled'}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(b.id || '_unfiled');
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDrop(e, b.id)}
                className={`rounded-2xl border-2 transition-all ${
                  active
                    ? 'border-sky-500/60 bg-sky-500/5'
                    : 'border-slate-800 bg-slate-900/40'
                }`}
              >
                <div className="p-4 border-b border-slate-800/60 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: b.color + '20', color: b.color }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold truncate">{b.name}</div>
                    <div className="text-xs text-slate-500">{b.chats.length} {b.chats.length === 1 ? 'chat' : 'chats'}</div>
                  </div>
                </div>
                <div className="p-3 space-y-1.5 min-h-[100px]">
                  {b.chats.length === 0 && (
                    <div className="text-center text-xs text-slate-600 py-6 italic">
                      Drop chats here
                    </div>
                  )}
                  {b.chats.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, c.id)}
                      onClick={() => onSelectChat(c.id)}
                      className="group flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/70 cursor-grab active:cursor-grabbing transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 truncate">{c.title}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {new Date(c.updated_at).toLocaleDateString()} · {c.model}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

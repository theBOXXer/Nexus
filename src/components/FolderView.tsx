import { useState } from 'react';
import { Folder, FolderOpen, MessageSquare, Inbox, GripVertical } from 'lucide-react';
import { Chat, Category, chats, categories } from '../lib/api';

interface Props {
  chats: Chat[];
  categories: Category[];
  onSelectChat: (id: string) => void;
  onRefresh: () => void;
  updateChatLocally: (chatId: string, updates: Partial<Chat>) => void;
}

export default function FolderView({ chats, categories: catsList, onSelectChat, onRefresh, updateChatLocally }: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const [catDragIdx, setCatDragIdx] = useState<number | null>(null);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  function onDragStartChat(e: React.DragEvent, chatId: string) {
    e.dataTransfer.setData('text/plain', chatId);
    e.dataTransfer.effectAllowed = 'move';
  }

  async function onDropChat(e: React.DragEvent, categoryId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const chatId = e.dataTransfer.getData('text/plain');
    if (!chatId) return;
    updateChatLocally(chatId, { category_id: categoryId });
    await chats.update(chatId, { category_id: categoryId });
    onRefresh();
  }

  function onDragStartCat(e: React.DragEvent, idx: number, catId: string) {
    e.dataTransfer.setData('text/category', catId);
    e.dataTransfer.effectAllowed = 'move';
    setCatDragIdx(idx);
  }

  async function onDropCat(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCat(null);
    setCatDragIdx(null);
    const catId = e.dataTransfer.getData('text/category');
    if (!catId) return;
    await categories.update(catId, { position: targetIdx });
    onRefresh();
  }

  async function renameCat(id: string) {
    if (!editName.trim()) { setEditingCat(null); return; }
    await categories.update(id, { name: editName.trim() });
    setEditingCat(null);
    onRefresh();
  }

  function startRename(id: string, name: string) {
    setEditingCat(id);
    setEditName(name);
  }

  const buckets: { id: string | null; name: string; color: string; chats: Chat[]; icon: typeof Folder }[] = [
    {
      id: null,
      name: 'Unfiled',
      color: '#64748b',
      chats: chats.filter((c) => !c.category_id),
      icon: Inbox,
    },
    ...catsList.map((cat) => ({
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
        <span className="text-xs text-slate-500">Drag chats between folders · Drag categories to reorder</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-7xl mx-auto">
          {buckets.map((b, idx) => {
            const bucketId = b.id || '_unfiled';
            const Icon = dragOver === bucketId ? FolderOpen : b.icon;
            const active = dragOver === bucketId;
            const catActive = dragOverCat === b.id;
            return (
              <div
                key={bucketId}
                onDragOver={(e) => { e.preventDefault(); setDragOver(bucketId); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDropChat(e, b.id)}
                className={`rounded-2xl border-2 transition-all ${
                  active ? 'border-sky-500/60 bg-sky-500/5' : 'border-slate-800 bg-slate-900/40'
                }`}
              >
                <div
                  draggable={!!b.id}
                  onDragStart={b.id ? (e) => onDragStartCat(e, idx, b.id) : undefined}
                  onDragOver={b.id ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOverCat(b.id); } : undefined}
                  onDragLeave={b.id ? () => setDragOverCat(null) : undefined}
                  onDrop={b.id ? (e) => onDropCat(e, idx) : undefined}
                  className={`p-4 border-b border-slate-800/60 flex items-center gap-3 transition-colors ${
                    catActive ? 'bg-emerald-500/10' : ''
                  } ${b.id ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  {b.id && <GripVertical className="w-4 h-4 text-slate-600 flex-shrink-0" />}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: b.color + '20', color: b.color }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {b.id && editingCat === b.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => renameCat(b.id!)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameCat(b.id!);
                          if (e.key === 'Escape') setEditingCat(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-slate-800 text-white text-sm font-semibold px-1 rounded outline-none w-full"
                      />
                    ) : (
                      <div
                        onClick={b.id ? (e) => { e.stopPropagation(); startRename(b.id!, b.name); } : undefined}
                        className={`text-white font-semibold truncate ${b.id ? 'cursor-pointer hover:text-sky-300 transition-colors' : ''}`}
                        title={b.id ? 'Click to rename' : undefined}
                      >
                        {b.name}
                      </div>
                    )}
                    <div className="text-xs text-slate-500">{b.chats.length} {b.chats.length === 1 ? 'chat' : 'chats'}</div>
                  </div>
                  {b.id && catDragIdx !== null && (
                    <div className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${catActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                      {catActive ? 'Release to reorder' : 'Drop zone'}
                    </div>
                  )}
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
                      onDragStart={(e) => onDragStartChat(e, c.id)}
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

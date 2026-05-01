import { useState, useEffect, useRef } from 'react';
import { Folder, FolderOpen, MessageSquare, Inbox, GripVertical, Archive, FolderTree } from 'lucide-react';
import { Chat, Category, CATEGORY_COLORS, chats, categories } from '../lib/api';

interface Props {
  chats: Chat[];
  categories: Category[];
  onSelectChat: (id: string) => void;
  onRefresh: () => void;
  updateChatLocally: (chatId: string, updates: Partial<Chat>) => void;
}

type SubTab = 'folders' | 'unfiled';

export default function FolderView({ chats: allChats, categories: catsList, onSelectChat, onRefresh, updateChatLocally }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('folders');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const [catDragIdx, setCatDragIdx] = useState<number | null>(null);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [colorPickerCat, setColorPickerCat] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const unfiledChats = allChats.filter((c) => !c.category_id);

  useEffect(() => {
    if (!colorPickerCat) return;
    function onClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setColorPickerCat(null);
      }
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [colorPickerCat]);

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

    const srcIdx = catsList.findIndex((c) => c.id === catId);
    if (srcIdx === -1 || srcIdx === targetIdx) return;

    const reordered = [...catsList];
    const [moved] = reordered.splice(srcIdx, 1);
    const insertAt = targetIdx;
    reordered.splice(insertAt, 0, moved);

    await Promise.all(reordered.map((cat, i) => categories.update(cat.id, { position: i })));
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

  async function changeColor(id: string, color: string) {
    await categories.update(id, { color });
    setColorPickerCat(null);
    onRefresh();
  }

  const buckets: { id: string; name: string; color: string; chats: Chat[]; icon: typeof Folder }[] = catsList.map((cat) => ({
    id: cat.id,
    name: cat.name,
    color: cat.color,
    chats: allChats.filter((c) => c.category_id === cat.id),
    icon: Folder,
  }));

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 overflow-hidden">
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-5 bg-slate-100/40 dark:bg-slate-900/40">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSubTab('folders')}
            className={`flex items-center gap-2 px-4 h-10 text-sm font-medium transition-all border-b-2 -mb-px ${
              subTab === 'folders'
                ? 'border-sky-500 text-slate-900 dark:text-white'
                : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            Folders
          </button>
          <button
            onClick={() => setSubTab('unfiled')}
            className={`flex items-center gap-2 px-4 h-10 text-sm font-medium transition-all border-b-2 -mb-px ${
              subTab === 'unfiled'
                ? 'border-sky-500 text-slate-900 dark:text-white'
                : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Archive className="w-4 h-4" />
            Unfiled
            {unfiledChats.length > 0 && (
              <span className="text-xs bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">{unfiledChats.length}</span>
            )}
          </button>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">Drag chats between folders · Drag categories to reorder</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {subTab === 'folders' ? (
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
                  active ? 'border-sky-500/60 bg-sky-500/5' : 'border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40'
                }`}
              >
                <div
                  draggable={!!b.id}
                  onDragStart={b.id ? (e) => onDragStartCat(e, idx, b.id) : undefined}
                  onDragOver={b.id ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOverCat(b.id); } : undefined}
                  onDragLeave={b.id ? () => setDragOverCat(null) : undefined}
                  onDrop={b.id ? (e) => onDropCat(e, idx) : undefined}
                  className={`p-4 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center gap-3 transition-colors ${
                    catActive ? 'bg-emerald-500/10' : ''
                  } ${b.id ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  {b.id && <GripVertical className="w-4 h-4 text-slate-400 dark:text-slate-600 flex-shrink-0" />}
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
                        className="bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold px-1 rounded outline-none w-full"
                      />
                    ) : (
                      <div
                        onClick={b.id ? (e) => { e.stopPropagation(); startRename(b.id!, b.name); } : undefined}
                        className={`text-slate-900 dark:text-white font-semibold truncate ${b.id ? 'cursor-pointer hover:text-sky-300 transition-colors' : ''}`}
                        title={b.id ? 'Click to rename' : undefined}
                      >
                        {b.name}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="text-xs text-slate-400 dark:text-slate-500">{b.chats.length} {b.chats.length === 1 ? 'chat' : 'chats'}</div>
                      {b.id && (
                        <div ref={colorPickerCat === b.id ? pickerRef : undefined} className="relative">
                          <button
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setColorPickerCat(colorPickerCat === b.id ? null : b.id); }}
                            className="w-5 h-5 rounded-full border transition-transform hover:scale-110 flex-shrink-0"
                            style={{ background: b.color, borderColor: b.color }}
                            title="Change color"
                          />
                          {colorPickerCat === b.id && (
                            <div className="absolute top-full left-0 mt-2 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 shadow-2xl z-50 flex flex-wrap gap-1.5 w-[152px]">
                              {CATEGORY_COLORS.map(c => (
                                <button
                                  key={c}
                                  onClick={(e) => { e.stopPropagation(); changeColor(b.id!, c); }}
                                  className={`w-6 h-6 rounded-lg border transition-transform hover:scale-110 ${c === b.color ? 'border-white ring-1 ring-white/70' : 'border-transparent'}`}
                                  style={{ background: c }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {b.id && catDragIdx !== null && (
                    <div className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${catActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                      {catActive ? 'Release to reorder' : 'Drop zone'}
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-1.5 min-h-[100px]">
                  {b.chats.length === 0 && (
                    <div className="text-center text-xs text-slate-400 dark:text-slate-600 py-6 italic">
                      Drop chats here
                    </div>
                  )}
                  {b.chats.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => onDragStartChat(e, c.id)}
                      onClick={() => onSelectChat(c.id)}
                      className="group flex items-center gap-2 p-2.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-800/70 cursor-grab active:cursor-grabbing transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-700 dark:text-slate-200 truncate">{c.title}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
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
        ) : (
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <Archive className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Unfiled Chats</h3>
            <span className="text-xs text-slate-400 dark:text-slate-500">({unfiledChats.length})</span>
          </div>
          {unfiledChats.length === 0 ? (
            <div className="text-center text-sm text-slate-400 dark:text-slate-500 py-12 italic">
              <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />
              No unfiled chats — all chats are in folders
            </div>
          ) : (
            <div className="space-y-1.5">
              {unfiledChats.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onSelectChat(c.id)}
                  className="group flex items-center gap-3 p-3 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-800/70 cursor-pointer transition-colors"
                >
                  <MessageSquare className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-700 dark:text-slate-200 truncate">{c.title}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      {new Date(c.updated_at).toLocaleDateString()} · {c.model}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

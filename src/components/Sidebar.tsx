import { useState, useRef } from 'react';
import { ChevronDown, ChevronRight, Plus, MessageSquare, Folder, Archive, Pencil, Trash2, LogOut } from 'lucide-react';
import { Category, Chat, categories, chats, CATEGORY_COLORS } from '../lib/api';

interface Props {
  categories: Category[];
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: (categoryId: string | null) => void;
  userEmail: string;
  onSignOut: () => void;
  onRefresh: () => void;
  updateChatLocally: (chatId: string, updates: Partial<Chat>) => void;
}

export default function Sidebar({
  categories: cats,
  chats: allChats,
  activeChatId,
  onSelectChat,
  onNewChat,
  userEmail,
  onSignOut,
  onRefresh,
  updateChatLocally,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [dropInsertIdx, setDropInsertIdx] = useState<number | null>(null);
  const dropInsertIdxRef = useRef<number | null>(null);

  function setInsertIdx(v: number | null) {
    dropInsertIdxRef.current = v;
    setDropInsertIdx(v);
  }

  const uncategorized = allChats.filter((c) => !c.category_id);

  async function addCategory() {
    const color = CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
    await categories.create();
  }

  async function deleteCategory(id: string) {
    await categories.remove(id);
  }

  async function renameCategory(id: string) {
    if (!editName.trim()) return;
    await categories.update(id, { name: editName.trim() });
    setEditing(null);
  }

  async function archiveChat(id: string) {
    updateChatLocally(id, { archived: true });
    await chats.update(id, { archived: true });
    onRefresh();
  }

  function handleDragStart(e: React.DragEvent, chatId: string) {
    e.dataTransfer.setData('text/plain', chatId);
    e.dataTransfer.effectAllowed = 'move';
  }

  async function handleDrop(e: React.DragEvent, categoryId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const chatId = e.dataTransfer.getData('text/plain');
    if (!chatId) return;
    updateChatLocally(chatId, { category_id: categoryId });
    await chats.update(chatId, { category_id: categoryId });
    onRefresh();
  }

  function handleDragStartCat(e: React.DragEvent, idx: number, catId: string) {
    e.dataTransfer.setData('text/category', catId);
    e.dataTransfer.effectAllowed = 'move';
    setDragSrcIdx(idx);
    setInsertIdx(null);
  }

  function handleDragEndCat() {
    setDragSrcIdx(null);
    setInsertIdx(null);
  }

  async function handleDropCat(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const catId = e.dataTransfer.getData('text/category');
    const targetIdx = dropInsertIdxRef.current;
    if (!catId || targetIdx === null) return;

    const srcIdx = cats.findIndex((c) => c.id === catId);
    if (srcIdx === -1) return;
    if (srcIdx === targetIdx || srcIdx === targetIdx - 1) return;

    const reordered = [...cats];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(targetIdx > srcIdx ? targetIdx - 1 : targetIdx, 0, moved);

    await Promise.all(reordered.map((c, i) => categories.update(c.id, { position: i })));
    setDragSrcIdx(null);
    setInsertIdx(null);
    onRefresh();
  }

  function toggleCollapse(id: string) {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  }

  function renderChatItem(chat: Chat) {
    const active = chat.id === activeChatId;
    return (
      <div
        key={chat.id}
        draggable
        onDragStart={(e) => handleDragStart(e, chat.id)}
        onClick={() => onSelectChat(chat.id)}
        className={`group flex items-center gap-2 px-3 py-2 ml-2 rounded-md cursor-pointer text-sm transition-colors ${
          active
            ? 'bg-slate-300/70 dark:bg-slate-700/70 text-slate-900 dark:text-white'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
      >
        <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate flex-1">{chat.title}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            archiveChat(chat.id);
          }}
          className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-amber-400 transition-opacity"
          title="Archive"
        >
          <Archive className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full">
      <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-slate-900 dark:text-white font-semibold">Nexus</span>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2">
        <div
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={() => setDragOver('_uncat')}
          onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as HTMLElement)) setDragOver(null); }}
          onDrop={(e) => handleDrop(e, null)}
          className={`mb-2 rounded-lg transition-colors ${dragOver === '_uncat' ? 'bg-sky-500/10 ring-2 ring-sky-500/30' : ''}`}
        >
          <div className="flex items-center justify-between px-2 py-1 group">
            <div className="flex items-center gap-1 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              <button onClick={() => toggleCollapse('_uncat')}>
                {collapsed['_uncat'] ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <span>Direct Chats</span>
            </div>
            <button
              onClick={() => onNewChat(null)}
              className="opacity-0 group-hover:opacity-100 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {!collapsed['_uncat'] && uncategorized.map(renderChatItem)}
        </div>

        <div className="mt-2 mb-1 px-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Categories</span>
          <button
            onClick={addCategory}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            title="New category"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {cats.map((cat, idx) => {
          const catChats = allChats.filter((c) => c.category_id === cat.id);
          const isCollapsed = collapsed[cat.id];
          const isDragging = dragSrcIdx === idx;
          return [
            dragSrcIdx !== null && dropInsertIdx === idx && !isDragging ? (
              <div key={`ins-${idx}`} className="h-0.5 bg-sky-500 rounded-full mx-2" />
            ) : null,
            <div
              key={cat.id}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('text/category')) {
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const thr = Math.min(rect.height, 36);
                  setInsertIdx(e.clientY < rect.top + thr ? idx : idx + 1);
                  return;
                }
                e.preventDefault(); e.stopPropagation();
              }}
              onDragEnter={() => { if (dragSrcIdx !== null) return; setDragOver(cat.id); }}
              onDragLeave={(e) => {
                if (dragSrcIdx !== null) return;
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as HTMLElement)) setDragOver(null);
              }}
              onDrop={(e) => {
                if (e.dataTransfer.types.includes('text/category')) { handleDropCat(e); return; }
                handleDrop(e, cat.id);
              }}
              className={`mb-2 rounded-lg transition-colors ${isDragging ? 'opacity-40' : ''} ${dragOver === cat.id ? 'bg-sky-500/10 ring-2 ring-sky-500/30' : ''}`}
            >
              <div
                draggable
                onDragStart={(e) => handleDragStartCat(e, idx, cat.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setInsertIdx(e.clientY < rect.top + rect.height / 2 ? idx : idx + 1);
                }}
                onDrop={(e) => handleDropCat(e)}
                onDragEnd={handleDragEndCat}
                className="flex items-center justify-between px-2 py-1 group rounded-md hover:bg-slate-200/40 dark:hover:bg-slate-800/40 cursor-grab active:cursor-grabbing"
              >
                <button
                  onClick={() => toggleCollapse(cat.id)}
                  className="flex items-center gap-1.5 flex-1 min-w-0"
                >
                  {isCollapsed ? <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-400 dark:text-slate-500" />}
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                  {editing === cat.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => renameCategory(cat.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameCategory(cat.id);
                        if (e.key === 'Escape') setEditing(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-1 rounded outline-none flex-1 min-w-0"
                    />
                  ) : (
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate">{cat.name}</span>
                  )}
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onNewChat(cat.id)}
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    title="New chat"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setEditing(cat.id);
                      setEditName(cat.name);
                    }}
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteCategory(cat.id)}
                    className="text-slate-500 dark:text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {!isCollapsed && catChats.map(renderChatItem)}
              {!isCollapsed && catChats.length === 0 && (
                <div className="ml-5 text-xs text-slate-400 dark:text-slate-600 italic py-1 px-2">Drop chats here</div>
              )}
            </div>
          ];
        })}
        {dragSrcIdx !== null && dropInsertIdx === cats.length && dragSrcIdx !== cats.length - 1 && (
          <div className="h-0.5 bg-sky-500 rounded-full mx-2" />
        )}

        {cats.length === 0 && (
          <div className="px-3 py-4 text-xs text-slate-400 dark:text-slate-600 text-center">
            <Folder className="w-5 h-5 mx-auto mb-2 opacity-50" />
            Create a category to organize chats
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-200 flex-shrink-0">
          {userEmail[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-600 dark:text-slate-300 truncate">{userEmail}</div>
        </div>
        <button
          onClick={onSignOut}
          title="Sign out"
          className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

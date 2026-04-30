import { useState } from 'react';
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
}

export default function Sidebar({
  categories: cats,
  chats: allChats,
  activeChatId,
  onSelectChat,
  onNewChat,
  userEmail,
  onSignOut,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

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
    await categories.update(id, editName.trim());
    setEditing(null);
  }

  async function archiveChat(id: string) {
    await chats.update(id, { archived: true });
  }

  function handleDragStart(e: React.DragEvent, chatId: string) {
    e.dataTransfer.setData('chatId', chatId);
    e.dataTransfer.effectAllowed = 'move';
  }

  async function handleDrop(e: React.DragEvent, categoryId: string | null) {
    e.preventDefault();
    const chatId = e.dataTransfer.getData('chatId');
    if (!chatId) return;
    await chats.update(chatId, { category_id: categoryId });
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
            ? 'bg-slate-700/70 text-white'
            : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
        }`}
      >
        <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate flex-1">{chat.title}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            archiveChat(chat.id);
          }}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-amber-400 transition-opacity"
          title="Archive"
        >
          <Archive className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full">
      <div className="px-4 py-3.5 border-b border-slate-800 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-white font-semibold">Nexus</span>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, null)}
          className="mb-2"
        >
          <div className="flex items-center justify-between px-2 py-1 group">
            <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <button onClick={() => toggleCollapse('_uncat')}>
                {collapsed['_uncat'] ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <span>Direct Chats</span>
            </div>
            <button
              onClick={() => onNewChat(null)}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {!collapsed['_uncat'] && uncategorized.map(renderChatItem)}
        </div>

        <div className="mt-2 mb-1 px-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Categories</span>
          <button
            onClick={addCategory}
            className="text-slate-400 hover:text-white transition-colors"
            title="New category"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {cats.map((cat) => {
          const catChats = allChats.filter((c) => c.category_id === cat.id);
          const isCollapsed = collapsed[cat.id];
          return (
            <div
              key={cat.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, cat.id)}
              className="mb-2"
            >
              <div className="flex items-center justify-between px-2 py-1 group rounded-md hover:bg-slate-800/40">
                <button
                  onClick={() => toggleCollapse(cat.id)}
                  className="flex items-center gap-1.5 flex-1 min-w-0"
                >
                  {isCollapsed ? <ChevronRight className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
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
                      className="bg-slate-800 text-white text-sm px-1 rounded outline-none flex-1 min-w-0"
                    />
                  ) : (
                    <span className="text-sm font-medium text-slate-300 truncate">{cat.name}</span>
                  )}
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onNewChat(cat.id)}
                    className="text-slate-400 hover:text-white"
                    title="New chat"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setEditing(cat.id);
                      setEditName(cat.name);
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteCategory(cat.id)}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {!isCollapsed && catChats.map(renderChatItem)}
              {!isCollapsed && catChats.length === 0 && (
                <div className="ml-5 text-xs text-slate-600 italic py-1 px-2">Drop chats here</div>
              )}
            </div>
          );
        })}

        {cats.length === 0 && (
          <div className="px-3 py-4 text-xs text-slate-600 text-center">
            <Folder className="w-5 h-5 mx-auto mb-2 opacity-50" />
            Create a category to organize chats
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 px-3 py-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200 flex-shrink-0">
          {userEmail[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-300 truncate">{userEmail}</div>
        </div>
        <button
          onClick={onSignOut}
          title="Sign out"
          className="text-slate-400 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

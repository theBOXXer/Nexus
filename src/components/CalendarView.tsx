import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquare, Plus, X } from 'lucide-react';
import { Chat, Category, chats as chatsApi } from '../lib/api';

interface Props {
  chats: Chat[];
  categories: Category[];
  onSelectChat: (id: string) => void;
  onNewChat: (date: Date) => void;
  updateChatLocally: (chatId: string, updates: Partial<Chat>) => void;
  onRefresh: () => void;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CalendarView({ chats, categories, onSelectChat, onNewChat, updateChatLocally, onRefresh }: Props) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [dragChatId, setDragChatId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const allChats = useMemo(() => {
    return [...chats].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [chats]);

  const chatsByDay = useMemo(() => {
    const map = new Map<string, Chat[]>();
    for (const c of chats) {
      const d = new Date(c.created_at);
      const k = toKey(d);
      const arr = map.get(k) || [];
      arr.push(c);
      map.set(k, arr);
    }
    return map;
  }, [chats]);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const firstDow = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  function onMouseEnterDay(d: Date) {
    setHoveredDay(toKey(d));
  }

  function onDragStartChat(e: React.DragEvent, chatId: string) {
    e.dataTransfer.setData('text/chat', chatId);
    e.dataTransfer.effectAllowed = 'move';
    setDragChatId(chatId);
  }

  function onDragEndChat() {
    setDragChatId(null);
    setDragOverDay(null);
  }

  function onDragOverDay(e: React.DragEvent, d: Date) {
    e.preventDefault();
    setDragOverDay(toKey(d));
  }

  async function onDropChatOnDay(e: React.DragEvent, d: Date) {
    e.preventDefault();
    setDragOverDay(null);
    setDragChatId(null);
    const chatId = e.dataTransfer.getData('text/chat');
    if (!chatId) return;
    const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
    updateChatLocally(chatId, { created_at: iso });
    await chatsApi.update(chatId, { created_at: iso });
  }

  const monthLabel = month.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="flex-1 flex bg-white dark:bg-slate-950 overflow-hidden min-h-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-5 bg-slate-100/40 dark:bg-slate-900/40">
          <h2 className="font-semibold text-slate-900 dark:text-white">Calendar</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-medium text-slate-900 dark:text-white min-w-[140px] text-center">{monthLabel}</div>
            <button
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMonth(startOfMonth(new Date()))}
              className="ml-2 text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              Today
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Click a day to view its chats. Drag chats between days to reassign dates. Hover for + button.</p>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider py-2 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 select-none">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="aspect-square" />;
              const dayChats = chatsByDay.get(toKey(d)) || [];
              const isToday = sameDay(d, new Date());
              return (
                <div
                  key={i}
                  onMouseEnter={() => onMouseEnterDay(d)}
                  onMouseLeave={() => setHoveredDay(null)}
                  onDragOver={(e) => onDragOverDay(e, d)}
                  onDragLeave={() => setDragOverDay(null)}
                  onDrop={(e) => onDropChatOnDay(e, d)}
                  onClick={() => setSelectedDay(selectedDay === toKey(d) ? null : toKey(d))}
                  className={`aspect-square rounded-lg border p-2 flex flex-col cursor-pointer transition-all relative ${
                    dragOverDay === toKey(d)
                      ? 'border-emerald-500/60 bg-emerald-500/10 scale-[1.03] shadow-lg shadow-emerald-500/10'
                      : selectedDay === toKey(d)
                        ? 'border-sky-500/60 bg-sky-500/10'
                        : isToday
                          ? 'border-sky-400/70 bg-sky-500/5 shadow-[0_0_14px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/30'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-medium ${
                        isToday ? 'text-sky-400' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {dayChats.length > 0 && (
                      <span className="text-[10px] px-1.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium">
                        {dayChats.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5 overflow-hidden">
                    {dayChats.slice(0, 2).map((c) => {
                      const cat = c.category_id ? catById.get(c.category_id) : null;
                      const isDragging = dragChatId === c.id;
                      return (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={(e) => onDragStartChat(e, c.id)}
                          onDragEnd={onDragEndChat}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectChat(c.id);
                          }}
                          className={`text-[10px] truncate px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center gap-1 transition-all cursor-grab active:cursor-grabbing ${
                            isDragging ? 'opacity-30 scale-95' : ''
                          }`}
                        >
                          {cat && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />}
                          <span className="truncate">{c.title}</span>
                        </div>
                      );
                    })}
                    {dayChats.length > 2 && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 px-1.5">+{dayChats.length - 2} more</div>
                    )}
                  </div>
                  {hoveredDay === toKey(d) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewChat(d);
                      }}
                      className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-md bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 hover:text-sky-200 border border-sky-500/30 flex items-center justify-center transition-all"
                      title="New chat on this date"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40 flex flex-col">
        <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-5">
          <span className="font-semibold text-slate-900 dark:text-white text-sm">
            {selectedDay ? new Date(selectedDay).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'All Chats'}
          </span>
          {selectedDay && (
            <button onClick={() => setSelectedDay(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {(() => {
            const panelChats = selectedDay ? (chatsByDay.get(selectedDay) || []) : allChats;
            if (panelChats.length === 0) {
              return (
                <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8">
                  {selectedDay ? 'No chats on this day.' : 'Click a day to view its chats.'}
                </div>
              );
            }
            return (
              <div className="space-y-1.5">
                {panelChats.map((c) => {
                  const cat = c.category_id ? catById.get(c.category_id) : null;
                  const isDragging = dragChatId === c.id;
                  return (
                    <button
                      key={c.id}
                      draggable
                      onDragStart={(e) => onDragStartChat(e, c.id)}
                      onDragEnd={onDragEndChat}
                      onClick={() => onSelectChat(c.id)}
                      className={`w-full text-left p-3 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-all group cursor-grab active:cursor-grabbing ${
                        isDragging ? 'opacity-30 scale-95' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-900 dark:text-white font-medium truncate">{c.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            {cat && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full border"
                                style={{
                                  color: cat.color,
                                  borderColor: cat.color + '40',
                                  background: cat.color + '10',
                                }}
                              >
                                {cat.name}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {new Date(c.created_at).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

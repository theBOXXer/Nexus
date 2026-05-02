import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquare, Plus, X, ArrowLeft } from 'lucide-react';
import { Chat, Category, chats as chatsApi } from '../lib/api';

interface Props {
  chats: Chat[];
  categories: Category[];
  onSelectChat: (id: string) => void;
  onNewChat: (date: Date) => void;
  updateChatLocally: (chatId: string, updates: Partial<Chat>) => void;
  onRefresh: () => void;
  isMobile: boolean;
}

type ViewMode = 'month' | 'week';

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

function endOfWeek(d: Date) {
  const day = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (6 - day));
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CalendarView({ chats, categories, onSelectChat, onNewChat, updateChatLocally, onRefresh, isMobile }: Props) {
  const [currentDate, setCurrentDate] = useState(startOfMonth(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>('month');
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

  const firstDow = currentDate.getDay();
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weekStart = startOfWeek(currentDate);
  const weekCells: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    weekCells.push(d);
  }

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

  const dateLabel = viewMode === 'month'
    ? currentDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })
    : `${weekStart.toLocaleString(undefined, { month: 'short', day: 'numeric' })} - ${endOfWeek(currentDate).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const isCurrentMonth = currentDate.getMonth() === new Date().getMonth() && currentDate.getFullYear() === new Date().getFullYear();

  function navigatePrev() {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
    }
  }

  function navigateNext() {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
    }
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  return (
    <div className="flex-1 flex bg-white dark:bg-slate-950 overflow-hidden min-h-0">
      {isMobile && selectedDay ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 px-4 bg-slate-100/40 dark:bg-slate-900/40">
            <button
              onClick={() => setSelectedDay(null)}
              className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-900 dark:text-white text-sm">
              {new Date(selectedDay).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {(() => {
              const dayChats = chatsByDay.get(selectedDay) || [];
              if (dayChats.length === 0) {
                return <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8">No chats on this day.</div>;
              }
              return (
                <div className="space-y-1.5">
                  {dayChats.map((c) => {
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
                                  style={{ color: cat.color, borderColor: cat.color + '40', background: cat.color + '10' }}
                                >
                                  {cat.name}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                {new Date(c.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
      ) : (
        <>
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-5 bg-slate-100/40 dark:bg-slate-900/40">
              <h2 className="hidden md:block font-semibold text-slate-900 dark:text-white">Calendar</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={navigatePrev}
                  className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-sm font-medium text-slate-900 dark:text-white min-w-[140px] text-center">{dateLabel}</div>
                <button
                  onClick={navigateNext}
                  className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setViewMode('month')}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === 'month'
                        ? 'bg-sky-500 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    Month
                  </button>
                  <button
                    onClick={() => setViewMode('week')}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === 'week'
                        ? 'bg-sky-500 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    Week
                  </button>
                </div>
                <button
                  onClick={goToToday}
                  className="hidden md:inline-flex text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  Today
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {(viewMode === 'month' || !isMobile) && (
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider py-2 text-center">
                      {d}
                    </div>
                  ))}
                </div>
              )}

            {viewMode === 'month' ? (
              <div className="grid grid-cols-7 gap-1 select-none">
                {cells.map((d, i) => {
                  if (!d) return <div key={i} className="aspect-square" />;
                  const dayChats = chatsByDay.get(toKey(d)) || [];
                  const isToday = sameDay(d, new Date());
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const dominantCat = dayChats.length > 0 ? dayChats.reduce((prev, c) => {
                    const prevCat = prev?.category_id ? catById.get(prev.category_id) : null;
                    const currCat = c.category_id ? catById.get(c.category_id) : null;
                    return currCat ? c : prev;
                  }, dayChats[0])?.category_id : null;
                  const dotColor = dominantCat && catById.get(dominantCat)?.color;
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
                              : `border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 ${isWeekend ? 'opacity-60' : ''}`
                      }`}
                    >
                      {isMobile ? (
                        <div className="flex-1 flex flex-col items-center justify-center">
                          <span className={`text-base font-semibold ${isToday ? 'text-sky-500 dark:text-sky-400 font-bold' : isWeekend ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
                            {d.getDate()}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${dayChats.length > 0 ? (dotColor ? '' : 'bg-emerald-500/20 text-emerald-300') : 'bg-transparent text-transparent'}`} style={dotColor ? { backgroundColor: dotColor + '30', color: dotColor } : undefined}>
                            {dayChats.length}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-medium ${isToday ? 'text-sky-400' : isWeekend ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
                              {isToday ? 'Today' : d.getDate()}
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
                                    if (isMobile) {
                                      setSelectedDay(toKey(d));
                                    } else {
                                      onSelectChat(c.id);
                                    }
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
                        </>
                      )}
                      {!isMobile && hoveredDay === toKey(d) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onNewChat(d);
                          }}
                          className={`absolute ${isMobile ? 'bottom-1 right-1 w-5 h-5' : 'bottom-1.5 right-1.5 w-6 h-6'} rounded-md bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 hover:text-sky-200 border border-sky-500/30 flex items-center justify-center transition-all`}
                          title="New chat on this date"
                        >
                          <Plus className={isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : isMobile ? (
              <div className="flex-1 overflow-y-auto space-y-3 p-3">
                {weekCells.map((d) => {
                  const dayChats = chatsByDay.get(toKey(d)) || [];
                  const isToday = sameDay(d, new Date());
                  return (
                    <div key={toKey(d)}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-sm font-semibold ${isToday ? 'text-sky-400' : 'text-slate-600 dark:text-slate-300'}`}>
                          {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {dayChats.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium">
                            {dayChats.length}
                          </span>
                        )}
                      </div>
                      {dayChats.length > 0 ? (
                        <div className="space-y-2">
                          {dayChats.map((c) => {
                            const cat = c.category_id ? catById.get(c.category_id) : null;
                            return (
                              <button
                                key={c.id}
                                onClick={() => onSelectChat(c.id)}
                                className="w-full text-left p-3 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-all"
                              >
                                <div className="flex items-start gap-2">
                                  <MessageSquare className="w-4 h-4 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-slate-900 dark:text-white font-medium truncate">{c.title}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                      {cat && (
                                        <span
                                          className="text-[10px] px-1.5 py-0.5 rounded-full border"
                                          style={{ color: cat.color, borderColor: cat.color + '40', background: cat.color + '10' }}
                                        >
                                          {cat.name}
                                        </span>
                                      )}
                                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                        {new Date(c.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <button
                          onClick={() => onNewChat(d)}
                          className="w-full p-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-sky-400/50 hover:text-sky-400 hover:bg-sky-500/5 transition-all flex items-center justify-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="text-sm">New chat</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-2 select-none">
                {weekCells.map((d) => {
                  const dayChats = chatsByDay.get(toKey(d)) || [];
                  const isToday = sameDay(d, new Date());
                  return (
                    <div
                      key={toKey(d)}
                      onMouseEnter={() => onMouseEnterDay(d)}
                      onMouseLeave={() => setHoveredDay(null)}
                      onDragOver={(e) => onDragOverDay(e, d)}
                      onDragLeave={() => setDragOverDay(null)}
                      onDrop={(e) => onDropChatOnDay(e, d)}
                      onClick={() => setSelectedDay(selectedDay === toKey(d) ? null : toKey(d))}
                      className={`min-h-[200px] rounded-lg border p-3 flex flex-col cursor-pointer transition-all relative ${
                        dragOverDay === toKey(d)
                          ? 'border-emerald-500/60 bg-emerald-500/10'
                          : selectedDay === toKey(d)
                            ? 'border-sky-500/60 bg-sky-500/10'
                            : isToday
                              ? 'border-sky-400/70 bg-sky-500/5 shadow-[0_0_14px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/30'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-semibold ${isToday ? 'text-sky-400' : 'text-slate-600 dark:text-slate-300'}`}>
                          {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                        </span>
                        {dayChats.length > 0 && (
                          <span className="text-[10px] px-1.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium">
                            {dayChats.length}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 space-y-1.5 overflow-y-auto">
                        {dayChats.map((c) => {
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
                              className={`text-xs truncate px-2 py-1.5 rounded bg-slate-200/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-all cursor-grab active:cursor-grabbing ${
                                isDragging ? 'opacity-30 scale-95' : ''
                              }`}
                            >
                              {cat && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />}
                              <span className="truncate">{c.title}</span>
                            </div>
                          );
                        })}
                        {dayChats.length === 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNewChat(d);
                            }}
                            className="w-full py-2 rounded border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-sky-400/50 hover:text-sky-400 text-xs transition-all"
                          >
                            + Chat
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
)}
            </div>
          </div>

          <div className="hidden md:flex md:flex-col w-80 border-l border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40">
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
        </>
      )}
      {isMobile && (
        <button
          onClick={() => onNewChat(selectedDay ? new Date(selectedDay) : new Date())}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/30 flex items-center justify-center transition-all z-50"
          title="New chat"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

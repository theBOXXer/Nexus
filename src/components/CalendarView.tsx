import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquare, X } from 'lucide-react';
import { Chat, Category } from '../lib/api';

interface Props {
  chats: Chat[];
  categories: Category[];
  onSelectChat: (id: string) => void;
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

export default function CalendarView({ chats, categories, onSelectChat }: Props) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [dragging, setDragging] = useState(false);

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

  const selectedChats = useMemo(() => {
    if (!rangeStart) return [] as Chat[];
    const end = rangeEnd || rangeStart;
    const [a, b] = rangeStart <= end ? [rangeStart, end] : [end, rangeStart];
    const startDay = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    const endDay = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 23, 59, 59).getTime();
    return chats.filter((c) => {
      const t = new Date(c.created_at).getTime();
      return t >= startDay && t <= endDay;
    });
  }, [rangeStart, rangeEnd, chats]);

  function isInRange(d: Date) {
    if (!rangeStart) return false;
    const end = rangeEnd || rangeStart;
    const [a, b] = rangeStart <= end ? [rangeStart, end] : [end, rangeStart];
    return d >= new Date(a.getFullYear(), a.getMonth(), a.getDate()) &&
      d <= new Date(b.getFullYear(), b.getMonth(), b.getDate());
  }

  function onMouseDown(d: Date) {
    setRangeStart(d);
    setRangeEnd(d);
    setDragging(true);
  }
  function onMouseEnter(d: Date) {
    if (dragging) setRangeEnd(d);
  }
  function onMouseUp() {
    setDragging(false);
  }

  const monthLabel = month.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="flex-1 flex bg-slate-950 overflow-hidden" onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-14 border-b border-slate-800 flex items-center justify-between px-5 bg-slate-900/40">
          <h2 className="font-semibold text-white">Calendar</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-medium text-white min-w-[140px] text-center">{monthLabel}</div>
            <button
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMonth(startOfMonth(new Date()))}
              className="ml-2 text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Today
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <p className="text-xs text-slate-500 mb-3">Click and drag across days to select a date range and view chats created in that period.</p>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-2 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 select-none">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="aspect-square" />;
              const dayChats = chatsByDay.get(toKey(d)) || [];
              const inRange = isInRange(d);
              const isToday = sameDay(d, new Date());
              return (
                <div
                  key={i}
                  onMouseDown={() => onMouseDown(d)}
                  onMouseEnter={() => onMouseEnter(d)}
                  className={`aspect-square rounded-lg border p-2 flex flex-col cursor-pointer transition-colors ${
                    inRange
                      ? 'border-sky-500/60 bg-sky-500/10'
                      : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-medium ${
                        isToday ? 'text-sky-400' : inRange ? 'text-sky-200' : 'text-slate-300'
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
                      return (
                        <div
                          key={c.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectChat(c.id);
                          }}
                          className="text-[10px] truncate px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 hover:bg-slate-700 flex items-center gap-1"
                        >
                          {cat && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />}
                          <span className="truncate">{c.title}</span>
                        </div>
                      );
                    })}
                    {dayChats.length > 2 && (
                      <div className="text-[10px] text-slate-500 px-1.5">+{dayChats.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-80 border-l border-slate-800 bg-slate-900/40 flex flex-col">
        <div className="h-14 border-b border-slate-800 flex items-center justify-between px-5">
          <span className="font-semibold text-white text-sm">
            {rangeStart ? (
              <>
                {rangeStart.toLocaleDateString()}
                {rangeEnd && !sameDay(rangeStart, rangeEnd) && ` — ${rangeEnd.toLocaleDateString()}`}
              </>
            ) : (
              'Select a range'
            )}
          </span>
          {rangeStart && (
            <button
              onClick={() => {
                setRangeStart(null);
                setRangeEnd(null);
              }}
              className="text-slate-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {!rangeStart && (
            <div className="text-center text-xs text-slate-500 mt-8 px-4">
              Drag across calendar dates to see chats from that range.
            </div>
          )}
          {rangeStart && selectedChats.length === 0 && (
            <div className="text-center text-xs text-slate-500 mt-8">No chats in this range.</div>
          )}
          <div className="space-y-1.5">
            {selectedChats.map((c) => {
              const cat = c.category_id ? catById.get(c.category_id) : null;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectChat(c.id)}
                  className="w-full text-left p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">{c.title}</div>
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
                        <span className="text-[10px] text-slate-500">
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
        </div>
      </div>
    </div>
  );
}

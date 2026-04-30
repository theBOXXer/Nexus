import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Category, Chat, categories, chats } from '../lib/api';

const PENDING_TTL = 10_000; // 10 seconds — D1 writes are fast but polling should preserve local

export function useChatData(userId: string | null) {
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const pendingRef = useRef<Record<string, Partial<Chat> & { ts: number }>>({});

  const activeChats = useMemo(
    () => allChats.filter((c) => !c.archived),
    [allChats],
  );

  const archivedChats = useMemo(
    () => allChats.filter((c) => !!c.archived),
    [allChats],
  );

  const updateChatLocally = useCallback((chatId: string, updates: Partial<Chat>) => {
    pendingRef.current[chatId] = { ...updates, ts: Date.now() };
    setAllChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, ...updates } : c)));
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [catData, chatData] = await Promise.all([
        categories.list(),
        chats.list(),
      ]);
      setCats(catData);

      const now = Date.now();
      for (const [id, p] of Object.entries(pendingRef.current)) {
        if (now - p.ts > PENDING_TTL) {
          delete pendingRef.current[id];
        }
      }

      const merged = chatData.map((c) => {
        const p = pendingRef.current[c.id];
        return p ? { ...c, ...p } : c;
      });
      setAllChats(merged);
    } catch (e) {
      // Silently retry on next interval
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [userId, refresh]);

  return { categories: cats, chats: activeChats, archivedChats, loading, refresh, updateChatLocally };
}

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Category, Chat, categories, chats } from '../lib/api';

export function useChatData(userId: string | null) {
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const activeChats = useMemo(
    () => allChats.filter((c) => !c.archived),
    [allChats],
  );

  const archivedChats = useMemo(
    () => allChats.filter((c) => !!c.archived),
    [allChats],
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [catData, chatData] = await Promise.all([
        categories.list(),
        chats.list(),
      ]);
      setCats(catData);
      setAllChats(chatData);
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

  return { categories: cats, chats: activeChats, archivedChats, loading, refresh };
}

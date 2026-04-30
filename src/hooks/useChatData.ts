import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, Category, Chat } from '../lib/supabase';

export function useChatData(userId: string | null) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const chats = useMemo(
    () => allChats.filter((c) => c.archived !== true),
    [allChats],
  );

  const archivedChats = useMemo(
    () => allChats.filter((c) => c.archived === true),
    [allChats],
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [catRes, chatRes] = await Promise.all([
      supabase.from('categories').select('*').order('position', { ascending: true }),
      supabase.from('chats').select('*').order('updated_at', { ascending: false }),
    ]);
    if (catRes.data) setCategories(catRes.data as Category[]);
    if (chatRes.data) setAllChats(chatRes.data as Chat[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();

    const channel = supabase
      .channel('chat-data-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${userId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats', filter: `user_id=eq.${userId}` }, () => refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return { categories, chats, archivedChats, loading, refresh };
}

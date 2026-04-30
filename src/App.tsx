import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Calendar, FolderTree, Settings as SettingsIcon } from 'lucide-react';
import { auth, clearToken, setToken, chats } from './lib/api';
import { useChatData } from './hooks/useChatData';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import CalendarView from './components/CalendarView';
import FolderView from './components/FolderView';
import Settings from './components/Settings';

type Tab = 'chat' | 'calendar' | 'folders';

function App() {
  const [session, setSession] = useState<{ userId: string; email: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('chat');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const token = auth.getToken();
    if (token) {
      auth.me()
        .then((user) => setSession({ userId: user.id, email: user.email }))
        .catch(() => { clearToken(); })
        .finally(() => setAuthLoading(false));
    } else {
      setAuthLoading(false);
    }
  }, []);

  function handleAuth(userId: string, email: string) {
    setSession({ userId, email });
  }

  const { categories, chats: chatList, archivedChats, refresh, updateChatLocally } = useChatData(session?.userId ?? null);

  const activeChat = useMemo(
    () => chatList.find((c) => c.id === activeChatId) || null,
    [chatList, activeChatId],
  );
  const activeCategory = useMemo(
    () => (activeChat?.category_id ? categories.find((c) => c.id === activeChat.category_id) || null : null),
    [categories, activeChat],
  );

  useEffect(() => {
    if (!activeChatId && chatList.length > 0 && tab === 'chat') {
      setActiveChatId(chatList[0].id);
    }
    if (activeChatId && !chatList.find((c) => c.id === activeChatId)) {
      setActiveChatId(chatList[0]?.id || null);
    }
  }, [chatList, activeChatId, tab]);

  async function handleNewChat(categoryId: string | null) {
    if (!session) return;
    const chat = await chats.create({
      category_id: categoryId,
      title: 'New Chat',
      model: 'gpt-4o-mini',
    });
    setActiveChatId(chat.id);
    setTab('chat');
  }

  function handleSelectChat(id: string) {
    setActiveChatId(id);
    setTab('chat');
  }

  function handleSignOut() {
    clearToken();
    setSession(null);
    setActiveChatId(null);
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!session) return <Auth onAuth={handleAuth} />;

  const tabs: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
    { id: 'chat', label: 'Chats', icon: MessageSquare },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'folders', label: 'Folders', icon: FolderTree },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-white overflow-hidden">
      <div className="h-12 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center px-4 gap-1 flex-shrink-0">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setShowSettings(false); }}
              className={`flex items-center gap-2 px-3.5 h-8 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={() => setShowSettings((v) => !v)}
          className={`flex items-center gap-2 px-3.5 h-8 rounded-lg text-sm font-medium transition-all ${
            showSettings
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
          Settings
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          categories={categories}
          chats={chatList}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          userEmail={session.email}
          onSignOut={handleSignOut}
          onRefresh={refresh}
          updateChatLocally={updateChatLocally}
        />

        {showSettings ? (
          <Settings
            archivedChats={archivedChats}
            onClose={() => setShowSettings(false)}
            onRefresh={refresh}
          />
        ) : (
          <>
            {tab === 'chat' && <ChatView chat={activeChat} category={activeCategory} onRefresh={refresh} updateChatLocally={updateChatLocally} />}
            {tab === 'calendar' && (
              <CalendarView chats={chatList} categories={categories} onSelectChat={handleSelectChat} />
            )}
            {tab === 'folders' && (
              <FolderView chats={chatList} categories={categories} onSelectChat={handleSelectChat} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;

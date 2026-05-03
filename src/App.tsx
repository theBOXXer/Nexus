import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Calendar, FolderTree, Settings as SettingsIcon, Sun, Moon, Menu, X } from 'lucide-react';
import { auth, clearToken, setToken, chats } from './lib/api';
import { useChatData } from './hooks/useChatData';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ModeProvider } from './contexts/ModeContext';
import { ModelsProvider } from './contexts/ModelsContext';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import CalendarView from './components/CalendarView';
import FolderView from './components/FolderView';
import Settings from './components/Settings';
import SharedChatView from './components/SharedChatView';

type Tab = 'chat' | 'calendar' | 'folders';

function App() {
  const [session, setSession] = useState<{ userId: string; email: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('chat');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const shareToken = new URLSearchParams(window.location.search).get('share');

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    setShowSettings(false);
  }

  async function handleNewChatForDate(date: Date) {
    if (!session) return;
    const created_at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0).toISOString();
    const chat = await chats.create({
      title: 'New Chat',
      model: 'gpt-4o-mini',
      created_at,
    });
    setActiveChatId(chat.id);
    setTab('chat');
  }

  function handleSelectChat(id: string) {
    setActiveChatId(id);
    setTab('chat');
    setShowSettings(false);
    if (isMobile) setSidebarOpen(false);
  }

  function handleSignOut() {
    clearToken();
    setSession(null);
    setActiveChatId(null);
  }

  function ThemeToggle() {
    const { theme, toggle } = useTheme();
    return (
      <button
        onClick={toggle}
        className="flex items-center gap-2 px-3.5 h-8 rounded-lg text-sm font-medium transition-all text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 dark:text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!session) {
    if (shareToken) return <ThemeProvider><ModeProvider><SharedChatView token={shareToken} /></ModeProvider></ThemeProvider>;
    return <Auth onAuth={handleAuth} />;
  }

  const tabs: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
    { id: 'chat', label: 'Chats', icon: MessageSquare },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'folders', label: 'Folders', icon: FolderTree },
  ];

  return (
    <ModelsProvider>
      <ThemeProvider>
        <ModeProvider>
          <div className="h-dvh flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden">
      <div className="h-12 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 backdrop-blur flex items-center px-4 flex-shrink-0">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="block md:hidden p-1.5 mr-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60 flex-shrink-0"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <div className="flex items-center gap-1 flex-1 justify-center">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setShowSettings(false); }}
                className={`flex items-center gap-2 px-4 h-12 text-sm font-medium transition-all border-b-2 -mb-px ${
                  active
                    ? 'border-sky-500 text-slate-900 dark:text-white'
                    : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <div className="hidden md:flex"> <ThemeToggle /> </div>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`hidden md:flex items-center gap-2 px-3.5 h-8 rounded-lg text-sm font-medium transition-all ${
              showSettings
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
            }`}
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {isMobile && sidebarOpen && (
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSidebarOpen(false)} />
        )}
        <div
          className={`${isMobile ? (sidebarOpen ? 'w-64 fixed inset-y-0 left-0 z-50' : 'hidden') : 'w-64 flex-shrink-0'} border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 h-full overflow-y-auto`}
        >
          <Sidebar
            categories={categories}
            chats={chatList}
            activeChatId={activeChatId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            userEmail={session.email}
            onSignOut={handleSignOut}
            onSettings={() => { setShowSettings(true); if (isMobile) setSidebarOpen(false); }}
            onRefresh={refresh}
            updateChatLocally={updateChatLocally}
            isMobile={isMobile}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
        {showSettings ? (
          <Settings
            archivedChats={archivedChats}
            onClose={() => setShowSettings(false)}
            onRefresh={refresh}
          />
        ) : (
          <>
            {tab === 'chat' && <ChatView chat={activeChat} category={activeCategory} onRefresh={refresh} updateChatLocally={updateChatLocally} isMobile={isMobile} onBack={isMobile ? () => setTab('calendar') : undefined} />}
            {tab === 'calendar' && (
              <CalendarView chats={chatList} categories={categories} onSelectChat={handleSelectChat} onNewChat={handleNewChatForDate} updateChatLocally={updateChatLocally} onRefresh={refresh} isMobile={isMobile} />
            )}
            {tab === 'folders' && (
              <FolderView chats={chatList} categories={categories} onSelectChat={handleSelectChat} onRefresh={refresh} updateChatLocally={updateChatLocally} />
            )}
          </>
        )}
        </div>
      </div>
    </div>
      </ModeProvider>
    </ThemeProvider>
  </ModelsProvider>
  );
}

export default App;

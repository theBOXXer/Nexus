import { Archive, RotateCcw, Trash2, X, Zap, GraduationCap, Brain } from 'lucide-react';
import { Chat, chats } from '../lib/api';
import { useMode } from '../contexts/ModeContext';

interface Props {
  archivedChats: Chat[];
  onClose: () => void;
  onRefresh: () => void;
}

export default function Settings({ archivedChats, onClose, onRefresh }: Props) {
  const { mode, setMode } = useMode();

  async function restore(id: string) {
    await chats.update(id, { archived: false });
    onRefresh();
  }

  async function deleteForever(id: string) {
    const confirmed = window.confirm('Permanently delete this chat? This cannot be undone.');
    if (!confirmed) return;
    await chats.remove(id);
    onRefresh();
  }

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 overflow-hidden min-h-0">
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-5 bg-slate-100/40 dark:bg-slate-900/40">
        <h2 className="font-semibold text-slate-900 dark:text-white">Settings</h2>
        <button
          onClick={onClose}
          className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-sky-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Display Mode</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Beginner shows brand + stars. Intermediate shows short codes. Professional shows full names.
              </p>
            </div>
          </div>
          <div className="flex gap-2 mb-8">
            <button
              onClick={() => setMode('beginner')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'beginner'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Brain className="w-4 h-4" />
              Beginner
            </button>
            <button
              onClick={() => setMode('intermediate')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'intermediate'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Intermediate
            </button>
            <button
              onClick={() => setMode('professional')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'professional'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Zap className="w-4 h-4" />
              Professional
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Archive className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Archived Chats</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Chats you've archived. Restore them or delete permanently.
              </p>
            </div>
          </div>

          {archivedChats.length === 0 ? (
            <div className="text-center py-16">
              <Archive className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-400 dark:text-slate-500 text-sm">No archived chats</p>
              <p className="text-slate-400 dark:text-slate-600 text-xs mt-1">
                Click the archive icon on any chat in the sidebar to move it here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {archivedChats.map((chat) => (
                <div
                  key={chat.id}
                  className="flex items-center gap-3 p-4 rounded-xl bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <Archive className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      {chat.title}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      Archived · {chat.model} ·{' '}
                      {new Date(chat.updated_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => restore(chat.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                      title="Restore chat"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restore
                    </button>
                    <button
                      onClick={() => deleteForever(chat.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { X, Search, Plus, Check, Zap } from 'lucide-react';
import { useModels } from '../contexts/ModelsContext';

interface Model {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

interface Props {
  onClose: () => void;
  onSelectModel: (modelId: string) => void;
}

export default function BrowseFreeModels({ onClose, onSelectModel }: Props) {
  const { customModels, addCustomModel } = useModels();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('https://openrouter.ai/api/v1/models')
      .then(res => res.json())
      .then(data => {
        const free = data.data.filter((m: Model) => 
          m.pricing.prompt === '0' && m.pricing.completion === '0'
        );
        setModels(free);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filtered = models.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.id.toLowerCase().includes(search.toLowerCase())
  );

  function handleAdd(m: Model) {
    addCustomModel({
      id: m.id,
      label: m.name,
      provider: m.id.split('/')[0] || 'OpenRouter',
      simpleLabel: m.name.split(' ').map(w => w[0]).join('').slice(0, 10) + ' $',
      beginnerLabel: '★ Free',
    });
    onSelectModel(m.id);
  }

  function handleUse(m: Model) {
    onSelectModel(m.id);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Browse Free Models</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-sky-500 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-8 text-slate-500">Loading free models...</div>
          )}
          {error && (
            <div className="text-center py-8 text-red-500">Error: {error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-8 text-slate-500">No free models found.</div>
          )}
          {!loading && !error && filtered.map(m => {
            const added = customModels.find(cm => cm.id === m.id);
            return (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{m.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.id}</div>
                  <div className="text-xs text-slate-400 mt-1">Context: {m.context_length?.toLocaleString()} tokens</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUse(m)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-sm hover:bg-emerald-600 transition-colors"
                  >
                    Use
                  </button>
                  {added ? (
                    <span className="text-emerald-500 text-sm font-medium flex items-center gap-1">
                      <Check className="w-4 h-4" />
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAdd(m)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm hover:bg-sky-600 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
          {filtered.length} free model{filtered.length !== 1 ? 's' : ''} available
        </div>
      </div>
    </div>
  );
}

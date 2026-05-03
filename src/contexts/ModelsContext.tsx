import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CustomModel {
  id: string;
  label: string;
  provider: string;
  simpleLabel: string;
  beginnerLabel: string;
}

interface ModelsContextValue {
  customModels: CustomModel[];
  addCustomModel: (model: CustomModel) => void;
  removeCustomModel: (id: string) => void;
}

const ModelsContext = createContext<ModelsContextValue>({
  customModels: [],
  addCustomModel: () => {},
  removeCustomModel: () => {},
});

export function ModelsProvider({ children }: { children: ReactNode }) {
  const [customModels, setCustomModels] = useState<CustomModel[]>(() => {
    const saved = localStorage.getItem('nexus_custom_models');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('nexus_custom_models', JSON.stringify(customModels));
  }, [customModels]);

  function addCustomModel(model: CustomModel) {
    setCustomModels(prev => prev.find(m => m.id === model.id) ? prev : [...prev, model]);
  }

  function removeCustomModel(id: string) {
    setCustomModels(prev => prev.filter(m => m.id !== id));
  }

  return (
    <ModelsContext.Provider value={{ customModels, addCustomModel, removeCustomModel }}>
      {children}
    </ModelsContext.Provider>
  );
}

export function useModels() {
  return useContext(ModelsContext);
}

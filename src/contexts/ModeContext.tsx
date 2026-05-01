import { createContext, useContext, useState, useEffect } from 'react';

type Mode = 'professional' | 'beginner';

interface ModeContextValue {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

const ModeContext = createContext<ModeContextValue>({
  mode: 'beginner',
  setMode: () => {},
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    const stored = localStorage.getItem('nexus_mode');
    return stored === 'professional' ? 'professional' : 'beginner';
  });

  useEffect(() => {
    localStorage.setItem('nexus_mode', mode);
  }, [mode]);

  function setMode(m: Mode) {
    setModeState(m);
  }

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}

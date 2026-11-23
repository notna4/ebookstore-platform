import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useStore } from './StoreContext';

interface UiContextValue {
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const { signIn } = useStore();
  // With an identity provider the sign-in page replaces the local login form.
  const openLogin = useCallback(() => (signIn ? signIn() : setLoginOpen(true)), [signIn]);
  const closeLogin = useCallback(() => setLoginOpen(false), []);
  const value = useMemo(() => ({ loginOpen, openLogin, closeLogin }), [loginOpen, openLogin, closeLogin]);
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within UiProvider');
  return ctx;
}

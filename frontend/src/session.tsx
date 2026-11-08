import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, Parrot, UserSummary } from './api';

interface Session {
  loading: boolean;
  me: UserSummary | null;
  parrots: Parrot[];
  refresh(): Promise<void>;
  setMe(u: UserSummary | null): void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<UserSummary | null>(null);
  const [parrots, setParrots] = useState<Parrot[]>([]);

  const refresh = useCallback(async () => {
    try {
      const u = await api.me();
      setMe(u);
      setParrots(u ? await api.myParrots() : []);
    } catch {
      setMe(null);
      setParrots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ loading, me, parrots, refresh, setMe }}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider missing');
  return s;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const PAGES = ['dashboard', 'today', 'next', 'import', 'library', 'revision', 'calendar', 'settings'];
const pageFromHash = () => {
  const h = window.location.hash.replace('#/', '').replace('#', '');
  return PAGES.includes(h) ? h : 'dashboard';
};

export function AppProvider({ children }) {
  const [page, setPage] = useState(pageFromHash);
  const [today, setToday] = useState(null);
  const [settings, setSettings] = useState(null);
  const [version, setVersion] = useState(0); // bump to make pages refetch
  const [toasts, setToasts] = useState([]);
  const [checkInOpen, setCheckInOpen] = useState(false);

  useEffect(() => {
    const f = () => setPage(pageFromHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const navigate = useCallback((p) => {
    window.location.hash = `/${p}`;
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toast = useCallback((msg, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const t = await api.today();
      setToday(t);
      setSettings(t.settings);
      setVersion((v) => v + 1);
      return t;
    } catch (e) {
      toast(e.message, 'error');
    }
  }, [toast]);

  useEffect(() => {
    refresh().then((t) => {
      if (!t?.checkInNeeded) return;
      let dismissed = null;
      try {
        dismissed = localStorage.getItem('scalpel.checkinDismissed');
      } catch {}
      if (dismissed !== t.date) setCheckInOpen(true);
    });
  }, [refresh]);

  const value = useMemo(
    () => ({ page, navigate, today, settings, setSettings, refresh, version, toast, checkInOpen, setCheckInOpen }),
    [page, navigate, today, settings, refresh, version, toast, checkInOpen],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              className="glass-strong pointer-events-auto flex max-w-md items-center gap-2.5 px-4 py-3 text-sm"
            >
              {t.type === 'error' ? <AlertTriangle size={16} className="text-rose-400" /> : t.type === 'info' ? <Info size={16} className="text-cyan-300" /> : <CheckCircle2 size={16} className="text-emerald-400" />}
              <span className="text-slate-100">{t.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

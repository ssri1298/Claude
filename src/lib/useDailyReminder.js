import { useEffect, useRef } from 'react';
import { api, IS_WEB } from '../api.js';
import { useApp } from '../store.jsx';
import { getLastReminded, localISO, permission, registerReminderWorker, setLastReminded, shouldRemind, showPlanNotification } from './reminder.js';

/** Checks every 30 s whether it's time for the daily plan reminder. */
export function useDailyReminder() {
  const { settings, refresh, setCheckInOpen, navigate } = useApp();
  const busy = useRef(false);

  useEffect(() => {
    if (!IS_WEB) registerReminderWorker();
    const open = () => {
      try {
        localStorage.removeItem('scalpel.checkinDismissed');
      } catch {}
      navigate('today');
      refresh().then((t) => t?.checkInNeeded && setCheckInOpen(true));
    };
    const onSw = (e) => e.data?.type === 'open-checkin' && open();
    window.addEventListener('scalpel:open-checkin', open);
    navigator.serviceWorker?.addEventListener('message', onSw);
    return () => {
      window.removeEventListener('scalpel:open-checkin', open);
      navigator.serviceWorker?.removeEventListener('message', onSw);
    };
  }, [navigate, refresh, setCheckInOpen]);

  useEffect(() => {
    if (!settings?.reminder?.enabled) return;
    const check = async () => {
      if (busy.current) return;
      const now = new Date();
      if (!shouldRemind({ now, reminder: settings.reminder, lastRemindedOn: getLastReminded(), planFinal: false })) return;
      busy.current = true;
      try {
        const t = await api.today(); // fresh: the date may have rolled over since the page loaded
        setLastReminded(localISO(now));
        if (t.plan?.status === 'final') return;
        if (!IS_WEB && permission() === 'granted') {
          await showPlanNotification('How much time do you have for study today? Tap to build your plan.');
        }
        if (IS_WEB || !document.hidden) {
          try {
            localStorage.removeItem('scalpel.checkinDismissed');
          } catch {}
          await refresh();
          setCheckInOpen(true);
        }
      } catch {
        /* server offline — try again next tick */
      } finally {
        busy.current = false;
      }
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [settings?.reminder?.enabled, settings?.reminder?.time, refresh, setCheckInOpen]);
}

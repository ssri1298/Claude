// Daily "what's your plan for today?" reminder (default 10:00 local time).
// Fires once per day, at the first check at or after the reminder time,
// unless today's plan is already finalized.

const KEY = 'scalpel.remindedOn';
const pad = (n) => String(n).padStart(2, '0');
export const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Pure decision function (unit-tested). */
export function shouldRemind({ now, reminder, lastRemindedOn, planFinal }) {
  if (!reminder?.enabled) return false;
  const [h, m] = String(reminder.time || '10:00').split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return false;
  if (lastRemindedOn === localISO(now)) return false;
  return !planFinal;
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const permission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export async function registerReminderWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export async function showPlanNotification(body) {
  const title = 'Scalpel · Good morning, Doctor ☀️';
  const opts = { body, icon: '/favicon.svg', badge: '/favicon.svg', tag: 'scalpel-daily-plan', renotify: true, requireInteraction: true };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) return await reg.showNotification(title, opts);
  } catch {}
  const n = new Notification(title, opts);
  n.onclick = () => {
    window.focus();
    window.dispatchEvent(new Event('scalpel:open-checkin'));
    n.close();
  };
}

export const getLastReminded = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
export const setLastReminded = (d) => {
  try {
    localStorage.setItem(KEY, d);
  } catch {}
};

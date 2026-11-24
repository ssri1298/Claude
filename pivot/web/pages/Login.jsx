import { useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../lib.js';
import { Button } from '../components/ui.jsx';
import { Logo } from '../App.jsx';

export default function Login({ setup, demo, onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const first = !setup;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (first && pw !== pw2) return setErr('The two passwords do not match');
    setBusy(true);
    try {
      await api(first ? '/auth/setup' : '/auth/login', { method: 'POST', body: { password: pw } });
      onDone();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-md bg-card rounded-4xl shadow-lift p-8 rise">
        <div className="flex flex-col items-center text-center">
          <Logo size={72} />
          <h1 className="text-[34px] font-bold tracking-tight mt-5">Pivot</h1>
          <p className="text-ink2 mt-1">{first ? 'Welcome! Choose a password to protect your trading app.' : 'Your VCP trading agents'}</p>
          {demo && <p className="mt-3 text-[15px] bg-butter-soft text-butter rounded-2xl px-4 py-2 font-semibold">Demo mode · simulated market</p>}
        </div>
        <div className="mt-7 space-y-3">
          <label className="block">
            <span className="text-ink2 text-[15px] font-semibold">Password</span>
            <input
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="mt-1.5 w-full bg-card2 rounded-2xl px-4 h-14 text-[19px] outline-none focus:ring-2 ring-accent/40"
              autoComplete={first ? 'new-password' : 'current-password'}
            />
          </label>
          {first && (
            <label className="block">
              <span className="text-ink2 text-[15px] font-semibold">Repeat password</span>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="mt-1.5 w-full bg-card2 rounded-2xl px-4 h-14 text-[19px] outline-none focus:ring-2 ring-accent/40" autoComplete="new-password" />
            </label>
          )}
          {err && <div className="text-coral font-semibold text-[16px]">{err}</div>}
          <Button size="lg" className="w-full mt-2" loading={busy} icon={Lock}>
            {first ? 'Set password' : 'Unlock'}
          </Button>
          {first && <p className="text-ink3 text-[14px] text-center">At least 8 characters. Write it down somewhere safe.</p>}
        </div>
      </form>
    </div>
  );
}

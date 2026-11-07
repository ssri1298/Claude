import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, FileText, ImageUp, Plus, ScanText, Trash2, Upload, Loader2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { parseLessons, parseDuration } from '../lib/parseLessons.js';
import { Card, SectionHeader, fmtMin } from './ui.jsx';

let uid = 0;
const newRow = (r) => ({ key: ++uid, include: true, title: '', duration_min: 0, ...r });

export default function ImportScreenshots() {
  const { toast, navigate, refresh } = useApp();
  const [images, setImages] = useState([]);
  const [rows, setRows] = useState([]);
  const [drag, setDrag] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showText, setShowText] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const queue = useRef(Promise.resolve());

  const mergeRows = (parsed) =>
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.title.toLowerCase().replace(/[^a-z0-9]/g, '')));
      const add = parsed.filter((p) => !seen.has(p.title.toLowerCase().replace(/[^a-z0-9]/g, '')));
      return [...prev, ...add.map((p) => newRow({ ...p, source: 'ocr' }))];
    });

  const addFiles = useCallback((files) => {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    const items = imgs.map((f) => ({ id: ++uid, file: f, name: f.name || 'pasted image', url: URL.createObjectURL(f), progress: 0, status: 'Queued', text: '', count: null }));
    setImages((p) => [...p, ...items]);
    for (const it of items) {
      queue.current = queue.current.then(async () => {
        const upd = (patch) => setImages((p) => p.map((x) => (x.id === it.id ? { ...x, ...patch } : x)));
        try {
          const { recognize } = await import('../lib/ocr.js');
          const text = await recognize(it.file, (progress, status) => upd({ progress, status }));
          const parsed = parseLessons(text);
          upd({ text, status: 'Done', progress: 1, count: parsed.length });
          mergeRows(parsed);
        } catch (e) {
          console.error(e);
          upd({ status: 'Failed: ' + e.message, progress: 1, count: 0 });
        }
      });
    }
  }, []);

  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile());
      if (files.length) addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const update = (key, patch) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const included = rows.filter((r) => r.include && r.title.trim());
  const totalMin = included.reduce((a, b) => a + (Number(b.duration_min) || 0), 0);

  const doImport = async () => {
    setBusy(true);
    try {
      const r = await api.importTopics(included.map((x) => ({ title: x.title, duration_min: Number(x.duration_min) || 0, source: x.source || 'manual' })));
      toast(`${r.ids.length} topics imported and scored for exam yield`);
      setRows([]);
      setImages([]);
      await refresh();
      navigate('next');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader
        eyebrow="Screenshot reader · offline OCR"
        title="Import video lessons"
        subtitle="Drop screenshots of your course’s video list. The agent reads each topic and its duration on your device; nothing is uploaded. Check the table, fix anything it misread, then import."
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`glass ring-gradient group flex cursor-pointer flex-col items-center justify-center px-6 py-12 text-center transition ${drag ? 'scale-[1.01] bg-violet-500/[0.08]' : 'hover:bg-white/[0.04]'}`}
          >
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-violet-600/30 to-cyan-500/20 ring-1 ring-white/10 transition group-hover:scale-105">
              <Upload className="text-violet-200" size={26} />
            </div>
            <div className="font-display text-lg font-semibold text-white">Drop screenshots here</div>
            <div className="mt-1 text-sm text-slate-400">or click to browse · paste with Ctrl/⌘ + V</div>
            <div className="mt-3 text-xs text-slate-500">PNG, JPG · multiple at once · dark-mode screenshots are fine</div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          </div>

          <AnimatePresence>
            {images.map((im) => (
              <motion.div key={im.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="flex items-center gap-3 p-3">
                  <img src={im.url} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{im.name}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      {im.status === 'Done' ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Loader2 size={12} className="animate-spin text-violet-300" />}
                      {im.status === 'Done' ? `${im.count} lesson${im.count === 1 ? '' : 's'} found` : im.status}
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all" style={{ width: `${im.progress * 100}%` }} />
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          <Card className="p-4">
            <button className="flex w-full items-center gap-2 text-sm text-slate-300" onClick={() => setShowText((v) => !v)}>
              <FileText size={15} className="text-slate-500" /> Or paste the lesson list as text
            </button>
            {showText && (
              <div className="mt-3">
                <textarea className="input min-h-[120px] font-mono text-xs" placeholder={'Acute Pancreatitis 52:10\nCarcinoma Breast 1:12:45'} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
                <button className="btn-ghost mt-2 w-full" onClick={() => { mergeRows(parseLessons(pasteText)); setPasteText(''); }}>
                  <ScanText size={15} /> Parse text
                </button>
              </div>
            )}
          </Card>
          {images.some((i) => i.text) && (
            <details className="glass p-4 text-xs text-slate-400">
              <summary className="cursor-pointer text-slate-300">Raw OCR text (for troubleshooting)</summary>
              {images.filter((i) => i.text).map((i) => (
                <pre key={i.id} className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-900/80 p-3 font-mono">{i.text}</pre>
              ))}
            </details>
          )}
        </div>

        <Card className="p-5 sm:p-6 lg:col-span-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Review extracted lessons</div>
              <div className="mt-1 font-display text-xl font-semibold text-white">
                {included.length} topics · {fmtMin(totalMin)}
              </div>
            </div>
            <button className="btn-ghost !py-2 text-xs" onClick={() => setRows((r) => [...r, newRow({})])}>
              <Plus size={14} /> Add row
            </button>
          </div>
          {!rows.length ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-white/[0.08] py-16 text-center">
              <ImageUp className="mb-3 text-slate-600" size={28} />
              <div className="text-sm text-slate-400">Extracted topics will appear here for you to check.</div>
            </div>
          ) : (
            <>
              <div className="max-h-[520px] overflow-y-auto pr-1">
                <div className="mb-2 hidden grid-cols-[28px_1fr_110px_36px] gap-2 px-1 text-[11px] uppercase tracking-widest text-slate-600 sm:grid">
                  <span />
                  <span>Topic</span>
                  <span>Duration</span>
                  <span />
                </div>
                <ul className="space-y-2">
                  {rows.map((r) => (
                    <li key={r.key} className={`grid grid-cols-[28px_1fr_90px_36px] items-center gap-2 sm:grid-cols-[28px_1fr_110px_36px] ${r.include ? '' : 'opacity-40'}`}>
                      <input type="checkbox" className="h-4 w-4 accent-violet-500" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label="Include" />
                      <input className="input !py-2" value={r.title} placeholder="Topic title" onChange={(e) => update(r.key, { title: e.target.value })} />
                      <div className="relative">
                        <input
                          className="input !py-2 pr-9"
                          defaultValue={r.duration_min || ''}
                          placeholder="min"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            const m = /^\d+$/.test(v) ? Number(v) : parseDuration(v) ?? 0;
                            e.target.value = m || '';
                            update(r.key, { duration_min: m });
                          }}
                          aria-label="Duration in minutes"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">min</span>
                      </div>
                      <button className="btn-icon" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} aria-label="Delete row"><Trash2 size={15} /></button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button className="btn-ghost" onClick={() => setRows([])}>Clear</button>
                <button className="btn-primary" onClick={doImport} disabled={busy || !included.length}>
                  <CheckCircle2 size={16} /> Import {included.length} topics
                </button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

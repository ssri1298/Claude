// Builds public/tesseract/: one self-contained OCR worker (Tesseract WASM core + worker script in a
// single file, so it needs no importScripts) and the English language data as base64 text (the
// website host serves text but not .gz files). OCR then runs fully offline, locally and online.
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'tesseract');

if (!existsSync(join(nm, 'tesseract.js'))) {
  console.log('[ocr-assets] tesseract.js not installed yet, skipping');
  process.exit(0);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const core = readFileSync(join(nm, 'tesseract.js-core/tesseract-core-lstm.wasm.js'), 'utf8');
const worker = readFileSync(join(nm, 'tesseract.js/dist/worker.min.js'), 'utf8');
// Inside the worker, requests for "<lang>.traineddata.gz" are answered from the base64 text file.
const shim = `;(() => {
  const realFetch = self.fetch.bind(self);
  self.fetch = async (url, opts) => {
    const u = String(url);
    const m = u.match(/^(.*)\\/([a-z_]+)\\.traineddata\\.gz$/);
    if (!m) return realFetch(url, opts);
    const res = await realFetch(m[1] + '/' + m[2] + '-traineddata.txt');
    if (!res.ok) return res;
    const bin = atob((await res.text()).trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes, { status: 200 });
  };
})();`;
writeFileSync(join(out, 'ocr-worker.js'), `${core}\n;self.TesseractCore = TesseractCore;\n${shim}\n${worker}\n`);
const lang = readFileSync(join(nm, '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'));
writeFileSync(join(out, 'eng-traineddata.txt'), lang.toString('base64'));
console.log('[ocr-assets] wrote public/tesseract/ocr-worker.js and eng-traineddata.txt');

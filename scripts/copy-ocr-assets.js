// Copies Tesseract worker, WASM core and English language data into public/tesseract
// so screenshot OCR runs fully offline (no CDN requests).
import { cpSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'tesseract');
const core = join(out, 'core');
const lang = join(out, 'lang');

if (!existsSync(join(nm, 'tesseract.js'))) {
  console.log('[ocr-assets] tesseract.js not installed yet, skipping');
  process.exit(0);
}
mkdirSync(core, { recursive: true });
mkdirSync(lang, { recursive: true });

cpSync(join(nm, 'tesseract.js/dist/worker.min.js'), join(out, 'worker.min.js'));
for (const f of readdirSync(join(nm, 'tesseract.js-core'))) {
  if (f.startsWith('tesseract-core') && (f.endsWith('.js') || f.endsWith('.wasm'))) {
    cpSync(join(nm, 'tesseract.js-core', f), join(core, f));
  }
}
cpSync(join(nm, '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), join(lang, 'eng.traineddata.gz'));
console.log('[ocr-assets] copied Tesseract assets to public/tesseract');

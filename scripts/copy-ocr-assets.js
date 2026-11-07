// Builds public/tesseract/: one self-contained OCR worker (Tesseract WASM core + worker script in a
// single file, so it needs no importScripts) and the English language data. OCR then runs fully
// offline, both in the local app and on the hosted website.
import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
mkdirSync(join(out, 'lang'), { recursive: true });
const core = readFileSync(join(nm, 'tesseract.js-core/tesseract-core-lstm.wasm.js'), 'utf8');
const worker = readFileSync(join(nm, 'tesseract.js/dist/worker.min.js'), 'utf8');
writeFileSync(join(out, 'ocr-worker.js'), `${core}\n;self.TesseractCore = TesseractCore;\n${worker}\n`);
cpSync(join(nm, '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), join(out, 'lang', 'eng.traineddata.gz'));
console.log('[ocr-assets] wrote public/tesseract/ocr-worker.js and lang/eng.traineddata.gz');

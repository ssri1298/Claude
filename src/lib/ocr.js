import { createWorker } from 'tesseract.js';

// Tesseract runs from files published next to the page (built by scripts/copy-ocr-assets.js):
// a single self-contained worker with the WASM core baked in, plus the English language data.
// Nothing is fetched from other hosts, so screenshot reading works offline and on the website.
let workerPromise = null;
let progressCb = () => {};
const asset = (p) => new URL(p, document.baseURI).href;

function getWorker() {
  if (!workerPromise) {
    let fail;
    const failed = new Promise((_, rej) => (fail = rej));
    const timer = setTimeout(() => fail(new Error('it took too long to start')), 60000);
    workerPromise = Promise.race([
      createWorker('eng', 1, {
        workerPath: asset('tesseract/ocr-worker.js'),
        workerBlobURL: false,
        corePath: asset('tesseract/'),
        langPath: asset('tesseract/lang'),
        gzip: true,
        cacheMethod: 'none',
        logger: (m) => progressCb(m),
        errorHandler: (e) => fail(new Error(String(e?.message || e))),
      }),
      failed,
    ]).then((w) => {
      clearTimeout(timer);
      return w;
    }).catch((e) => {
      clearTimeout(timer);
      workerPromise = null;
      throw new Error(`The screenshot reader couldn't start in this browser (${e?.message || e}). You can paste the lesson list as text instead.`);
    });
  }
  return workerPromise;
}

/** Upscale small images, convert to grayscale and invert dark-mode screenshots for better OCR. */
async function preprocess(file) {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 1400 ? Math.min(3, 1800 / bmp.width) : 1;
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
    sum += g;
  }
  const dark = sum / (d.length / 4) < 110;
  if (dark) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function recognize(file, onProgress = () => {}) {
  progressCb = (m) => {
    if (m.status === 'recognizing text') onProgress(0.15 + m.progress * 0.85, 'Reading text');
    else onProgress(0.08, m.status.replace(/^\w/, (c) => c.toUpperCase()));
  };
  onProgress(0.02, 'Preparing image');
  const [worker, canvas] = await Promise.all([getWorker(), preprocess(file)]);
  await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '4' });
  const { data } = await worker.recognize(canvas);
  onProgress(1, 'Done');
  return data.text;
}

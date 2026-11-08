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
        // The worker answers this path from tesseract/eng-traineddata.txt (see copy-ocr-assets.js).
        langPath: asset('tesseract'),
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

export const DEFAULT_OCR = { width: 1800, binarize: 'none', psm: '4', stretch: false };
// The second pass reads the screenshot at a smaller scale; Tesseract drops different lines at
// different scales, so merging the two recovers lessons a single pass misses.
export const SECOND_PASS = { width: 1200 };

/**
 * Prepare a screenshot for Tesseract: scale to a working width, grayscale, invert dark-mode
 * screenshots, optionally stretch contrast and binarize (Otsu threshold).
 */
async function preprocess(file, opts) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(4, opts.width / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = d.length / 4;
  const gray = new Uint8ClampedArray(n);
  let sum = 0;
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    sum += gray[j];
  }
  if (sum / n < 110) for (let j = 0; j < n; j++) gray[j] = 255 - gray[j]; // dark mode → dark text on light
  if (opts.stretch) {
    const hist = new Uint32Array(256);
    for (let j = 0; j < n; j++) hist[gray[j]]++;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) < n * 0.01) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < n * 0.01) hi--;
    const k = 255 / Math.max(1, hi - lo);
    for (let j = 0; j < n; j++) gray[j] = (gray[j] - lo) * k;
  }
  if (opts.binarize === 'otsu') {
    const hist = new Float64Array(256);
    for (let j = 0; j < n; j++) hist[gray[j]]++;
    let total = 0;
    for (let t = 0; t < 256; t++) total += t * hist[t];
    let wB = 0, sumB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (total - sumB) / wF;
      const between = wB * wF * (mB - mF) ** 2;
      if (between > best) { best = between; th = t; }
    }
    for (let j = 0; j < n; j++) gray[j] = gray[j] > th ? 255 : 0;
  }
  for (let i = 0, j = 0; j < n; i += 4, j++) d[i] = d[i + 1] = d[i + 2] = gray[j];
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Read the text in a screenshot. Returns { text, words } (words carry Tesseract confidence). */
export async function recognizeDetailed(file, onProgress = () => {}, options = {}) {
  const opts = { ...DEFAULT_OCR, ...options };
  progressCb = (m) => {
    if (m.status === 'recognizing text') onProgress(0.15 + m.progress * 0.85, 'Reading text');
    else onProgress(0.08, m.status.replace(/^\w/, (c) => c.toUpperCase()));
  };
  onProgress(0.02, 'Preparing image');
  try {
    const [worker, canvas] = await Promise.all([getWorker(), preprocess(file, opts)]);
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: String(opts.psm) });
    const { data } = await worker.recognize(canvas);
    onProgress(1, 'Done');
    return { text: data.text, words: (data.words || []).map((w) => ({ text: w.text, confidence: w.confidence })) };
  } finally {
    progressCb = () => {}; // late progress messages must not overwrite the result or error
  }
}

export async function recognize(file, onProgress = () => {}, options = {}) {
  return (await recognizeDetailed(file, onProgress, options)).text;
}

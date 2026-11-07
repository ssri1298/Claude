import { createWorker } from 'tesseract.js';

// All Tesseract assets are served locally from /tesseract (copied at npm install),
// so screenshot reading works fully offline.
let workerPromise = null;
let progressCb = () => {};

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/core',
      langPath: '/tesseract/lang',
      gzip: true,
      logger: (m) => progressCb(m),
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

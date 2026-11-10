// Builds the hosted-website version into dist-web/site/:
//   index.html               page content with CSS and JS inlined (the host adds the document skeleton)
//   tesseract/ocr-worker.js  offline screenshot reader
//   tesseract/lang/eng.traineddata.gz
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-web');
const site = join(dist, 'site');
// The link friends open (shown in Settings → Share Scalpel with friends).
const SHARE_URL = process.env.SHARE_URL || 'https://claude.ai/artifact/TYP4Rcfi6SJuvujFG7kSaV';
execSync('npx vite build --mode web', { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_SHARE_URL: SHARE_URL } });

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = join(dist, 'assets');
const files = readdirSync(assets);
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const jsFiles = files.filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1) throw new Error(`Expected one JS bundle, found ${jsFiles.join(', ')}`);
const js = readFileSync(join(assets, jsFiles[0]), 'utf8').replace(/<\/(script)/gi, '<\\/$1');
const fonts = html.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]+>/)?.[0] ?? '';

const page = `<title>Scalpel</title>
<meta name="description" content="NEET SS Surgical study planner: screenshot import, daily plans, active recall and a Pomodoro timer.">
<meta name="theme-color" content="#05060a">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;
rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
writeFileSync(join(site, 'index.html'), page);
cpSync(join(root, 'public', 'tesseract'), join(site, 'tesseract'), { recursive: true });
console.log(`\nWebsite build ready: ${site} (page ${(page.length / 1024).toFixed(0)} KB)`);

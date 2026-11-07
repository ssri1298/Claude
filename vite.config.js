import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite build --mode web` produces the hosted-website build: the study engine runs in the
// browser (src/web/backend.js) and everything is bundled into one script for inlining.
export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    plugins: [react()],
    base: web ? './' : '/',
    define: { 'import.meta.env.VITE_TARGET': JSON.stringify(web ? 'web' : 'local') },
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:5174' },
    },
    build: {
      outDir: web ? 'dist-web' : 'dist',
      chunkSizeWarningLimit: 2000,
      ...(web ? { rollupOptions: { output: { inlineDynamicImports: true } }, assetsInlineLimit: 100000 } : {}),
    },
  };
});

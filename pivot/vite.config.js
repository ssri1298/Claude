import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:8080', changeOrigin: false } } },
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      output: {
        // Big libraries in their own files: they rarely change, so phones keep them cached across app updates.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/](recharts|d3-|victory-vendor|recharts-scale|decimal\.js-light|eventemitter3|lodash)/.test(id)) return 'charts';
          if (/lightweight-charts|fancy-canvas/.test(id)) return 'tradingchart';
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
        },
      },
    },
  },
});

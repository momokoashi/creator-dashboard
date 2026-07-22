import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the React app into ./dist, which server.cjs serves in production.
// In dev, `npm run dev` runs Vite on 5173 and proxies /api + /screenshots
// to the Express server on 3000 so the app and the data API run together.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/screenshots': 'http://localhost:3000',
    },
  },
});

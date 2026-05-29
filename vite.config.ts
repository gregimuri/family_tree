import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** GitHub Pages: https://gregimuri.github.io/Family_Tree/ */
const pagesBase = '/Family_Tree/';

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? pagesBase : '/',
  plugins: [react()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
}));

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'react-entry.jsx'),
      output: {
        entryFileNames: 'renderer.js',
        assetFileNames: 'renderer.[ext]'
      }
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@renderer': path.resolve(__dirname, '.')
    }
  }
});

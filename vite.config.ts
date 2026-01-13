
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'terser',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'lucide-react', 'xlsx'],
            pdf: ['pdfjs-dist']
          }
        }
      }
    },
    define: {
      'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
    }
  };
});

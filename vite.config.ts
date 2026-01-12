
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      sourcemap: false
    },
    // Rimosso define: process.env.API_KEY. La chiave ora vive solo sul server.
  };
});

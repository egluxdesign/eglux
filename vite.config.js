import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Pisahkan vendor besar agar browser bisa cache mereka secara
          // independen dan paralel saat download.
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
    // Target modern untuk output lebih kecil; Vercel mengirim Brotli/gzip.
    target: 'es2020',
    // Tingkatkan sedikit threshold chunk warning agar build bersih.
    chunkSizeWarningLimit: 600,
  },
});

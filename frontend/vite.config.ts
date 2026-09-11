import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 4173,
    strictPort: false,
    allowedHosts: [
      '.railway.app',
      '.up.railway.app',
      'localhost',
      '127.0.0.1',
    ],
  },
  build: {
    // Phaser (Flappy Bar) pèse ~1,2 Mo minifié : chunk dédié, chargé à la
    // demande par la page de partie uniquement (import dynamique).
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser/')) return 'phaser';
          return undefined;
        },
      },
    },
  },
});

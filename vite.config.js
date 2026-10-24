import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { MANIFESTE } from './api/_manifeste.js';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: { ...MANIFESTE, icons: MANIFESTE.icons.map((i) => ({ ...i, src: i.src.slice(1) })) },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        // Logo de la zone (bucket public, URL versionnée) : disponible hors ligne une fois vu.
        runtimeCaching: [
          {
            urlPattern: /\/storage\/v1\/object\/public\/logos\//,
            handler: 'CacheFirst',
            options: { cacheName: 'logos', expiration: { maxEntries: 40 } },
          },
        ],
      },
    }),
  ],
});

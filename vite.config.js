import { defineConfig } from 'vite';
import { starryApiPlugin } from './server/plugin.js';

export default defineConfig({
  plugins: [starryApiPlugin()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
  },
});

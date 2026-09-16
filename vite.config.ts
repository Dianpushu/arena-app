import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer（分頁列 / 工具列 / 設定面板）的建置設定。
// 注意：`base: './'` 是必須的，正式版會用 file:// 協定載入 dist/index.html。
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

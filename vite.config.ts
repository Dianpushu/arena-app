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
    // 開發/預覽用：允許任意 host（雲端預覽網址每次都不同）。正式版走 file://，不受影響。
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

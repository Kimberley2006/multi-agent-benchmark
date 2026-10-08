import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: ['terminal.local'],
    proxy: {
      // 开发模式：前端 /api 代理到本地 TraceLab 后端（node server/index.js）
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
});

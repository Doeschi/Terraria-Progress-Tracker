import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // relative base so the build works under any GitHub Pages path (/<repo>/)
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // the player file parser, used from its source (packages/, not published yet)
      'terraria-player-file': path.resolve(__dirname, '../packages/terraria-player-file/src/index.ts'),
    },
  },
  // the dev server may serve the package source outside web/
  server: { fs: { allow: [path.resolve(__dirname, '..')] } },
  build: {
    rollupOptions: {
      output: {
        // React changes rarely - keep it in its own long-cached chunk
        manualChunks: (id) => (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id) ? 'react' : undefined),
      },
    },
  },
})

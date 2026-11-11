import { defineConfig } from 'vite'

// assets/ holds the exported game assets (not in git); served as the static directory in dev and copied whole into dist/ on build
export default defineConfig({
  base: './',
  publicDir: 'assets',
  build: { outDir: 'dist', assetsDir: 'js', emptyOutDir: true, target: 'esnext' },
  server: { port: 5173, strictPort: true },
})

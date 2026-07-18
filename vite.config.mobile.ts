import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Build web assets for Capacitor (APK / futuro iOS). */
export default defineConfig({
  root: '.',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html')
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
})

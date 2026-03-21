import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Same-origin /api as on Vercel — proxy to local Express during dev
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  preview: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})

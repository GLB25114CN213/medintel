import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    cors: true,
    // Proxy API calls from the Vite dev server to the Express backend
    // This fixes the "Cannot POST /analyze" error in local development
    proxy: {
      '/analyze': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
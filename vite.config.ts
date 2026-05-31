/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Backend to proxy the interview API to (so the browser only talks to this
// origin — same-origin, no CORS, no mixed-content when served over HTTPS).
const apiTarget = process.env.API_PROXY || 'http://localhost:8088'
// Opt-in HTTPS for LAN access (voice needs a secure origin). `npm run dev:https`.
const useHttps = process.env.HTTPS === '1'
const apiProxy = { target: apiTarget, changeOrigin: true }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    host: true, // expose on the LAN (e.g. http(s)://macstudio.lan:5173)
    // Vite ≥5 blocks non-loopback Host headers by default; allow LAN hostnames.
    allowedHosts: ['.lan', '.local'],
    proxy: {
      '/grade': apiProxy,
      '/tts': apiProxy,
      '/stt': apiProxy,
      '/health': apiProxy,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
})

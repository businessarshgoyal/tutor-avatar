import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Vite blocks unknown Host headers; set ALLOW_ANY_HOST=1 when serving through a tunnel/preview.
    allowedHosts: process.env.ALLOW_ANY_HOST ? true : undefined,
    // Same-origin /api in dev so the app works behind tunnels/previews; the server's CORS still
    // applies when VITE_API_BASE_URL points at it directly.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:8787',
        // Proxied requests reach the server from Vite's own origin, so its CORS allowlist still holds.
        headers: { origin: 'http://localhost:5173' },
      },
    },
  },
})

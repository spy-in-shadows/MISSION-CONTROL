import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/iss': {
        target: 'https://api.open-notify.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/iss/, ''),
      },
      '/api/nominatim': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nominatim/, ''),
        headers: {
          'User-Agent': 'MissionControlDashboard/1.0'
        }
      },
    }
  }
})

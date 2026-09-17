import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Fail the build immediately rather than letting it succeed and silently
  // target localhost in production. Vercel must have VITE_API_BASE_URL set.
  if (mode === 'production' && !env.VITE_API_BASE_URL) {
    throw new Error(
      '[MediHawk build] VITE_API_BASE_URL is not set.\n' +
      'Production builds require VITE_API_BASE_URL to point to the Render backend.\n' +
      'Set it in your Vercel project environment variables.\n' +
      'Example: VITE_API_BASE_URL=https://medihawk3.onrender.com'
    )
  }

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': new URL('./src', import.meta.url).pathname },
    },
    optimizeDeps: {
      include: ['three', '@react-three/fiber', '@react-three/drei'],
    },
    build: {
      chunkSizeWarningLimit: 1000,
    },
  }
})

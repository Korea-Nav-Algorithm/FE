import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_');
  if (mode === 'production' && environment.VITE_USE_MOCK_API === 'true') {
    throw new Error('Production build blocked: VITE_USE_MOCK_API=true');
  }

  return {
    plugins: [react()],
    server: { proxy: { '/api': { target: environment.VITE_DEV_API_TARGET || 'http://localhost:8080', changeOrigin: true } } },
  };
});

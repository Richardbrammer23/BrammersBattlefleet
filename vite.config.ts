/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { apiDevPlugin } from './server/devPlugin';

export default defineConfig(({ mode }) => {
  // Expose server-only variables (DATABASE_URL etc.) to the dev API without bundling them into the client.
  Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env });
  return {
    plugins: [react(), apiDevPlugin()],
    test: {
      include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
      environment: 'node',
      fileParallelism: false,
    },
  };
});

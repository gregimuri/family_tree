import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // forks avoids intermittent ERR_IPC_CHANNEL_CLOSED on Windows (tinypool threads)
    pool: 'forks',
    fileParallelism: false,
  },
});

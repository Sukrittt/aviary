import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Node 25's own global `localStorage` (on by default) otherwise wins over
    // jsdom's and is missing `.clear()`. Set here rather than only in the
    // `test` script so `npx vitest` and editor runners get it too.
    execArgv: ['--no-experimental-webstorage'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'dist/**', '.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
})

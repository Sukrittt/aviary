import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'

// Pin a zone so date tests don't depend on the machine. *.tz.test.ts files
// override it to cover users elsewhere.
process.env.TZ = 'Asia/Kolkata'

export default defineConfig({
  // Same MDX setup as next.config.ts, so blog posts render in tests.
  plugins: [{ enforce: 'pre', ...mdx({ remarkPlugins: [remarkGfm], providerImportSource: '@/mdx-components' }) }, react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Node 25's own global `localStorage` (on by default) otherwise wins over
    // jsdom's and is missing `.clear()`. Set here rather than only in the
    // `test` script so `npx vitest` and editor runners get it too.
    execArgv: ['--no-experimental-webstorage'],
    include: ['**/*.test.{ts,tsx}'],
    // .claude/worktrees and .worktrees hold other git worktrees of this repo.
    exclude: [...configDefaults.exclude, '.next/**', 'dist/**', '.claude/**', '.worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
})

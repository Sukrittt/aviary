import { defineConfig } from 'eslint/config'
import { FlatCompat } from '@eslint/eslintrc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// eslint-config-next ships legacy (eslintrc) configs; FlatCompat adapts them
// for eslint 9 flat config.
const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
})

export default defineConfig([
  {
    ignores: ['.next/**', 'dist/**', 'node_modules/**', 'next-env.d.ts', 'mission-control-app/**', '.claude/**', '.worktrees/**'],
  },
  ...compat.extends('next/core-web-vitals'),
  ...compat.extends('next/typescript'),
  {
    rules: {
      // Leading underscore is the codebase's convention for "intentionally unused"
      // (e.g. destructuring a field off just to drop it).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
])

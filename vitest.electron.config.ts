import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['electron/**/*.test.ts', 'tests/electron/**/*.test.ts'],
    exclude: ['node_modules/**'],
  },
  resolve: {
    alias: {
      electron: path.resolve(__dirname, './tests/electron/__mocks__/electron.ts'),
    },
  },
})
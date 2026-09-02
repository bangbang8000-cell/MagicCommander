import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'state-vendor': ['zustand'],
          'ui-vendor': ['lucide-react'],
          'excel-vendor': ['xlsx'],
          'monaco-vendor': ['monaco-editor', '@monaco-editor/react'],
          'resizable-vendor': ['react-resizable-panels'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand', 'clsx', 'lucide-react'],
    exclude: ['vscode-oniguruma', 'vscode-textmate'],
  },
  clearScreen: false,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['electron/**', 'node_modules/**'],
    // 4.6.0-F6-1（46-a）：前端覆盖率门禁 —— 阈值单一来源 tests/coverage_thresholds.json（frontend.thresholds）
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: 'reports/coverage/frontend',
      include: ['src/**'],
      exclude: ['src/test/**', 'src/**/*.test.*', 'src/types/**', 'src/vite-env.d.ts'],
      thresholds: readFrontendCoverageThresholds(),
    },
  },
})

/** 读取 tests/coverage_thresholds.json 的前端门禁阈值（单一来源，只升不降，Q-1 断言 enforce） */
function readFrontendCoverageThresholds(): {
  lines: number
  statements: number
  functions: number
  branches: number
} {
  try {
    const p = path.resolve(__dirname, 'tests', 'coverage_thresholds.json')
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    const t = raw.frontend?.thresholds ?? {}
    return {
      lines: typeof t.lines === 'number' ? t.lines : 26,
      statements: typeof t.statements === 'number' ? t.statements : 26,
      functions: typeof t.functions === 'number' ? t.functions : 48,
      branches: typeof t.branches === 'number' ? t.branches : 65,
    }
  } catch {
    return { lines: 26, statements: 26, functions: 48, branches: 65 }
  }
}

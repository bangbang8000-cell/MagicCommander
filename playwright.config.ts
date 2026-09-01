import { defineConfig } from '@playwright/test'

/**
 * 4.0.0-F0-1（40-a）：MC 引入 Playwright Electron E2E
 * 应用以 dev 模式启动（webServer 拉起 vite :5173，Electron 未打包 → isDev → loadURL dev）。
 * 本地: npm run build:electron && npx playwright test
 * CI  : xvfb-run --auto-servernum npx playwright test（.github/workflows/ci.yml e2e job）
 */
export default defineConfig({
  testDir: './e2e',
  // 使用 .e2e.ts 后缀，避免与 vitest 默认 include（*.spec.ts/*.test.ts）冲突
  testMatch: /.*\.e2e\.ts/,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    trace: 'retain-on-failure',
  },
})

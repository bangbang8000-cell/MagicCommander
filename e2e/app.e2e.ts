import { test, expect, _electron as electron } from '@playwright/test'
import { openMainWindow } from './helpers'

/**
 * 4.0.0-F0-1（40-a / G-1）：E2E 冒烟第一步 —— 应用启动冒烟
 * 场景：主窗口渲染（#root 非空）→ 标题正确 → 活动栏就绪（项目浏览器入口）
 *       → preload contextBridge 完整（window.electron.versions 可访问，证明 IPC-only 桥接生效）。
 * 前置：npm run build:electron && npm run dev（webServer）。
 */
test('应用启动冒烟：主窗口渲染 + 活动栏就绪 + preload 桥接完整', async () => {
  const app = await electron.launch({ args: ['.'] })
  try {
    const window = await openMainWindow(app)
    await expect(window).toHaveTitle(/MagicCommander/)

    // preload contextBridge 完整：版本信息桥接可用（渲染层无 Node 直连，一切经 IPC 桥）
    const versions = await window.evaluate(() => window.electron?.versions?.electron)
    expect(typeof versions).toBe('string')
    expect((versions ?? '').length).toBeGreaterThan(0)
  } finally {
    await app.close()
  }
})

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { openMainWindow, countRenderedFiles } from './helpers'

/**
 * 4.0.0-F0-1（40-a / G-1）：E2E 冒烟三件套 —— 启动→建项目→渲染→导出
 * 链路：项目浏览器 → 新建项目（从示例模板）→ 项目创建成功
 *       → 工作台「仅渲染当前项目」（render:project → Python 后端）→ 渲染产出配置文件
 *       → 输出面板「批量导出」→ 导出统计含「配置输出」且文件数 > 0（导出按钮可用）
 * 结束：finally 清理本次冒烟项目（避免污染仓库 workspace）。
 * 前置：npm run build:electron && npm run dev（webServer）。
 */
test('业务链路：新建项目 → 渲染 → 导出（冒烟三件套）', async () => {
  const app = await electron.launch({ args: ['.'] })
  const projectName = `e2e-smoke-${Date.now().toString(36)}`
  let window: Page | undefined
  try {
    window = await openMainWindow(app)

    // ── 1. 建项目（项目浏览器 → 新建项目，默认从示例模板创建）──
    await window.locator('button[title*="Ctrl+Shift+E"]').click()
    await window.getByRole('button', { name: '新建项目', exact: true }).click()
    // MC Modal 无 role="dialog"，以项目名输入框作为弹窗锚点
    const nameInput = window.getByPlaceholder(/输入项目名称/)
    await expect(nameInput).toBeVisible({ timeout: 20_000 })
    await nameInput.fill(projectName)
    await window.getByRole('button', { name: '创建', exact: true }).click()
    await expect(window.getByText(`项目 "${projectName}" 创建成功`)).toBeVisible({ timeout: 30_000 })
    await expect(window.getByText(projectName, { exact: true }).first()).toBeVisible()

    // ── 2. 渲染（选中项目 → 工作台 → 仅渲染当前项目）──
    await window.getByText(projectName, { exact: true }).first().click()
    await window.locator('button[title*="Ctrl+Shift+W"]').click()
    const renderBtn = window.getByRole('button', { name: '仅渲染当前项目' })
    await expect(renderBtn).toBeVisible()
    await renderBtn.click()

    // 轮询：等待 output/<时间戳>/ 下出现 .txt 渲染产物（Python 渲染完成）
    await expect
      .poll(async () => countRenderedFiles(window, projectName), { timeout: 120_000, intervals: [500, 1000, 2000] })
      .toBeGreaterThan(0)

    // ── 3. 导出/产出验证（输出面板 → 批量导出）──
    await window.locator('button[title*="Ctrl+Shift+O"]').click()
    await window.getByRole('button', { name: '批量导出', exact: true }).click()
    await expect(window.getByText('配置输出', { exact: true })).toBeVisible({ timeout: 15_000 })
    const exportBtn = window.getByRole('button', { name: '导出全部', exact: true })
    await expect(exportBtn).toBeEnabled({ timeout: 15_000 })

    // 复核：渲染产物数量 > 0 且导出统计文件数一致
    const rendered = await countRenderedFiles(window, projectName)
    expect(rendered).toBeGreaterThan(0)
  } finally {
    // 清理：删除本次冒烟项目（避免残留 untracked 目录污染仓库）
    try {
      await window?.evaluate(async (name) => {
        const list = (await window.electron?.project.list()) ?? []
        const hit = list.find((p) => p.name === name)
        if (hit) await window.electron?.project.delete([String(hit.id)])
      }, projectName)
    } catch {
      /* 忽略清理失败（仅残留 untracked 目录，不影响 CI 门禁） */
    }
    await app.close()
  }
})

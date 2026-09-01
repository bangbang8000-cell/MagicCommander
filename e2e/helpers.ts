import { expect, type ElectronApplication, type Page } from '@playwright/test'

/** preload contextBridge 暴露的最小 IPC 桥接类型（e2e 只用这几个 API） */
export interface McProject {
  id: number
  name: string
  index: number
}

export interface McTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: McTreeNode[]
}

declare global {
  interface Window {
    electron?: {
      versions?: { electron: string; node: string; chrome: string }
      project: {
        list: () => Promise<McProject[]>
        delete: (ids: string[]) => Promise<void>
        getStructure: (name: string) => Promise<McTreeNode[]>
      }
    }
  }
}

/**
 * 等待「非 devtools」主窗口出现（MC dev 模式会 detached 打开 devtools）：
 * 扫描 URL 为 localhost:5173 或 file:// 的窗口，并等待 React 挂载 + 活动栏就绪。
 */
export async function openMainWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 40_000
  let main: Page | undefined
  while (Date.now() < deadline) {
    const pages = app.windows().filter((p) => !p.isClosed())
    main = pages.find((p) => {
      const url = String(p.url() ?? '')
      return url.includes('localhost:5173') || url.startsWith('file://')
    })
    if (main) break
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!main) main = await app.firstWindow()
  await main.waitForSelector('#root', { state: 'attached', timeout: 30_000 })
  // 等待初始加载动画隐藏（fixed 全屏遮罩，避免遮挡后续交互）
  await main.locator('.app-loading').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {})
  await expect(main.locator('#root')).not.toBeEmpty({ timeout: 150_000 })
  await main.locator('button[title*="Ctrl+Shift+E"]').waitFor({ state: 'visible', timeout: 30_000 })
  return main
}

/** 统计项目 output/ 下全部渲染产物（.txt 配置文件）数量（递归，含角色子目录） */
export async function countRenderedFiles(window: Page, projectName: string): Promise<number> {
  return await window.evaluate(async (name) => {
    const walk = (nodes?: McTreeNode[]): number => {
      if (!nodes) return 0
      return nodes.reduce((sum, n) => sum + (n.isDirectory ? walk(n.children) : 1), 0)
    }
    const tree = await window.electron?.project.getStructure(name)
    const output = (tree ?? []).find((n) => n.name === 'output' && n.isDirectory)
    return walk(output?.children)
  }, projectName)
}

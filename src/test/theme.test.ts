import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { useUIStore, resolveTheme, themeIsDark } from '@/stores/ui.store'

/**
 * 4.1 V-1 主题切换 light/dark/system/high-contrast（无闪变 + 持久化）
 * - store 切换逻辑与 isDark 派生
 * - 持久化到 mc-ui-state（无闪变脚本据此在 React 挂载前同步 DOM）
 * - index.html 无闪变脚本静态断言（读取 mc-ui-state + 处理 high-contrast + data-theme）
 */

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-color-scheme: dark') ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('V-1 主题解析 resolveTheme（纯函数）', () => {
  it('light 始终解析为 light（与系统无关）', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('light', false)).toBe('light')
  })

  it('dark 始终解析为 dark', () => {
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('system 跟随系统深浅色', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('high-contrast 独立解析为高对比（不随系统）', () => {
    expect(resolveTheme('high-contrast', true)).toBe('high-contrast')
    expect(resolveTheme('high-contrast', false)).toBe('high-contrast')
  })

  it('themeIsDark 派生语义正确', () => {
    expect(themeIsDark('dark', false)).toBe(true)
    expect(themeIsDark('system', true)).toBe(true)
    expect(themeIsDark('system', false)).toBe(false)
    expect(themeIsDark('high-contrast', true)).toBe(false)
    expect(themeIsDark('light', true)).toBe(false)
  })
})

describe('V-1 主题 store 切换', () => {
  beforeEach(() => {
    localStorage.clear()
    stubMatchMedia(false)
    useUIStore.setState({ theme: 'light', isDark: false })
  })

  it('setTheme(dark/light/high-contrast) 更新 theme 与 isDark', () => {
    useUIStore.getState().setTheme('dark')
    expect(useUIStore.getState().theme).toBe('dark')
    expect(useUIStore.getState().isDark).toBe(true)

    useUIStore.getState().setTheme('high-contrast')
    expect(useUIStore.getState().theme).toBe('high-contrast')
    expect(useUIStore.getState().isDark).toBe(false)

    useUIStore.getState().setTheme('light')
    expect(useUIStore.getState().theme).toBe('light')
    expect(useUIStore.getState().isDark).toBe(false)
  })

  it('setTheme(system) isDark 跟随系统（dark 时 true / light 时 false）', () => {
    stubMatchMedia(true)
    useUIStore.getState().setTheme('system')
    expect(useUIStore.getState().theme).toBe('system')
    expect(useUIStore.getState().isDark).toBe(true)

    stubMatchMedia(false)
    useUIStore.getState().setTheme('system')
    expect(useUIStore.getState().isDark).toBe(false)
  })

  it('cycleTheme 遍历 light→dark→system→high-contrast→light', () => {
    useUIStore.getState().setTheme('light')
    useUIStore.getState().cycleTheme()
    expect(useUIStore.getState().theme).toBe('dark')
    useUIStore.getState().cycleTheme()
    expect(useUIStore.getState().theme).toBe('system')
    useUIStore.getState().cycleTheme()
    expect(useUIStore.getState().theme).toBe('high-contrast')
    useUIStore.getState().cycleTheme()
    expect(useUIStore.getState().theme).toBe('light')
  })
})

describe('V-1 主题持久化（mc-ui-state）', () => {
  beforeEach(() => {
    localStorage.clear()
    stubMatchMedia(false)
    useUIStore.setState({ theme: 'light', isDark: false })
  })

  it('setTheme 后 theme/isDark 写入 localStorage mc-ui-state', async () => {
    useUIStore.getState().setTheme('high-contrast')
    await new Promise((r) => setTimeout(r, 10))
    const raw = localStorage.getItem('mc-ui-state')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { state: { theme: string; isDark: boolean } }
    expect(parsed.state.theme).toBe('high-contrast')
    expect(parsed.state.isDark).toBe(false)
  })
})

describe('V-1 无闪变：index.html 内联脚本（React 挂载前同步 DOM）', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8')

  it('脚本读取 zustand 持久化的 mc-ui-state（而非旧 theme key）', () => {
    expect(html).toContain("localStorage.getItem('mc-ui-state')")
  })

  it('脚本处理 high-contrast 主题并设置 data-theme + class', () => {
    expect(html).toContain("'high-contrast'")
    expect(html).toContain("root.setAttribute('data-theme', resolved)")
    expect(html).toContain("root.classList.toggle('dark', resolved === 'dark')")
    expect(html).toContain("root.classList.toggle('high-contrast', resolved === 'high-contrast')")
  })

  it('脚本对 system 使用 prefers-color-scheme 解析', () => {
    expect(html).toContain("window.matchMedia('(prefers-color-scheme: dark)')")
  })
})

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * 4.0 设计 Token 契约断言（G-7，token 单源）
 * 契约唯一事实源：docs/双端设计Token契约_v1.0_2026-08-29.md
 * 本测试锁定 MC 实现值 = 契约值，防止漂移。
 */

const root = process.cwd()
const tokensCss = fs.readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf-8')
const tailwindConfig = fs.readFileSync(path.join(root, 'tailwind.config.js'), 'utf-8')

const rootBlock = tokensCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? ''
const darkBlock = tokensCss.match(/\.dark\s*\{([\s\S]*?)\}/)?.[1] ?? ''

/** 提取指定 CSS 变量块的变量值（name 不含前导 --） */
function cssVar(block: string, name: string): string {
  const m = block.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))
  if (!m) throw new Error(`tokens.css 缺少 --${name}`)
  return m[1].trim()
}

/** 提取 tailwind.config.js colors 下某颜色组某键的值 */
function configValue(group: string, key: string): string {
  const m = tailwindConfig.match(new RegExp(`${group}:\\s*\\{[\\s\\S]*?${key}:\\s*'([^']+)'`))
  if (!m) throw new Error(`tailwind.config.js 缺少 colors.${group}.${key}`)
  return m[1].trim()
}

/** 十六进制颜色比较（忽略大小写） */
function expectHex(actual: string, expected: string) {
  expect(actual.toLowerCase(), `期望 ${expected}`).toBe(expected.toLowerCase())
}

/** 空白/引号归一化后比较（用于阴影、字体、缓动函数） */
function normalize(s: string): string {
  return s.replace(/[\s']/g, '')
}

describe('G-7 设计 Token 单源（4.0 契约）', () => {
  describe('语义色 Semantic Color', () => {
    const cases: Array<[string, string]> = [
      ['color-primary', '#2f6fed'],
      ['color-primary-hover', '#1e5bc9'],
      ['color-success', '#16a34a'],
      ['color-warning', '#f59e0b'],
      ['color-danger', '#dc2626'],
      ['color-info', '#0ea5e9'],
    ]
    it.each(cases)('%s 值 = 契约值', (name, expected) => {
      expectHex(cssVar(rootBlock, name), expected)
    })
  })

  describe('中性色 / Surface', () => {
    const light: Array<[string, string]> = [
      ['color-app', '#ffffff'],
      ['color-app-surface', '#f6f7f9'],
      ['color-app-hover', '#eceef2'],
      ['color-edge-subtle', '#e4e7eb'],
      ['color-text-primary', '#1a2027'],
      ['color-text-secondary', '#5a6472'],
      ['color-text-muted', '#8a94a2'],
    ]
    const dark: Array<[string, string]> = [
      ['color-app', '#0f141a'],
      ['color-app-surface', '#161c23'],
      ['color-app-hover', '#1e2730'],
      ['color-edge-subtle', '#2a3540'],
      ['color-text-primary', '#e6eaf0'],
      ['color-text-secondary', '#9aa5b1'],
      ['color-text-muted', '#6b7683'],
    ]
    it.each(light)('light %s = 契约值', (name, expected) => {
      expectHex(cssVar(rootBlock, name), expected)
    })
    it.each(dark)('dark %s = 契约值', (name, expected) => {
      expectHex(cssVar(darkBlock, name), expected)
    })
  })

  describe('圆角 Radius', () => {
    it.each([
      ['radius-sm', '6px'],
      ['radius-md', '8px'],
      ['radius-lg', '12px'],
    ] as Array<[string, string]>)('%s = 契约值', (name, expected) => {
      expect(cssVar(rootBlock, name)).toBe(expected)
    })
  })

  describe('阴影 Shadow', () => {
    it.each([
      ['shadow-sm', '0 1px 2px rgba(16, 24, 40, 0.06)'],
      ['shadow-md', '0 4px 12px rgba(16, 24, 40, 0.1)'],
      ['shadow-lg', '0 12px 32px rgba(16, 24, 40, 0.14)'],
    ] as Array<[string, string]>)('%s = 契约值', (name, expected) => {
      expect(normalize(cssVar(rootBlock, name))).toBe(normalize(expected))
    })
  })

  describe('间距 Spacing（4px 基数）', () => {
    it.each([
      ['space-1', '4px'],
      ['space-2', '8px'],
      ['space-3', '12px'],
      ['space-4', '16px'],
      ['space-6', '24px'],
      ['space-8', '32px'],
    ] as Array<[string, string]>)('%s = 契约值', (name, expected) => {
      expect(cssVar(rootBlock, name)).toBe(expected)
    })
  })

  describe('动效 Motion', () => {
    it.each([
      ['motion-fast', '120ms'],
      ['motion-normal', '200ms'],
      ['motion-slow', '320ms'],
    ] as Array<[string, string]>)('%s = 契约值', (name, expected) => {
      expect(cssVar(rootBlock, name)).toBe(expected)
    })
    it('easing = cubic-bezier(.2,.8,.2,1)', () => {
      expect(normalize(cssVar(rootBlock, 'ease-standard'))).toBe(normalize('cubic-bezier(0.2, 0.8, 0.2, 1)'))
    })
  })

  describe('字体 Font', () => {
    it.each([
      ['font-size-xs', '12px'],
      ['font-size-md', '14px'],
      ['font-size-lg', '16px'],
    ] as Array<[string, string]>)('%s = 契约值', (name, expected) => {
      expect(cssVar(rootBlock, name)).toBe(expected)
    })
    it('font-sans = 系统 UI 字体栈', () => {
      const v = normalize(cssVar(rootBlock, 'font-sans'))
      expect(v).toBe(normalize("system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif"))
    })
    it('font-mono = 等宽字体栈', () => {
      const v = normalize(cssVar(rootBlock, 'font-mono'))
      expect(v).toBe(normalize("'JetBrains Mono', 'Cascadia Code', Consolas, monospace"))
    })
  })

  describe('tailwind.config.js 语义色映射', () => {
    it('语义强调色 DEFAULT = 契约值', () => {
      expectHex(configValue('primary', 'DEFAULT'), '#2f6fed')
      expectHex(configValue('primary', 'hover'), '#1e5bc9')
      expectHex(configValue('success', 'DEFAULT'), '#16a34a')
      expectHex(configValue('warning', 'DEFAULT'), '#f59e0b')
      expectHex(configValue('danger', 'DEFAULT'), '#dc2626')
      expectHex(configValue('info', 'DEFAULT'), '#0ea5e9')
    })
    it('中性色 / Surface 映射到 tokens.css 变量', () => {
      expect(configValue('app', 'DEFAULT')).toBe('var(--color-app)')
      expect(configValue('app', 'surface')).toBe('var(--color-app-surface)')
      expect(configValue('app', 'hover')).toBe('var(--color-app-hover)')
      expect(configValue('edge', 'subtle')).toBe('var(--color-edge-subtle)')
      expect(configValue('text', 'primary')).toBe('var(--color-text-primary)')
      expect(configValue('text', 'secondary')).toBe('var(--color-text-secondary)')
      expect(configValue('text', 'muted')).toBe('var(--color-text-muted)')
    })
  })

  describe('向后兼容别名（MC 既有引用）', () => {
    it('--popover-radius 复用契约圆角', () => {
      expect(cssVar(rootBlock, 'popover-radius')).toBe('var(--radius-md)')
    })
    it('--popover-shadow 复用契约阴影', () => {
      expect(cssVar(rootBlock, 'popover-shadow')).toBe('var(--card-shadow)')
      expect(cssVar(rootBlock, 'card-shadow')).toBe('var(--shadow-md)')
    })
  })
})

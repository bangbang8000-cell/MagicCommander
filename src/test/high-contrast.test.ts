import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * 4.1 V-2 高对比主题（high-contrast）WCAG AA 达标断言
 * 读取 tokens.css .high-contrast 块，按 WCAG 2.1 相对亮度公式计算对比度。
 * 阈值：正文 ≥ 7:1、次要 ≥ 4.5:1、弱化 ≥ 4.5:1、边界 ≥ 3:1、按钮白字 ≥ 4.5:1。
 */

const tokensCss = fs.readFileSync(path.join(process.cwd(), 'src/styles/tokens.css'), 'utf-8')
const hcBlock = tokensCss.match(/\.high-contrast\s*\{([\s\S]*?)\}/)?.[1] ?? ''
const rootBlock = tokensCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? ''

function cssVar(block: string, name: string): string {
  const m = block.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))
  if (!m) throw new Error(`tokens.css 缺少 --${name}`)
  return m[1].trim()
}

function parseHex(hex: string): [number, number, number] {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) throw new Error(`非法十六进制颜色: ${hex}`)
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** WCAG 对比度（1~21），四舍五入到 0.01 */
function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}

describe('V-2 高对比主题 WCAG AA 对比度', () => {
  const hc = {
    app: cssVar(hcBlock, 'color-app'),
    appSurface: cssVar(hcBlock, 'color-app-surface'),
    appHover: cssVar(hcBlock, 'color-app-hover'),
    edgeSubtle: cssVar(hcBlock, 'color-edge-subtle'),
    textPrimary: cssVar(hcBlock, 'color-text-primary'),
    textSecondary: cssVar(hcBlock, 'color-text-secondary'),
    textMuted: cssVar(hcBlock, 'color-text-muted'),
    primary: cssVar(hcBlock, 'color-primary'),
  }

  const WHITE = '#ffffff'

  it('正文 text-primary vs app 对比度 ≥ 7:1', () => {
    const c = contrast(hc.textPrimary, hc.app)
    expect(c, `text-primary ${hc.textPrimary} vs app ${hc.app} = ${c}:1`).toBeGreaterThanOrEqual(7)
  })

  it('次要文字 text-secondary vs app 对比度 ≥ 4.5:1', () => {
    const c = contrast(hc.textSecondary, hc.app)
    expect(c, `text-secondary ${hc.textSecondary} vs app ${hc.app} = ${c}:1`).toBeGreaterThanOrEqual(4.5)
  })

  it('弱化文字 text-muted vs app 对比度 ≥ 4.5:1', () => {
    const c = contrast(hc.textMuted, hc.app)
    expect(c, `text-muted ${hc.textMuted} vs app ${hc.app} = ${c}:1`).toBeGreaterThanOrEqual(4.5)
  })

  it('细分隔线 edge-subtle vs app 对比度 ≥ 3:1（组件边界 AA）', () => {
    const c = contrast(hc.edgeSubtle, hc.app)
    expect(c, `edge-subtle ${hc.edgeSubtle} vs app ${hc.app} = ${c}:1`).toBeGreaterThanOrEqual(3)
  })

  it('primary 按钮白字 vs primary 背景 ≥ 4.5:1', () => {
    const c = contrast(WHITE, hc.primary)
    expect(c, `白字 vs primary ${hc.primary} = ${c}:1`).toBeGreaterThanOrEqual(4.5)
  })

  it('hover 表面与 app 背景可区分（装饰性 hover ≥ 1.2）', () => {
    const c = contrast(hc.appHover, hc.app)
    expect(c).toBeGreaterThanOrEqual(1.2)
  })

  it('focus-ring 加宽为 3px', () => {
    expect(cssVar(hcBlock, 'focus-ring-width')).toBe('3px')
  })

  it('高对比主题存在 primary 加深（比普通 primary 更暗）', () => {
    const hcL = luminance(hc.primary)
    const normalL = luminance(cssVar(rootBlock, 'color-primary'))
    expect(hcL).toBeLessThan(normalL)
  })

  it('关键对比度数值符合预期（契约快照）', () => {
    expect(contrast(hc.textPrimary, hc.app)).toBeGreaterThanOrEqual(20)
    expect(contrast(hc.textSecondary, hc.app)).toBeGreaterThanOrEqual(14)
    expect(contrast(hc.textMuted, hc.app)).toBeGreaterThanOrEqual(7)
    expect(contrast(hc.edgeSubtle, hc.app)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(WHITE, hc.primary)).toBeGreaterThanOrEqual(8)
  })
})

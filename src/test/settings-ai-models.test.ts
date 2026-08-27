/**
 * AI-3：SettingsPanel 自动拉取模型 —— 纯函数单元测试
 * - shouldAutoFetchModels：保存配置后是否应自动拉取（已配 apiKey 的 provider）
 * - isAutoFetchThrottled：30s 节流窗口判断
 */
import { describe, it, expect } from 'vitest'
import {
  AUTO_FETCH_THROTTLE_MS,
  isAutoFetchThrottled,
  shouldAutoFetchModels,
} from '@/components/sidebar/SettingsPanel'

describe('shouldAutoFetchModels（保存配置后应自动拉取条件）', () => {
  it('已配 apiKey + baseUrl 的非本地 provider → 应拉取', () => {
    expect(shouldAutoFetchModels({ apiKey: 'sk-123', baseUrl: 'https://api.deepseek.com/v1', isOllama: false, isCustom: false })).toBe(true)
  })

  it('已配 apiKey 但 baseUrl 为空 → 不应拉取（无法请求）', () => {
    expect(shouldAutoFetchModels({ apiKey: 'sk-123', baseUrl: '', isOllama: false, isCustom: false })).toBe(false)
  })

  it('无 apiKey 的远程 provider → 不应拉取', () => {
    expect(shouldAutoFetchModels({ apiKey: '', baseUrl: 'https://api.deepseek.com/v1', isOllama: false, isCustom: false })).toBe(false)
  })

  it('ollama 有默认 baseUrl 但无 apiKey → 应拉取（本地模型无需 key）', () => {
    expect(shouldAutoFetchModels({ apiKey: '', baseUrl: 'http://localhost:11434/v1', isOllama: true, isCustom: false })).toBe(true)
  })

  it('ollama 无 baseUrl 也无 apiKey → 不应拉取', () => {
    expect(shouldAutoFetchModels({ apiKey: '', baseUrl: '', isOllama: true, isCustom: false })).toBe(false)
  })

  it('custom 已配 apiKey + baseUrl → 应拉取', () => {
    expect(shouldAutoFetchModels({ apiKey: 'sk-abc', baseUrl: 'https://custom.example/v1', isOllama: false, isCustom: true })).toBe(true)
  })

  it('custom 有 apiKey 但 baseUrl 为空 → 不应拉取', () => {
    expect(shouldAutoFetchModels({ apiKey: 'sk-abc', baseUrl: '', isOllama: false, isCustom: true })).toBe(false)
  })

  it('全部为空 → 不应拉取', () => {
    expect(shouldAutoFetchModels({ apiKey: '', baseUrl: '', isOllama: false, isCustom: false })).toBe(false)
  })
})

describe('isAutoFetchThrottled（30s 节流窗口）', () => {
  it('窗口常量应为 30 秒', () => {
    expect(AUTO_FETCH_THROTTLE_MS).toBe(30_000)
  })

  it('窗口内再次触发 → 节流（true）', () => {
    expect(isAutoFetchThrottled(1_000_000, 1_000_010, 30_000)).toBe(true)
    expect(isAutoFetchThrottled(1_000_000, 1_029_999, 30_000)).toBe(true)
  })

  it('超出窗口 → 允许拉取（false）', () => {
    expect(isAutoFetchThrottled(1_000_000, 1_030_001, 30_000)).toBe(false)
  })

  it('恰好等于窗口边界 → 允许拉取（false）', () => {
    expect(isAutoFetchThrottled(1_000_000, 1_030_000, 30_000)).toBe(false)
  })

  it('从未拉取过（lastFetchAt=0）→ 允许拉取（false）', () => {
    expect(isAutoFetchThrottled(0, 1_000_000, 30_000)).toBe(false)
  })
})

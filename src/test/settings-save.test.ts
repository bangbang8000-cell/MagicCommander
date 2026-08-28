/**
 * MC-401：SettingsPanel 保存流程 —— 保存提示判定纯函数单元测试
 * - resolveProviderSaveOutcome：configureProvider 失败（hub 运行中抛错）→ 显示真实错误、不显示已保存；
 *   hub 未运行（本地先行保存，后续 ensureAIHubReady 兜底同步）或 configure 成功 → 显示已保存
 */
import { describe, it, expect } from 'vitest'
import { resolveProviderSaveOutcome } from '@/components/sidebar/SettingsPanel'

describe('resolveProviderSaveOutcome（MC-401 保存提示判定）', () => {
  it('hub 运行中 configure 抛错 → 不显示已保存，返回真实错误信息', () => {
    const outcome = resolveProviderSaveOutcome(true, new Error('AI Hub 配置失败: HTTP 500 Internal Server Error'))
    expect(outcome.showSaved).toBe(false)
    expect(outcome.error).toMatch(/500/)
    expect(outcome.error).toMatch(/Internal Server Error/)
  })

  it('hub 运行中 configure 成功 → 显示已保存、无错误', () => {
    const outcome = resolveProviderSaveOutcome(true, null)
    expect(outcome.showSaved).toBe(true)
    expect(outcome.error).toBeNull()
  })

  it('hub 未运行（本地先行保存，后续兜底同步）→ 仍显示已保存', () => {
    const outcome = resolveProviderSaveOutcome(false, null)
    expect(outcome.showSaved).toBe(true)
    expect(outcome.error).toBeNull()
  })

  it('非 Error 异常值 → 字符串化兜底错误（仍不显示已保存）', () => {
    const outcome = resolveProviderSaveOutcome(true, { message: 'boom' })
    expect(outcome.showSaved).toBe(false)
    expect(outcome.error).toBeTruthy()
  })
})

/**
 * 5.4.11-F54-11-3：首启引导门控单测
 * - 未引导 → isOnboarded=false；标记后 → true（跨调用持久）
 * - localStorage 不可用 → 静默视为已引导（不崩溃、不打扰）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isOnboarded, markOnboarded, getOnboardedKey } from './onboardingGate'

describe('onboardingGate', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('首次未引导 → isOnboarded=false', () => {
    expect(isOnboarded()).toBe(false)
  })

  it('markOnboarded 后 isOnboarded=true 且持久', () => {
    expect(markOnboarded()).toBe(true)
    expect(isOnboarded()).toBe(true)
    expect(window.localStorage.getItem(getOnboardedKey())).toBe('1')
  })

  it('markOnboarded 幂等', () => {
    markOnboarded()
    markOnboarded()
    expect(window.localStorage.getItem(getOnboardedKey())).toBe('1')
  })

  it('localStorage 不可用 → isOnboarded 静默返回 true（不打扰用户）', () => {
    // 环境差异兜底：直接对 Storage.prototype 打桩（window.localStorage 可能是每次访问返回新实例）
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage disabled')
    })
    expect(isOnboarded()).toBe(true)
  })

  it('localStorage 不可用 → markOnboarded 返回 false 且不抛异常', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(markOnboarded()).toBe(false)
  })
})

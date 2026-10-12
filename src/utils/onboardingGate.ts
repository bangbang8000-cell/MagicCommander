/**
 * 5.4.11-F54-11-3：首启引导门控（纯函数，localStorage 安全封装）
 *
 * - 看过一次引导后不再弹出（与 AL OnboardingModal 的 ONBOARDED_KEY 语义对齐）
 * - localStorage 不可用/抛异常时：默认视为已引导（不打扰用户）
 */

const ONBOARDED_KEY = 'mc-onboarded-v1'

export function getOnboardedKey(): string {
  return ONBOARDED_KEY
}

/** 是否已完成首启引导（未完成 = 需要展示引导） */
export function isOnboarded(): boolean {
  try {
    return Boolean(window.localStorage.getItem(ONBOARDED_KEY))
  } catch {
    return true
  }
}

/** 标记引导已完成（幂等，返回是否写入成功） */
export function markOnboarded(): boolean {
  try {
    window.localStorage.setItem(ONBOARDED_KEY, '1')
    return true
  } catch {
    return false
  }
}

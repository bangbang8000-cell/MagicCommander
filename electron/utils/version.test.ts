/**
 * 47-a: 更新 fallback 依赖的版本比较工具（移植自 AL version.ts，electron 配置运行）
 * - isValidVersion：仅纯数字点分版本合法（拒绝 "unknown"/""/预发布标签）
 * - compareVersions：简单 semver 比较
 * - isVersionNewer：仅线上严格高于当前时才触发更新（相等/无效均不触发）
 */
import { describe, expect, it } from 'vitest'
import { isValidVersion, compareVersions, isVersionNewer } from './version'

describe('isValidVersion', () => {
  it('接受纯数字点分版本（含 v 前缀）', () => {
    expect(isValidVersion('4.6.0')).toBe(true)
    expect(isValidVersion('v4.6.0')).toBe(true)
    expect(isValidVersion('1.2')).toBe(true)
    expect(isValidVersion('0')).toBe(true)
  })

  it('拒绝空串 / undefined / null / 非纯数字', () => {
    expect(isValidVersion('')).toBe(false)
    expect(isValidVersion(undefined)).toBe(false)
    expect(isValidVersion(null)).toBe(false)
    expect(isValidVersion('unknown')).toBe(false)
    expect(isValidVersion('4.6.0-beta')).toBe(false)
    expect(isValidVersion('latest')).toBe(false)
  })
})

describe('compareVersions', () => {
  it('比较点分版本大小', () => {
    expect(compareVersions('4.6.0', '4.5.9')).toBe(1)
    expect(compareVersions('4.5.9', '4.6.0')).toBe(-1)
    expect(compareVersions('4.6.0', '4.6.0')).toBe(0)
    expect(compareVersions('4.6', '4.6.0')).toBe(0)
    expect(compareVersions('4.10.0', '4.9.0')).toBe(1)
  })
})

describe('isVersionNewer', () => {
  it('线上 > 当前 → true', () => {
    expect(isVersionNewer('4.7.0', '4.6.0')).toBe(true)
  })

  it('线上 = 当前 → false（不触发更新）', () => {
    expect(isVersionNewer('4.6.0', '4.6.0')).toBe(false)
  })

  it('线上 < 当前 → false', () => {
    expect(isVersionNewer('4.5.0', '4.6.0')).toBe(false)
  })

  it('任一版本无效 → false（保守策略，避免误报）', () => {
    expect(isVersionNewer('unknown', '4.6.0')).toBe(false)
    expect(isVersionNewer('4.7.0', 'unknown')).toBe(false)
    expect(isVersionNewer('', '4.6.0')).toBe(false)
    expect(isVersionNewer('4.7.0-beta', '4.6.0')).toBe(false)
  })
})

/**
 * 47-a/47-e：更新状态文案（含离线/直连 fallback 提示）纯函数测试
 */
import { describe, it, expect } from 'vitest'
import { updateStatusText } from '@/components/sidebar/SettingsPanel'

describe('updateStatusText（更新状态文案）', () => {
  it('available → 提示发现新版本', () => {
    expect(updateStatusText('newVersion')).toContain('发现新版本')
  })

  it('fallback 直连通道 → 提示直连下载', () => {
    expect(updateStatusText('newVersionFallback')).toContain('直连下载')
  })

  it('error → 离线/网络提示（友好引导）', () => {
    const text = updateStatusText('error')
    expect(text).toContain('检查失败')
    expect(text).toContain('网络')
  })

  it('latest → 已是最新', () => {
    expect(updateStatusText('latest')).toBe('已是最新版本')
  })

  it('空/未知状态 → 空字符串', () => {
    expect(updateStatusText('')).toBe('')
    expect(updateStatusText('weird')).toBe('')
  })
})

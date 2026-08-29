/**
 * MC-LOOP1：最大工具循环轮数 —— 前端 clamp 纯函数单元测试（退化轻量，不做组件渲染）
 * - clampToolLoopRounds：输入 clamp 到 [1, 10]，非法/缺失回退默认 5
 */
import { describe, it, expect } from 'vitest'
import {
  MAX_TOOL_LOOP_ROUNDS_DEFAULT,
  MAX_TOOL_LOOP_ROUNDS_MAX,
  MAX_TOOL_LOOP_ROUNDS_MIN,
  clampToolLoopRounds,
} from '@/components/sidebar/SettingsPanel'

describe('clampToolLoopRounds（最大工具循环轮数 clamp）', () => {
  it('默认值为 5', () => {
    expect(MAX_TOOL_LOOP_ROUNDS_DEFAULT).toBe(5)
  })

  it('下界：0 与负数 clamp 到 1', () => {
    expect(MAX_TOOL_LOOP_ROUNDS_MIN).toBe(1)
    expect(clampToolLoopRounds(0)).toBe(1)
    expect(clampToolLoopRounds(-5)).toBe(1)
  })

  it('上界：11 及以上 clamp 到 10', () => {
    expect(MAX_TOOL_LOOP_ROUNDS_MAX).toBe(10)
    expect(clampToolLoopRounds(11)).toBe(10)
    expect(clampToolLoopRounds(100)).toBe(10)
  })

  it('范围内有效值保持原值', () => {
    expect(clampToolLoopRounds(3)).toBe(3)
    expect(clampToolLoopRounds(5)).toBe(5)
    expect(clampToolLoopRounds(10)).toBe(10)
  })

  it('小数取整（四舍五入）', () => {
    expect(clampToolLoopRounds(3.4)).toBe(3)
    expect(clampToolLoopRounds(3.6)).toBe(4)
  })

  it('非法输入（NaN/Infinity）回退默认 5', () => {
    expect(clampToolLoopRounds(NaN)).toBe(5)
    expect(clampToolLoopRounds(Infinity)).toBe(5)
    expect(clampToolLoopRounds(-Infinity)).toBe(5)
  })
})

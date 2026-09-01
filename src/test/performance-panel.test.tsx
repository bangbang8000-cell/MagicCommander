/**
 * 4.2.0-42-e（F2-5 / S-6）：性能仪表盘 UI 单测（TDD）
 * - S6-1 面板渲染关键分区：内存 / 操作耗时 / 渲染长任务 / 基准对比
 * - S6-2 展示基准阈值（批量渲染 ≤90s / 单项目全量 ≤30s / 万行参数 ≤30s）
 * - S6-3 采集操作耗时并在面板展示
 * - S6-4 手动测量按钮记录 render 操作
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { PerformancePanel } from '@/components/panel/PerformancePanel'
import { recordOp, resetPerf, getOps } from '@/utils/perf'

beforeEach(() => {
  resetPerf()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PerformancePanel（S6-1/S6-2 面板展示）', () => {
  it('渲染关键分区（内存/操作耗时/渲染长任务/基准对比）', () => {
    render(<PerformancePanel />)
    expect(screen.getByText('性能')).toBeTruthy()
    expect(screen.getByText('内存')).toBeTruthy()
    expect(screen.getByText('操作耗时')).toBeTruthy()
    expect(screen.getByText('渲染长任务')).toBeTruthy()
    expect(screen.getByText(/性能基准/)).toBeTruthy()
  })

  it('展示 3 项基准阈值（对齐 scripts/bench_perf.py）', () => {
    render(<PerformancePanel />)
    expect(screen.getByText(/批量渲染 100 项目/)).toBeTruthy()
    expect(screen.getByText(/单项目全量渲染/)).toBeTruthy()
    expect(screen.getByText(/万行参数表数据准备/)).toBeTruthy()
    expect(screen.getByText('≤ 90.00s')).toBeTruthy()
    expect(screen.getAllByText('≤ 30.00s')).toHaveLength(2) // 单项目全量 + 万行参数
  })
})

describe('PerformancePanel（S6-3/S6-4 采集展示）', () => {
  it('采集操作耗时并在面板展示', () => {
    render(<PerformancePanel />)
    act(() => {
      recordOp('render', '大参数表准备', 123)
    })
    expect(screen.getByText('大参数表准备')).toBeTruthy()
    expect(screen.getByText('123ms')).toBeTruthy()
  })

  it('点击测量万行参数 → 记录 render 操作并展示', () => {
    render(<PerformancePanel />)
    fireEvent.click(screen.getByText('测量万行参数'))
    expect(screen.getByText('大参数表序列化(万行)')).toBeTruthy()
    expect(getOps('render').some((e) => e.label === '大参数表序列化(万行)')).toBe(true)
  })

  it('点击测量千文件批次 → 记录 render 操作', () => {
    render(<PerformancePanel />)
    fireEvent.click(screen.getByText('测量千文件批次'))
    expect(screen.getByText('批量渲染数据准备(1000文件)')).toBeTruthy()
  })
})

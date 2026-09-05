// ============================================================
// 5.0.6（C）机房 3D 计划视图 纯函数单测（网格布局 / 机柜推导 / 热力色）
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  buildRoomModel,
  gridDims,
  gridPosition,
  gridOriginOffset,
  powerToHeatColor,
  rackPowerPercent,
  CABINET_U,
  RACK_SPACING_X,
  RACK_SPACING_Z,
  type RoomModel,
  type RackGridPlacement,
} from '@/utils/room3d'

describe('gridDims / gridPosition（方形网格布局）', () => {
  it('N=1 → 1x1', () => {
    expect(gridDims(1)).toEqual({ cols: 1, rows: 1 })
  })

  it('N=4 → 2x2', () => {
    expect(gridDims(4)).toEqual({ cols: 2, rows: 2 })
  })

  it('N=5 → 3x2（cols=ceil(sqrt5)=3）', () => {
    expect(gridDims(5)).toEqual({ cols: 3, rows: 2 })
  })

  it('N=0 → 空', () => {
    expect(gridDims(0)).toEqual({ cols: 0, rows: 0 })
  })

  it('按行主序填充分配 (col,row) 且 x/z 按间距递增', () => {
    const p0 = gridPosition(0, 4)
    const p1 = gridPosition(1, 4)
    const p2 = gridPosition(2, 4)
    const p3 = gridPosition(3, 4)
    expect([p0.col, p0.row]).toEqual([0, 0])
    expect([p1.col, p1.row]).toEqual([1, 0])
    expect([p2.col, p2.row]).toEqual([0, 1])
    expect([p3.col, p3.row]).toEqual([1, 1])
    // 同一行的 z 相同，x 以间距递增
    expect(p1.z).toBe(p0.z)
    expect(p1.x - p0.x).toBeCloseTo(RACK_SPACING_X)
    expect(p3.z - p0.z).toBeCloseTo(RACK_SPACING_Z)
  })

  it('gridOriginOffset 使网格以原点居中', () => {
    const off = gridOriginOffset(2, 2)
    expect(off.offsetX).toBeCloseTo(RACK_SPACING_X / 2)
    expect(off.offsetZ).toBeCloseTo(RACK_SPACING_Z / 2)
    const first = gridPosition(0, 4)
    const { offsetX } = gridOriginOffset(2, 2)
    expect(first.x).toBeCloseTo(0 - offsetX) // 居中后首柜 x 为负
  })
})

describe('buildRoomModel（机柜与设备推导）', () => {
  it('无 rack 的设备被忽略', () => {
    const m = buildRoomModel([{ name: 'a' }, { name: 'b', rack: 1 }])
    expect(m.racks.length).toBe(1)
    expect(m.cabinets.length).toBe(1)
  })

  it('不同 rack 排入独立机柜，位置来自网格', () => {
    const m = buildRoomModel([
      { rack: 2, name: 'x' },
      { rack: 1, name: 'y' },
    ])
    expect(m.racks.length).toBe(2)
    // rack 编号升序：1 在前
    expect(m.racks.map((r) => r.rackNumber)).toEqual([1, 2])
    const seen = new Map(m.racks.map((r) => [r.rackNumber, r]))
    // 2 柜 → 2 列 1 行，x 以间距排开、z 相同
    expect(seen.get(2)!.x - seen.get(1)!.x).toBeCloseTo(RACK_SPACING_X)
    expect(seen.get(2)!.z).toBe(seen.get(1)!.z)
  })

  it('同一 rack 内设备自下而上分配 U 位', () => {
    const m = buildRoomModel([
      { rack: 1, name: 'A' },
      { rack: 1, name: 'B' },
      { rack: 1, name: 'C' },
    ])
    const ones = m.cabinets.filter((c) => c.rackNumber === 1)
    expect(ones.length).toBe(3)
    expect(ones[0].uPlacement.u).toBe(1)
    expect(ones[1].uPlacement.u).toBe(2)
    expect(ones[2].uPlacement.u).toBe(3)
    expect(ones.every((c) => c.uPlacement.heightU === 1)).toBe(true)
  })

  it('设备数超过机柜容量时截断不越界', () => {
    const many = Array.from({ length: CABINET_U + 5 }, (_, i) => ({ rack: 9, name: `d${i}` }))
    const m = buildRoomModel(many)
    const ones = m.cabinets.filter((c) => c.rackNumber === 9)
    expect(ones.length).toBe(CABINET_U)
    expect(ones.at(-1)!.uPlacement.u).toBeLessThanOrEqual(CABINET_U)
  })

  it('返回结构与类型契约一致', () => {
    const m: RoomModel = buildRoomModel([{ rack: 7, name: 'A' }])
    const rack: RackGridPlacement = m.racks[0]
    expect(typeof rack.x).toBe('number')
    expect(typeof rack.z).toBe('number')
    expect(typeof rack.row).toBe('number')
    expect(typeof rack.col).toBe('number')
  })
})

describe('powerToHeatColor（热力色边界）', () => {
  it('低载为绿色系', () => {
    expect(powerToHeatColor(0)).toBe('#22c55e')
    const c = powerToHeatColor(0.2)
    // 0.2 为绿→黄之间，仍以绿色通道为主
    expect(hexGreen(c)).toBeGreaterThan(hexRed(c))
  })

  it('>=0.8 为红色', () => {
    expect(powerToHeatColor(0.8)).toBe('#ef4444')
    expect(powerToHeatColor(1)).toBe('#dc2626')
  })

  it('0.5~0.8 为黄/橙到红之间', () => {
    const c = powerToHeatColor(0.5)
    expect(c.startsWith('#')).toBe(true)
    expect(c).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('越界输入被裁剪', () => {
    expect(powerToHeatColor(-5)).toBe('#22c55e')
    expect(powerToHeatColor(99)).toBe('#dc2626')
    expect(powerToHeatColor(NaN)).toBe('#22c55e')
  })

  it('单调性：负载越高绿色递减（越偏红）', () => {
    const g1 = hexGreen(powerToHeatColor(0))
    const g2 = hexGreen(powerToHeatColor(0.5))
    const g3 = hexGreen(powerToHeatColor(0.8))
    const g4 = hexGreen(powerToHeatColor(1))
    expect(g2).toBeLessThanOrEqual(g1)
    expect(g3).toBeLessThan(g2)
    expect(g4).toBeLessThan(g3)
  })
})

describe('rackPowerPercent（稳定哈希）', () => {
  it('返回 0.3~0.95 且确定性', () => {
    const v = rackPowerPercent(3)
    expect(v).toBeGreaterThanOrEqual(0.3)
    expect(v).toBeLessThanOrEqual(0.95)
    expect(rackPowerPercent(3)).toBe(v)
  })

  it('不同机柜一般不同', () => {
    const a = rackPowerPercent(1)
    const b = rackPowerPercent(2)
    expect(a).not.toBe(b)
  })
})

function hexRed(hex: string): number {
  return parseInt(hex.slice(1, 3), 16)
}

function hexGreen(hex: string): number {
  return parseInt(hex.slice(3, 5), 16)
}
// ============================================================
// 5.0.6（C）机房 3D 计划视图 —— 纯数据推导 util。
// 输入：AIDC 计划 deviceList 的 rack 信息；输出：生成的机房模型
// （机柜网格布局 + 每柜设备 U 位分配）。
// 纯函数：不触碰 window.electron / React / three（CI 单测安全基线），
// 全部导出供单元测试复用。
// ============================================================

/** 输入：计划 deviceList 中与机柜相关的字段 */
export interface RackDevice {
  rack?: number
  name?: string
}

/** 机柜网格安放位置（原点左上，x 水平、z 纵向） */
export interface RackGridPlacement {
  rackNumber: number
  row: number
  col: number
  x: number
  z: number
}

/** 单台设备在机柜内的 U 位安放 */
export interface UPlacement {
  /** 起始 U（自下而上，从 1 开始） */
  u: number
  /** 占用高度（U），1-2U */
  heightU: number
}

/** 机柜内的设备 */
export interface CabinetDevice {
  rackNumber: number
  name?: string
  uPlacement: UPlacement
}

/** 生成的机房模型 */
export interface RoomModel {
  racks: RackGridPlacement[]
  cabinets: CabinetDevice[]
}

/** 标准机柜 U 位总数（假定 42U） */
export const CABINET_U = 42
/** 每个设备默认占用高度（U），保持简单 1U */
export const DEFAULT_DEVICE_U = 1
/** 机柜 x 间距（含通道） */
export const RACK_SPACING_X = 1.4
/** 机柜 z 间距（含通道） */
export const RACK_SPACING_Z = 1.4

/** 是否允许设备本身体积超限时压缩（上限 2U）——这里固定 1U，保留常量便于调整 */
export const MAX_DEVICE_U = 2

/** 机柜到平面中心原点偏移（使网格以坐标原点居中） */
export function gridOriginOffset(cols: number, rows: number): { offsetX: number; offsetZ: number } {
  return {
    offsetX: ((cols - 1) * RACK_SPACING_X) / 2,
    offsetZ: ((rows - 1) * RACK_SPACING_Z) / 2,
  }
}

/**
 * 给定去重后的机柜数量，计算方形网格的列数/行数（cols=ceil(sqrt(N))）与居中偏移。
 */
export function gridDims(count: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 0, rows: 0 }
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  return { cols, rows }
}

/**
 * 把续数字序号映射为该机柜在网格中的 (col, row)，按行主序填充。
 * 位置以网格左上为首个机柜、居中于原点。
 */
export function gridPosition(index: number, count: number): { row: number; col: number; x: number; z: number } {
  const { cols, rows } = gridDims(count)
  if (cols === 0) return { row: 0, col: 0, x: 0, z: 0 }
  const col = index % cols
  const row = Math.floor(index / cols)
  const { offsetX, offsetZ } = gridOriginOffset(cols, rows)
  return {
    row,
    col,
    x: col * RACK_SPACING_X - offsetX,
    z: row * RACK_SPACING_Z - offsetZ,
  }
}

/**
 * 主函数：由 deviceList（可能含无 rack 的设备）推导机房模型。
 * - 不同 rack 编号排入方形网格（含通道间距）；
 * - 同一 rack 的设备自下而上分配 U 位（默认 1U/台）。
 * 无 rack 的设备将被忽略（不占用机柜）。
 */
export function buildRoomModel(devices: RackDevice[]): RoomModel {
  const byRack = new Map<number, RackDevice[]>()
  for (const d of devices) {
    if (d.rack == null) continue
    if (!byRack.has(d.rack)) byRack.set(d.rack, [])
    byRack.get(d.rack)!.push(d)
  }
  const rackNumbers = [...byRack.keys()].sort((a, b) => a - b)

  const racks: RackGridPlacement[] = []
  const cabinets: CabinetDevice[] = []
  rackNumbers.forEach((rackNumber, idx) => {
    const { row, col, x, z } = gridPosition(idx, rackNumbers.length)
    racks.push({ rackNumber, row, col, x, z })

    let cursor = 1
    for (const dev of byRack.get(rackNumber)!) {
      const heightU = Math.min(Math.max(DEFAULT_DEVICE_U, 1), MAX_DEVICE_U)
      const u = cursor
      cabinets.push({ rackNumber, name: dev.name, uPlacement: { u, heightU } })
      cursor += heightU
      if (cursor > CABINET_U) {
        // 超出机柜容量后不再安放后续设备，避免越界
        break
      }
    }
  })

  return { racks, cabinets }
}

// ── 功率 → 热力色（绿→黄→红，与 AL 一致） ─────────────────────────

type Rgb = [number, number, number]

const GREEN: Rgb | number = [0x22, 0xc5, 0x5e]
const YELLOW: Rgb | number = 0xeab308
const AMBER: Rgb | number = 0xf59e0b
const RED: Rgb | number = 0xef4444
const DEEP_RED: Rgb | number = 0xdc2626

function toRgb(hex: Rgb | number): Rgb {
  if (typeof hex === 'number') return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
  return hex
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function hex(rgb: Rgb): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function interpolate(from: Rgb | number, to: Rgb | number, t: number): string {
  const a = toRgb(from)
  const b = toRgb(to)
  return hex([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)])
}

/**
 * 功率百分比（0..1）→ 热力色：
 * - <0.5  绿
 * - 0.5~0.8 黄/橙（黄→红 渐变）
 * - >=0.8 红（红→深红 渐变）
 * 越界输入会被裁剪到 [0,1]。
 */
export function powerToHeatColor(percent: number): string {
  if (!Number.isFinite(percent)) return '#22c55e'
  const p = Math.max(0, Math.min(1, percent))
  if (p >= 0.8) return interpolate(RED, DEEP_RED, (p - 0.8) / 0.2)
  if (p >= 0.5) return interpolate(AMBER, RED, (p - 0.5) / 0.3)
  return interpolate(GREEN, YELLOW, p / 0.5)
}

/**
 * 以机柜编号生成一个稳定的代表性功率百分比（0.3~0.95）。
 * 纯哈希，保证同一机柜颜色稳定、不同机柜有区分度。
 */
export function rackPowerPercent(rackNumber: number): number {
  const h = Math.abs(Math.imul(rackNumber, 0x9e3779b1) >>> 0) % 100 / 100
  return 0.3 + h * 0.65 // 0.3 ~ 0.95
}
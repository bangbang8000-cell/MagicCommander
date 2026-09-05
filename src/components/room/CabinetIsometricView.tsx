// ============================================================
// 5.0.6（C）机房 3D 计划视图 —— 机柜等轴测（SVG）查看器。
// 独立重实现等轴测投影函数（isoProject / rotateBy / zoomBy），
// 不依赖任何外部/AL 源文件。渲染机柜正面（含设备 U 槽）、顶面、右侧面。
// 提供 左/右旋转、放大/缩小/重置、SVG/PNG 导出。
// ============================================================
import React, { useMemo, useRef, useState } from 'react'
import { powerToHeatColor, rackPowerPercent, CABINET_U, type CabinetDevice } from '@/utils/room3d'

/** 机柜世界尺寸（示意单位，垂直 42U 约为 2 米，故取较高比例） */
const CAB_W = 2.4
const CAB_D = 1.6
const CAB_H = CABINET_U * 1.1 // 42U → ~46 单位

/** 每 U 的单位高度（正比于真实 42U≈2m） */
const U_HEIGHT = CAB_H / CABINET_U

const CENTER = { x: CAB_W / 2, y: CAB_H / 2, z: CAB_D / 2 }

// ── 本地等轴测数学（30° iso 投影） ──────────────────────────────
type P3 = { x: number; y: number; z: number }

/** 绕 Y 轴旋转（度），一线 3D 到 2D 前处理 */
function rotateBy(w: P3, angleDeg: number): P3 {
  const c = CENTER
  const dx = w.x - c.x
  const dz = w.z - c.z
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: c.x + dx * cos - dz * sin,
    y: w.y,
    z: c.z + dx * sin + dz * cos,
  }
}

/** 30° 等轴测投影（x,z 平面 => 2D） */
function isoProject(w: P3): { x: number; y: number } {
  return {
    x: (w.x - w.z) * 0.866,
    y: (w.x + w.z) * 0.5 - w.y,
  }
}

/** 缩放（关于原点/视口锚点） */
function zoomBy(p: { x: number; y: number }, factor: number, about: { x: number; y: number }): { x: number; y: number } {
  return { x: about.x + (p.x - about.x) * factor, y: about.y + (p.y - about.y) * factor }
}

/** 完整管线：旋转 → 投影 → 缩放 → 平移 */
function project(w: P3, angleDeg: number, zoom: number, ox: number, oy: number): [number, number] {
  const rotated = rotateBy(w, angleDeg)
  const proj = isoProject(rotated)
  const scaled = zoomBy(proj, zoom, { x: 0, y: 0 })
  return [scaled.x + ox, scaled.y + oy]
}

/** 四边形 polygon points 字符串 */
function poly(points: P3[], angleDeg: number, zoom: number, ox: number, oy: number): string {
  return points
    .map((w) => project(w, angleDeg, zoom, ox, oy).map((n) => n.toFixed(2)).join(','))
    .join(' ')
}

// 三个立面角点（世界坐标，绕中心旋转后投影）
const FRONT = [
  { x: 0, y: 0, z: 0 },
  { x: CAB_W, y: 0, z: 0 },
  { x: CAB_W, y: CAB_H, z: 0 },
  { x: 0, y: CAB_H, z: 0 },
] as P3[]

const TOP = [
  { x: 0, y: CAB_H, z: 0 },
  { x: CAB_W, y: CAB_H, z: 0 },
  { x: CAB_W, y: CAB_H, z: CAB_D },
  { x: 0, y: CAB_H, z: CAB_D },
] as P3[]

const RIGHT = [
  { x: CAB_W, y: 0, z: 0 },
  { x: CAB_W, y: 0, z: CAB_D },
  { x: CAB_W, y: CAB_H, z: CAB_D },
  { x: CAB_W, y: CAB_H, z: 0 },
] as P3[]

/** 设备 U 槽四边形（机柜正面，自下而上） */
function deviceQuad(dev: { uPlacement: { u: number; heightU: number } }): P3[] {
  const y0 = (dev.uPlacement.u - 1) * U_HEIGHT
  const y1 = y0 + dev.uPlacement.heightU * U_HEIGHT
  return [
    { x: 0, y: y0, z: 0 },
    { x: CAB_W, y: y0, z: 0 },
    { x: CAB_W, y: y1, z: 0 },
    { x: 0, y: y1, z: 0 },
  ]
}

export function CabinetIsometricView({
  rackNumber,
  devices,
}: {
  rackNumber: number
  devices: CabinetDevice[]
}) {
  const [angle, setAngle] = useState(30)
  const [zoom, setZoom] = useState(1)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const VIEW_W = 320
  const VIEW_H = 320
  const ox = VIEW_W / 2
  const oy = VIEW_H / 2

  const heat = powerToHeatColor(rackPowerPercent(rackNumber))
  // 预投影用于估算包围盒（自动适配缩放）
  const bounds = useMemo(() => {
    const pts = [...FRONT, ...TOP, ...RIGHT].map((w) => {
      const r = rotateBy(w, angle)
      return isoProject(r)
    })
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    }
  }, [angle])

  const fitZoom = Math.min(
    0.75 * (VIEW_W / Math.max(1, bounds.maxX - bounds.minX)),
    0.75 * (VIEW_H / Math.max(1, bounds.maxY - bounds.minY)),
  )

  const exportSvg = () => {
    const svg = svgRef.current
    if (!svg) return
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cabinet-R${rackNumber}.svg`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const exportPng = () => {
    const svg = svgRef.current
    if (!svg) return
    const xml = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = VIEW_W * 2
      canvas.height = VIEW_H * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `cabinet-R${rackNumber}.png`
      a.click()
    }
    img.src = url
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-2xs text-gray-500">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          机柜 R{rackNumber}
          <span className="ml-2 text-gray-400">设备 {devices.length} 台</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="px-1.5 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={() => setAngle((a) => a - 15)}
            title="左转"
          >
            ↺
          </button>
          <button
            type="button"
            className="px-1.5 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={() => setAngle((a) => a + 15)}
            title="右转"
          >
            ↻
          </button>
          <button
            type="button"
            className="px-1.5 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={() => setZoom((z) => z * 1.15)}
            title="放大"
          >
            +
          </button>
          <button
            type="button"
            className="px-1.5 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={() => setZoom((z) => Math.max(0.1, z / 1.15))}
            title="缩小"
          >
            −
          </button>
          <button
            type="button"
            className="px-1.5 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={() => {
              setAngle(30)
              setZoom(1)
            }}
            title="重置"
          >
            ⟲
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        width={VIEW_W}
        height={VIEW_H}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
        style={{ background: 'var(--bg,#fff)' }}
      >
        {/* 顶面 */}
        <polygon points={poly(TOP, angle, fitZoom * zoom, ox, oy)} fill="transparent" stroke="#94a3b8" strokeWidth={0.5} />
        {/* 右侧面 */}
        <polygon points={poly(RIGHT, angle, fitZoom * zoom, ox, oy)} fill="#e2e8f0" stroke="#64748b" strokeWidth={0.5} />
        {/* 正面 */}
        <polygon points={poly(FRONT, angle, fitZoom * zoom, ox, oy)} fill="#f8fafc" stroke="#334155" strokeWidth={1} />
        {/* 设备 U 槽（正面，自下而上填充热力色） */}
        {devices.map((d, i) => (
          <polygon
            key={`${d.name ?? 'dev'}${i}`}
            points={poly(deviceQuad(d), angle, fitZoom * zoom, ox, oy)}
            fill={heat}
            stroke="#ffffff"
            strokeWidth={0.3}
            opacity={0.85}
          />
        ))}
        {/* 轴标签 */}
        <text x={ox} y={14} textAnchor="middle" fontSize={9} fill="#94a3b8">
          机柜正面（U 位自下而上）
        </text>
      </svg>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={exportSvg}
          className="px-2 py-0.5 rounded text-2xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          导出 SVG
        </button>
        <button
          type="button"
          onClick={exportPng}
          className="px-2 py-0.5 rounded text-2xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          导出 PNG
        </button>
      </div>
    </div>
  )
}
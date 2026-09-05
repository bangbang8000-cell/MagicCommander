// ============================================================
// 5.0.6（C）机房 3D 计划视图 —— WebGL 只读查看器。
// 基于 react-three-fiber + drei 渲染机柜网格；点击机柜回调选中。
// 数据来自 room3d.ts 纯推导（本组件不做数据逻辑）。
// ============================================================
import React, { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Html } from '@react-three/drei'
import { powerToHeatColor, rackPowerPercent, type RoomModel } from '@/utils/room3d'

/** 机柜盒体尺寸（按真实 42U 机柜 1:1 缩放） */
const CABINET_W = 0.6
const CABINET_D = 1.0
const CABINET_H = 2.0

/** 挂在机柜上方的 DOM 文字标签 */
function CabinetLabel({ rackNumber }: { rackNumber: number }) {
  return (
    <Html position={[0, CABINET_H + 0.18, 0]} center distanceFactor={12} className="pointer-events-none select-none">
      <span className="bg-black/55 text-white text-[10px] px-1 rounded whitespace-nowrap">R{rackNumber}</span>
    </Html>
  )
}

export function Room3DView({
  model,
  selectedRack,
  onCabinetSelect,
}: {
  model: RoomModel
  selectedRack?: number | null
  onCabinetSelect?: (rackNumber: number) => void
}) {
  const colorByRack = useMemo(() => {
    const m = new Map<number, string>()
    for (const r of model.racks) m.set(r.rackNumber, powerToHeatColor(rackPowerPercent(r.rackNumber)))
    return m
  }, [model.racks])

  if (model.racks.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
        当前计划无带机柜（rack）编号的设备
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ position: [6, 6, 8], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[6, 10, 6]} intensity={1.2} castShadow />
        <Grid
          args={[16, 16]}
          cellSize={1}
          cellThickness={0.6}
          cellColor="#64748b"
          sectionSize={4}
          sectionThickness={1}
          sectionColor="#94a3b8"
          fadeDistance={30}
          infiniteGrid
        />
        {model.racks.map((r) => (
          <group key={r.rackNumber} position={[r.x, 0, r.z]}>
            <mesh
              position={[0, CABINET_H / 2, 0]}
              castShadow
              onClick={(e) => {
                e.stopPropagation()
                onCabinetSelect?.(r.rackNumber)
              }}
            >
              <boxGeometry args={[CABINET_W, CABINET_H, CABINET_D]} />
              <meshStandardMaterial
                color={colorByRack.get(r.rackNumber) ?? '#22c55e'}
                emissive={selectedRack === r.rackNumber ? '#ffffff' : '#000000'}
                emissiveIntensity={selectedRack === r.rackNumber ? 0.35 : 0.05}
              />
            </mesh>
            <CabinetLabel rackNumber={r.rackNumber} />
          </group>
        ))}
        <OrbitControls enablePan enableZoom makeDefault />
      </Canvas>
      <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-500 bg-white/70 dark:bg-gray-900/70 rounded px-2 py-1">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: powerToHeatColor(0.3) }} /> 低载
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: powerToHeatColor(0.6) }} /> 中载
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: powerToHeatColor(0.9) }} /> 高载
        </span>
        <span className="opacity-60">拖拽旋转 · 滚轮缩放 · 点击机柜查看</span>
      </div>
    </div>
  )
}
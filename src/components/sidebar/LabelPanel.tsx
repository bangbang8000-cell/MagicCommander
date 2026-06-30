import React, { useState, useCallback } from 'react'
import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { useUIStore } from '@/stores/ui.store'
import { Button } from '@/components/ui/Button'
import { Printer, Settings, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { LabelPrintConfig } from '@/types/render'
import { DEFAULT_LABEL_CONFIG } from '@/types/render'

// M4: LabelPrintConfig 已移至 src/types/render.ts，统一使用

export const LabelPanel = React.memo(function LabelPanel() {
  const projects = useProjectStore((s) => s.projects)
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const selectProject = useProjectStore((s) => s.selectProject)
  const isLabelPrinting = useRenderStore((s) => s.isLabelPrinting)
  const labelPrint = useRenderStore((s) => s.labelPrint)
  const labelDelete = useRenderStore((s) => s.labelDelete)
  const progress = useRenderStore((s) => s.progress)
  const currentMessage = useRenderStore((s) => s.currentMessage)
  const errors = useRenderStore((s) => s.errors)
  const isDark = useUIStore((s) => s.isDark)
  const [showConfig, setShowConfig] = useState(false)
  const [printConfig, setPrintConfig] = useState<LabelPrintConfig>(DEFAULT_LABEL_CONFIG)

  // M4: 打印时将配置参数透传给后端
  const handlePrint = useCallback(async () => {
    if (!selectedProject) return
    await labelPrint([String(selectedProject.id)], printConfig)
  }, [selectedProject, labelPrint, printConfig])

  const handleDelete = useCallback(async () => {
    if (!selectedProject) return
    const ok = await window.electron.dialog.showConfirm({
      title: '确认删除标签',
      message: '确定要删除当前项目的所有标签吗？',
    })
    if (ok) await labelDelete([String(selectedProject.id)])
  }, [selectedProject, labelDelete])

  return (
    <div className="flex flex-col h-full overflow-auto p-3 space-y-3">
      <div className="space-y-1.5">
        <h4 className={clsx('text-xs font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>选择项目</h4>
        <select
          value={selectedProject?.name || ''}
          onChange={(e) => {
            const found = projects.find((p) => p.name === e.target.value)
            if (found) selectProject(found)
          }}
          className={clsx('w-full text-xs px-2 py-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-primary-500', isDark ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900')}
        >
          <option value="">请选择项目...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Button variant="primary" size="sm" icon={<Printer size={12} />} onClick={handlePrint} disabled={!selectedProject || isLabelPrinting} loading={isLabelPrinting} className="w-full justify-start">
          打印标签
        </Button>
        <Button variant="secondary" size="sm" icon={<Trash2 size={12} />} onClick={handleDelete} disabled={!selectedProject} className="w-full justify-start">
          删除标签
        </Button>
        <Button variant="secondary" size="sm" icon={<Settings size={12} />} onClick={() => setShowConfig(!showConfig)} className="w-full justify-start">
          打印设置
        </Button>
      </div>

      {showConfig && (
        <div className={clsx('border rounded p-2 space-y-2', isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200')}>
          <h5 className={clsx('text-[10px] font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>打印配置</h5>
          <div className="space-y-1.5 text-[10px]">
            <div className="flex items-center gap-1">
              <label className={clsx('w-14 shrink-0', isDark ? 'text-gray-400' : 'text-gray-600')}>纸张</label>
              <select value={printConfig.format} onChange={(e) => setPrintConfig((p) => ({ ...p, format: e.target.value as any }))} className={clsx('flex-1 px-1 py-0.5 border rounded focus:outline-none focus:ring-1 focus:ring-primary-500', isDark ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900')}>
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="custom">自定义</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <label className={clsx('w-14 shrink-0', isDark ? 'text-gray-400' : 'text-gray-600')}>方向</label>
              <select value={printConfig.orientation} onChange={(e) => setPrintConfig((p) => ({ ...p, orientation: e.target.value as any }))} className={clsx('flex-1 px-1 py-0.5 border rounded focus:outline-none focus:ring-1 focus:ring-primary-500', isDark ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900')}>
                <option value="portrait">纵向</option>
                <option value="landscape">横向</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <label className={clsx('w-14 shrink-0', isDark ? 'text-gray-400' : 'text-gray-600')}>每页数</label>
              <input type="number" value={printConfig.labelsPerPage} onChange={(e) => setPrintConfig((p) => ({ ...p, labelsPerPage: parseInt(e.target.value) || 1 }))} min={1} max={32} className={clsx('flex-1 px-1 py-0.5 border rounded w-16 focus:outline-none focus:ring-1 focus:ring-primary-500', isDark ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900')} />
            </div>
          </div>
        </div>
      )}

      {isLabelPrinting && (
        <div className="space-y-1">
          <div className={clsx('flex justify-between text-[10px]', isDark ? 'text-gray-300' : 'text-gray-600')}>
            <span>{currentMessage || '打印中...'}</span>
            <span>{progress}%</span>
          </div>
          <div className={clsx('w-full rounded-full h-1', isDark ? 'bg-gray-700' : 'bg-gray-200')}>
            <div className="bg-blue-600 h-1 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <div key={i} className={clsx('text-[10px] px-2 py-1 rounded', isDark ? 'text-red-300 bg-red-900/40' : 'text-red-600 bg-red-50')}>{err}</div>
          ))}
        </div>
      )}
    </div>
  )
})

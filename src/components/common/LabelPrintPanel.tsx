import { useState, useCallback } from 'react'
import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Printer, Settings, FileText, Download, Trash2, Info } from 'lucide-react'

interface LabelPrintConfig {
  format: 'A4' | 'A5' | 'custom'
  orientation: 'portrait' | 'landscape'
  labelsPerPage: number
  labelSize: {
    width: number
    height: number
  }
  margins: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

const DEFAULT_CONFIG: LabelPrintConfig = {
  format: 'A4',
  orientation: 'portrait',
  labelsPerPage: 8,
  labelSize: {
    width: 90,
    height: 60
  },
  margins: {
    top: 10,
    bottom: 10,
    left: 10,
    right: 10
  }
}

export function LabelPrintPanel() {
  const projects = useProjectStore((s) => s.projects)
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const selectProject = useProjectStore((s) => s.selectProject)
  const isLabelPrinting = useRenderStore((s) => s.isLabelPrinting)
  const labelPrint = useRenderStore((s) => s.labelPrint)
  const labelDelete = useRenderStore((s) => s.labelDelete)
  const progress = useRenderStore((s) => s.progress)
  const currentMessage = useRenderStore((s) => s.currentMessage)
  const errors = useRenderStore((s) => s.errors)
  const config = useRenderStore((s) => s.config)
  const setConfig = useRenderStore((s) => s.setConfig)
  const [showPrintConfig, setShowPrintConfig] = useState(false)
  const [printConfig, setPrintConfig] = useState<LabelPrintConfig>(DEFAULT_CONFIG)
  const [showLabelPreview, setShowLabelPreview] = useState(false)
  const [previewLabels, setPreviewLabels] = useState<string[]>([])

  const handlePrint = useCallback(async () => {
    if (!selectedProject) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: '提示',
        message: '请选择要打印标签的项目'
      })
      return
    }

    await labelPrint([String(selectedProject.id)])
  }, [selectedProject, labelPrint])

  const handleDeleteLabels = useCallback(async () => {
    if (!selectedProject) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: '提示',
        message: '请选择要删除标签的项目'
      })
      return
    }

    const ok = await window.electron.dialog.showConfirm({
      title: '确认删除标签',
      message: '确定要删除当前项目的所有标签吗？此操作不可恢复。'
    })

    if (ok) {
      await labelDelete([String(selectedProject.id)])
    }
  }, [selectedProject, labelDelete])

  const handleGeneratePreview = useCallback(async () => {
    if (!selectedProject) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: '提示',
        message: '请选择要预览标签的项目'
      })
      return
    }

    try {
      const projectPath = await window.electron.app.getPath('workspace')
      const projectDir = selectedProject.name
      const labelsPath = `${projectPath}/${projectDir}/excel/label.xlsx`
      
      if (!await window.electron.file.exists(labelsPath)) {
        await window.electron.dialog.showMessage({
          type: 'error',
          title: '文件不存在',
          message: '标签文件不存在，请先导入标签数据'
        })
        return
      }

      const excelData = await window.electron.file.readExcel(labelsPath, 'labels') as { rows?: Array<Record<string, unknown>> }
      const labels = (excelData.rows ?? []).map((row) => String(row['serial_number'] || row['label_id'] || '')).filter(Boolean)
      setPreviewLabels(labels)
      setShowLabelPreview(true)
    } catch (error) {
      console.error('获取标签预览失败:', error)
      await window.electron.dialog.showMessage({
        type: 'error',
        title: '预览失败',
        message: `获取标签预览失败: ${(error as Error).message}`
      })
    }
  }, [selectedProject])

  const handleConfigChange = useCallback((field: string, value: any) => {
    setPrintConfig(prev => ({
      ...prev,
      [field]: value
    }))
  }, [])

  const handleSizeChange = useCallback((field: 'width' | 'height', value: number) => {
    setPrintConfig(prev => ({
      ...prev,
      labelSize: {
        ...prev.labelSize,
        [field]: value
      }
    }))
  }, [])

  const handleMarginChange = useCallback((field: 'top' | 'bottom' | 'left' | 'right', value: number) => {
    setPrintConfig(prev => ({
      ...prev,
      margins: {
        ...prev.margins,
        [field]: value
      }
    }))
  }, [])

  return (
    <div className="bg-white border-b border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Printer size={16} className="text-primary-600" />
          标签打印功能
        </h3>
        <Button
          variant="secondary"
          icon={<Settings size={14} />}
          onClick={() => setShowPrintConfig(!showPrintConfig)}
        >
          打印设置
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedProject?.name || ''}
          onChange={(e) => {
            const found = projects.find(p => p.name === e.target.value)
            if (found) selectProject(found)
          }}
          className="text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">请选择项目...</option>
          {projects.map(project => (
            <option key={project.id} value={project.name}>{project.name}</option>
          ))}
        </select>

        <Button
          variant="primary"
          icon={<Printer size={14} />}
          onClick={handlePrint}
          disabled={!selectedProject || isLabelPrinting}
          loading={isLabelPrinting}
        >
          打印标签
        </Button>

        <Button
          variant="secondary"
          icon={<FileText size={14} />}
          onClick={handleGeneratePreview}
          disabled={!selectedProject}
        >
          预览标签
        </Button>

        <Button
          variant="secondary"
          icon={<Download size={14} />}
          onClick={() => {}}
          disabled={!selectedProject}
        >
          导出标签
        </Button>

        <Button
          variant="secondary"
          icon={<Trash2 size={14} />}
          onClick={handleDeleteLabels}
          disabled={!selectedProject}
        >
          删除标签
        </Button>
      </div>

      {showPrintConfig && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
          <h4 className="text-xs font-semibold text-gray-700">打印配置</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-medium text-gray-700 mb-1">纸张格式</label>
              <select
                value={printConfig.format}
                onChange={(e) => handleConfigChange('format', e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded"
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="custom">自定义</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-gray-700 mb-1">纸张方向</label>
              <select
                value={printConfig.orientation}
                onChange={(e) => handleConfigChange('orientation', e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded"
              >
                <option value="portrait">纵向</option>
                <option value="landscape">横向</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-gray-700 mb-1">每页标签数</label>
              <input
                type="number"
                value={printConfig.labelsPerPage}
                onChange={(e) => handleConfigChange('labelsPerPage', parseInt(e.target.value))}
                min={1}
                max={32}
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
            </div>

            <div>
              <label className="block font-medium text-gray-700 mb-1">标签尺寸 (mm)</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  value={printConfig.labelSize.width}
                  onChange={(e) => handleSizeChange('width', parseInt(e.target.value))}
                  min={10}
                  max={200}
                  placeholder="宽"
                  className="flex-1 px-2 py-1 border border-gray-300 rounded"
                />
                <input
                  type="number"
                  value={printConfig.labelSize.height}
                  onChange={(e) => handleSizeChange('height', parseInt(e.target.value))}
                  min={10}
                  max={200}
                  placeholder="高"
                  className="flex-1 px-2 py-1 border border-gray-300 rounded"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-300 pt-2 mt-2">
            <h5 className="text-xs font-medium text-gray-700 mb-2">页边距 (mm)</h5>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="block text-gray-600 mb-1">上边距</label>
                <input
                  type="number"
                  value={printConfig.margins.top}
                  onChange={(e) => handleMarginChange('top', parseInt(e.target.value))}
                  min={0}
                  max={50}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">下边距</label>
                <input
                  type="number"
                  value={printConfig.margins.bottom}
                  onChange={(e) => handleMarginChange('bottom', parseInt(e.target.value))}
                  min={0}
                  max={50}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">左边距</label>
                <input
                  type="number"
                  value={printConfig.margins.left}
                  onChange={(e) => handleMarginChange('left', parseInt(e.target.value))}
                  min={0}
                  max={50}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">右边距</label>
                <input
                  type="number"
                  value={printConfig.margins.right}
                  onChange={(e) => handleMarginChange('right', parseInt(e.target.value))}
                  min={0}
                  max={50}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isLabelPrinting && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-sm text-blue-800">
            <span className="font-medium">{currentMessage || '正在打印标签...'}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
          <div className="text-xs font-semibold text-red-800 flex items-center gap-1">
            <Info size={12} /> 打印错误
          </div>
          {errors.map((error, index) => (
            <div key={index} className="text-xs text-red-600">{error}</div>
          ))}
        </div>
      )}

      <Modal
        open={showLabelPreview}
        onClose={() => setShowLabelPreview(false)}
        title="标签预览"
        footer={
          <Button onClick={() => setShowLabelPreview(false)}>
            关闭
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            共 <span className="font-semibold">{previewLabels.length}</span> 个标签
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
            {previewLabels.map((label, index) => (
              <div
                key={index}
                className="bg-white border border-gray-200 rounded-lg p-3 text-center hover:shadow-sm transition-shadow"
              >
                <div className="text-xs text-gray-600 mb-1">标签 {index + 1}</div>
                <div className="font-medium text-sm">{label}</div>
              </div>
            ))}
          </div>
          
          {previewLabels.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              没有可预览的标签数据
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

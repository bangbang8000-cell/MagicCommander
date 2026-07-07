import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation(['common', 'project'])
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
        title: t('project:label.dialogTitle'),
        message: t('project:label.selectProjectToPrint')
      })
      return
    }

    await labelPrint([String(selectedProject.id)])
  }, [selectedProject, labelPrint, t])

  const handleDeleteLabels = useCallback(async () => {
    if (!selectedProject) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: t('project:label.dialogTitle'),
        message: t('project:label.selectProjectToDelete')
      })
      return
    }

    const ok = await window.electron.dialog.showConfirm({
      title: t('project:label.confirmDeleteLabel'),
      message: t('project:label.confirmDeleteLabelFullMessage')
    })

    if (ok) {
      await labelDelete([String(selectedProject.id)])
    }
  }, [selectedProject, labelDelete, t])

  const handleGeneratePreview = useCallback(async () => {
    if (!selectedProject) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: t('project:label.dialogTitle'),
        message: t('project:label.selectProjectToPreview')
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
          title: t('project:label.fileNotFound'),
          message: t('project:label.labelFileNotFound')
        })
        return
      }

      const excelData = await window.electron.file.readExcel(labelsPath, 'labels') as { rows?: Array<Record<string, unknown>> }
      const labels = (excelData.rows ?? []).map((row) => String(row['serial_number'] || row['label_id'] || '')).filter(Boolean)
      setPreviewLabels(labels)
      setShowLabelPreview(true)
    } catch (error) {
      console.error(t('project:label.getPreviewFailed'), error)
      await window.electron.dialog.showMessage({
        type: 'error',
        title: t('project:label.previewFailed'),
        message: t('project:label.getPreviewFailedMessage', { message: (error as Error).message })
      })
    }
  }, [selectedProject, t])

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
          {t('project:label.labelPrintFeature')}
        </h3>
        <Button
          variant="secondary"
          icon={<Settings size={14} />}
          onClick={() => setShowPrintConfig(!showPrintConfig)}
        >
          {t('project:label.printSettings')}
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
          <option value="">{t('project:label.selectProjectPlaceholder')}</option>
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
          {t('project:label.printLabels')}
        </Button>

        <Button
          variant="secondary"
          icon={<FileText size={14} />}
          onClick={handleGeneratePreview}
          disabled={!selectedProject}
        >
          {t('project:label.previewLabels')}
        </Button>

        <Button
          variant="secondary"
          icon={<Download size={14} />}
          onClick={() => {}}
          disabled={!selectedProject}
        >
          {t('project:label.exportLabels')}
        </Button>

        <Button
          variant="secondary"
          icon={<Trash2 size={14} />}
          onClick={handleDeleteLabels}
          disabled={!selectedProject}
        >
          {t('project:label.deleteLabels')}
        </Button>
      </div>

      {showPrintConfig && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
          <h4 className="text-xs font-semibold text-gray-700">{t('project:label.printConfig')}</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-medium text-gray-700 mb-1">{t('project:label.paperFormat')}</label>
              <select
                value={printConfig.format}
                onChange={(e) => handleConfigChange('format', e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded"
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="custom">{t('project:label.custom')}</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-gray-700 mb-1">{t('project:label.orientation')}</label>
              <select
                value={printConfig.orientation}
                onChange={(e) => handleConfigChange('orientation', e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded"
              >
                <option value="portrait">{t('project:label.portrait')}</option>
                <option value="landscape">{t('project:label.landscape')}</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-gray-700 mb-1">{t('project:label.labelsPerPage')}</label>
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
              <label className="block font-medium text-gray-700 mb-1">{t('project:label.labelSizeUnit')}</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  value={printConfig.labelSize.width}
                  onChange={(e) => handleSizeChange('width', parseInt(e.target.value))}
                  min={10}
                  max={200}
                  placeholder={t('project:label.width')}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded"
                />
                <input
                  type="number"
                  value={printConfig.labelSize.height}
                  onChange={(e) => handleSizeChange('height', parseInt(e.target.value))}
                  min={10}
                  max={200}
                  placeholder={t('project:label.height')}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-300 pt-2 mt-2">
            <h5 className="text-xs font-medium text-gray-700 mb-2">{t('project:label.margin')}</h5>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="block text-gray-600 mb-1">{t('project:label.marginTop')}</label>
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
                <label className="block text-gray-600 mb-1">{t('project:label.marginBottom')}</label>
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
                <label className="block text-gray-600 mb-1">{t('project:label.marginLeft')}</label>
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
                <label className="block text-gray-600 mb-1">{t('project:label.marginRight')}</label>
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
            <span className="font-medium">{currentMessage || t('project:label.printing')}</span>
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
            <Info size={12} /> {t('project:label.printError')}
          </div>
          {errors.map((error, index) => (
            <div key={index} className="text-xs text-red-600">{error}</div>
          ))}
        </div>
      )}

      <Modal
        open={showLabelPreview}
        onClose={() => setShowLabelPreview(false)}
        title={t('project:label.labelPreview')}
        footer={
          <Button onClick={() => setShowLabelPreview(false)}>
            {t('common:app.close')}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            {t('project:label.totalLabels', { count: previewLabels.length })}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
            {previewLabels.map((label, index) => (
              <div
                key={index}
                className="bg-white border border-gray-200 rounded-lg p-3 text-center hover:shadow-sm transition-shadow"
              >
                <div className="text-xs text-gray-600 mb-1">{t('project:label.labelIndex', { index: index + 1 })}</div>
                <div className="font-medium text-sm">{label}</div>
              </div>
            ))}
          </div>
          
          {previewLabels.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {t('project:label.noPreviewData')}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { Button } from '@/components/ui/Button'
import { Play, FileCode, RefreshCw, FolderOpen, FileCheck, Printer, Trash2, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { useState, useEffect } from 'react'
import clsx from 'clsx'

export function RenderPanel() {
  const { t } = useTranslation()
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const projects = useProjectStore((s) => s.projects)
  const selectedProjectIds = useRenderStore((s) => s.selectedProjectIds)
  const setSelectedIds = useRenderStore((s) => s.setSelectedIds)
  const isRendering = useRenderStore((s) => s.isRendering)
  const isLabelPrinting = useRenderStore((s) => s.isLabelPrinting)
  const renderProject = useRenderStore((s) => s.renderProject)
  const renderYaml = useRenderStore((s) => s.renderYaml)
  const renderProjectSn = useRenderStore((s) => s.renderProjectSn)
  const renderYamlSn = useRenderStore((s) => s.renderYamlSn)
  const labelPrint = useRenderStore((s) => s.labelPrint)
  const labelDelete = useRenderStore((s) => s.labelDelete)
  const deleteOutput = useRenderStore((s) => s.deleteOutput)
  const deleteOutputSn = useRenderStore((s) => s.deleteOutputSn)
  const deleteYaml = useRenderStore((s) => s.deleteYaml)
  const deleteYamlSn = useRenderStore((s) => s.deleteYamlSn)
  const config = useRenderStore((s) => s.config)
  const setConfig = useRenderStore((s) => s.setConfig)
  const progress = useRenderStore((s) => s.progress)
  const currentMessage = useRenderStore((s) => s.currentMessage)
  const errors = useRenderStore((s) => s.errors)
  const openFile = useEditorStore((s) => s.openFile)
  const isDark = useUIStore((s) => s.isDark)

  const [projectInfo, setProjectInfo] = useState<any>(null)
  const [showProjectInfo, setShowProjectInfo] = useState(true)

  useEffect(() => {
    if (selectedProject) {
      window.electron.project.parameters(String(selectedProject.id)).then(setProjectInfo).catch(() => setProjectInfo(null))
    } else {
      setProjectInfo(null)
    }
  }, [selectedProject])

  const toggleProject = (id: number) => {
    const idStr = String(id)
    if (selectedProjectIds.includes(idStr)) {
      setSelectedIds(selectedProjectIds.filter((n) => n !== idStr))
    } else {
      setSelectedIds([...selectedProjectIds, idStr])
    }
  }

  const handleRender = async () => {
    if (selectedProjectIds.length === 0) return
    if (config.renderType === 'project') {
      if (config.outputFormat === 'device_name') await renderProject(selectedProjectIds)
      else await renderProjectSn(selectedProjectIds)
    } else {
      if (config.outputFormat === 'device_name') await renderYaml(selectedProjectIds)
      else await renderYamlSn(selectedProjectIds)
    }
  }

  const handleLabelPrint = async () => {
    if (selectedProjectIds.length === 0) return
    await labelPrint(selectedProjectIds)
  }

  const handleLabelDelete = async () => {
    if (selectedProjectIds.length === 0) return
    await labelDelete(selectedProjectIds)
  }

  const handleDeleteOutput = async () => {
    if (selectedProjectIds.length === 0) return
    if (config.outputFormat === 'device_name') await deleteOutput(selectedProjectIds)
    else await deleteOutputSn(selectedProjectIds)
  }

  const handleDeleteYaml = async () => {
    if (selectedProjectIds.length === 0) return
    if (config.outputFormat === 'device_name') await deleteYaml(selectedProjectIds)
    else await deleteYamlSn(selectedProjectIds)
  }

  const openParaConfig = () => {
    if (!selectedProject) return
    openFile({
      id: '',
      title: 'para.xlsx',
      filePath: 'para.xlsx',
      fileType: 'excel',
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      isDirty: false,
    })
  }

  return (
    <div className={clsx('flex flex-col h-full overflow-auto', isDark ? 'bg-gray-900' : 'bg-white')}>
      <div className="p-3 space-y-3">
        {selectedProject && (
          <div className="space-y-1.5">
            <button
              onClick={() => setShowProjectInfo(!showProjectInfo)}
              className={clsx(
                'w-full flex items-center gap-1 text-xs font-semibold',
                isDark ? 'text-gray-200' : 'text-gray-700'
              )}
            >
              {showProjectInfo ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              <FolderOpen size={12} />
              <span>{t('common:renderPanel.projectInfo')}</span>
              <span className={clsx('text-[10px] font-normal', isDark ? 'text-gray-400' : 'text-gray-500')}>
                {selectedProject.name}
              </span>
            </button>
            {showProjectInfo && (
              <div className={clsx('rounded p-2 text-xs space-y-1', isDark ? 'bg-gray-800' : 'bg-gray-50')}>
                <div className="flex justify-between">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{t('common:renderPanel.name')}</span>
                  <span className="font-medium">{selectedProject.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>ID</span>
                  <span className="font-medium">{selectedProject.id}</span>
                </div>
                {projectInfo && (
                  <>
                    <div className="flex justify-between">
                      <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{t('common:renderPanel.path')}</span>
                      <span className={clsx('font-medium text-[10px] truncate max-w-[140px]', isDark ? 'text-gray-300' : 'text-gray-600')}>
                        {projectInfo.path}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {projectInfo.structure?.excel && (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]">Excel</span>
                      )}
                      {projectInfo.structure?.templates && (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">{t('common:renderPanel.template')}</span>
                      )}
                      {projectInfo.structure?.para && (
                        <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px]">{t('common:renderPanel.parameter')}</span>
                      )}
                      {projectInfo.structure?.output && (
                        <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px]">{t('common:renderPanel.output')}</span>
                      )}
                      {projectInfo.structure?.yaml && (
                        <span className="px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded text-[10px]">{t('common:renderPanel.yaml')}</span>
                      )}
                    </div>
                  </>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<FileCode size={12} />}
                  onClick={openParaConfig}
                  className="w-full justify-start mt-2"
                >
                  {t('common:renderPanel.openParaXlsx')}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
            <Play size={12} /> {t('common:renderPanel.renderConfig')}
          </h4>
          <div className="flex flex-col gap-1">
            <div className={clsx('flex items-center gap-1 text-[10px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
              <span>{t('common:renderPanel.format')}:</span>
              <select
                value={config.outputFormat}
                onChange={(e) => setConfig({ outputFormat: e.target.value as 'device_name' | 'device_sn' })}
                className={clsx(
                  'text-[10px] border rounded px-1 py-0.5 flex-1',
                  isDark ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
                )}
              >
                <option value="device_name">{t('common:renderPanel.deviceName')}</option>
                <option value="device_sn">{t('common:renderPanel.deviceSN')}</option>
              </select>
            </div>
            <div className={clsx('flex items-center gap-1 text-[10px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
              <span>{t('common:renderPanel.type')}:</span>
              <select
                value={config.renderType}
                onChange={(e) => setConfig({ renderType: e.target.value as 'project' | 'yaml' })}
                className={clsx(
                  'text-[10px] border rounded px-1 py-0.5 flex-1',
                  isDark ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
                )}
              >
                <option value="project">{t('common:renderPanel.projectConfig')}</option>
                <option value="yaml">{t('common:renderPanel.yamlFile')}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <h4 className={clsx('text-xs font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
            {t('common:renderPanel.selectProjects')}
            <span className={clsx('font-normal ms-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
              ({selectedProjectIds.length}/{projects.length})
            </span>
          </h4>
          <div className={clsx('flex flex-wrap gap-1 max-h-32 overflow-auto rounded p-1', isDark ? 'bg-gray-800' : 'bg-gray-50')}>
            {projects.length === 0 ? (
              <span className={clsx('text-[10px]', isDark ? 'text-gray-400' : 'text-gray-500')}>{t('common:renderPanel.noProjects')}</span>
            ) : (
              projects.map((p) => {
                const selected = selectedProjectIds.includes(String(p.id))
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleProject(p.id)}
                    className={clsx(
                      'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                      selected
                        ? isDark
                          ? 'bg-primary-900/40 border-primary-700 text-primary-200'
                          : 'bg-primary-100 border-primary-400 text-primary-700'
                        : isDark
                          ? 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-primary-300'
                    )}
                  >
                    {p.name}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Button
            variant="primary"
            size="sm"
            icon={<Play size={12} />}
            onClick={handleRender}
            disabled={isRendering || selectedProjectIds.length === 0}
            loading={isRendering}
            className="w-full justify-start"
          >
            {t('common:renderPanel.executeRender')}
          </Button>
        </div>

        <div className={clsx('border-t pt-2 space-y-1.5', isDark ? 'border-gray-700' : 'border-gray-200')}>
          <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
            <Printer size={12} /> {t('common:renderPanel.labelOperations')}
          </h4>
          <div className="flex flex-col gap-1">
            <Button
              variant="primary"
              size="sm"
              icon={<Printer size={12} />}
              onClick={handleLabelPrint}
              disabled={isRendering || selectedProjectIds.length === 0}
              loading={isLabelPrinting}
              className="w-full justify-start"
            >
              {t('menu:labelPrint')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Trash2 size={12} />}
              onClick={handleLabelDelete}
              disabled={isRendering || selectedProjectIds.length === 0}
              className="w-full justify-start"
            >
              {t('common:renderPanel.deleteLabel')}
            </Button>
          </div>
        </div>

        <div className={clsx('border-t pt-2 space-y-1.5', isDark ? 'border-gray-700' : 'border-gray-200')}>
          <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
            <RefreshCw size={12} /> {t('common:renderPanel.cleanupOperations')}
          </h4>
          <div className="flex flex-col gap-1">
            <Button
              variant="secondary"
              size="sm"
              icon={<FileCheck size={12} />}
              onClick={handleDeleteOutput}
              disabled={isRendering || selectedProjectIds.length === 0}
              className="w-full justify-start"
            >
              {t('common:renderPanel.deleteOutput')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<FileCode size={12} />}
              onClick={handleDeleteYaml}
              disabled={isRendering || selectedProjectIds.length === 0}
              className="w-full justify-start"
            >
              {t('common:renderPanel.deleteYaml')}
            </Button>
          </div>
        </div>

        {(isRendering || isLabelPrinting) && (
          <div className="space-y-1">
            <div className={clsx('flex justify-between text-[10px]', isDark ? 'text-gray-300' : 'text-gray-600')}>
              <span className="truncate">{currentMessage || t('common:renderPanel.processing')}</span>
              <span>{progress}%</span>
            </div>
            <div className={clsx('w-full rounded-full h-1', isDark ? 'bg-gray-700' : 'bg-gray-200')}>
              <div
                className="bg-primary-600 h-1 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="space-y-1">
            {errors.map((err, i) => (
              <div
                key={i}
                className={clsx('text-[10px] px-2 py-1 rounded', isDark ? 'text-red-300 bg-red-900/40' : 'text-red-600 bg-red-50')}
              >
                {err}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
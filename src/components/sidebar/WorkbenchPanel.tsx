import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { useEditorStore, type EditorTab } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { Button } from '@/components/ui/Button'
import { Play, FolderOpen, FileCode, RefreshCw, FileOutput, Settings, ExternalLink } from 'lucide-react'
import { showSuccess, showError } from '@/components/ui/Toast'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import React, { useState, useEffect } from 'react'

export const WorkbenchPanel = React.memo(function WorkbenchPanel() {
  const { t } = useTranslation('project')
  const projects = useProjectStore((s) => s.projects)
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const selectProject = useProjectStore((s) => s.selectProject)
  const selectedProjectIds = useRenderStore((s) => s.selectedProjectIds)
  const setSelectedIds = useRenderStore((s) => s.setSelectedIds)
  const isRendering = useRenderStore((s) => s.isRendering)
  const renderProject = useRenderStore((s) => s.renderProject)
  const renderYaml = useRenderStore((s) => s.renderYaml)
  const renderProjectSn = useRenderStore((s) => s.renderProjectSn)
  const renderYamlSn = useRenderStore((s) => s.renderYamlSn)
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

  useEffect(() => {
    if (selectedProject) {
      window.electron.project
        .parameters(String(selectedProject.id))
        .then(setProjectInfo)
        .catch(() => setProjectInfo(null))
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

  const handleRenderSingle = async () => {
    if (!selectedProject) return
    const ids = [String(selectedProject.id)]
    if (config.renderType === 'project') {
      if (config.outputFormat === 'device_name') await renderProject(ids)
      else await renderProjectSn(ids)
    } else {
      if (config.outputFormat === 'device_name') await renderYaml(ids)
      else await renderYamlSn(ids)
    }
  }

  const handleRenderBatch = async () => {
    if (selectedProjectIds.length === 0) return
    if (config.renderType === 'project') {
      if (config.outputFormat === 'device_name') await renderProject(selectedProjectIds)
      else await renderProjectSn(selectedProjectIds)
    } else {
      if (config.outputFormat === 'device_name') await renderYaml(selectedProjectIds)
      else await renderYamlSn(selectedProjectIds)
    }
  }

  const handleDeleteOutput = async () => {
    const ids = selectedProjectIds.length > 0 ? selectedProjectIds : selectedProject ? [String(selectedProject.id)] : []
    if (ids.length === 0) return
    if (config.outputFormat === 'device_name') await deleteOutput(ids)
    else await deleteOutputSn(ids)
  }

  const handleDeleteYaml = async () => {
    const ids = selectedProjectIds.length > 0 ? selectedProjectIds : selectedProject ? [String(selectedProject.id)] : []
    if (ids.length === 0) return
    if (config.outputFormat === 'device_name') await deleteYaml(ids)
    else await deleteYamlSn(ids)
  }

  const openParaConfig = () => {
    if (!selectedProject) return
    const tab: EditorTab = {
      id: `para-${selectedProject.id}`,
      title: 'para.xlsx',
      filePath: 'para.xlsx',
      fileType: 'excel',
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      isDirty: false,
    }
    openFile(tab)
  }

  const openInFolder = async () => {
    if (!projectInfo?.path) {
      showError(t('workbench.cannotGetProjectPath'))
      return
    }
    try {
      await window.electron.shell.showItemInFolder(projectInfo.path)
      showSuccess(t('workbench.openedInExplorer'))
    } catch (err) {
      showError(t('workbench.openFailed', { message: (err as Error).message }))
    }
  }

  return (
    <div className={clsx('flex flex-col h-full overflow-auto', isDark ? 'bg-gray-900' : 'bg-white')}>
      <div className="p-3 space-y-3">
        <div className="space-y-1.5">
          <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
            <FolderOpen size={12} /> {t('workbench.currentProject')}
          </h4>
          {selectedProject ? (
            <div className={clsx('rounded p-2 text-xs space-y-1 border', isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200')}>
              <div className="flex justify-between">
                <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{t('workbench.name')}</span>
                <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>{selectedProject.name}</span>
              </div>
              <div className="flex justify-between">
                <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{t('workbench.id')}</span>
                <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>{selectedProject.id}</span>
              </div>
              {projectInfo && (
                <>
                  <div className="flex justify-between">
                    <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{t('workbench.path')}</span>
                    <span className={clsx('font-medium text-[10px] truncate max-w-[140px]', isDark ? 'text-gray-200' : 'text-gray-700')}>{projectInfo.path}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {projectInfo.structure?.excel && <span className={clsx('px-1.5 py-0.5 rounded text-[10px]', isDark ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-700')}>{t('workbench.excel')}</span>}
                    {projectInfo.structure?.templates && <span className={clsx('px-1.5 py-0.5 rounded text-[10px]', isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700')}>{t('workbench.template')}</span>}
                    {projectInfo.structure?.para && <span className={clsx('px-1.5 py-0.5 rounded text-[10px]', isDark ? 'bg-purple-900/40 text-purple-300' : 'bg-purple-100 text-purple-700')}>{t('workbench.para')}</span>}
                    {projectInfo.structure?.output && <span className={clsx('px-1.5 py-0.5 rounded text-[10px]', isDark ? 'bg-orange-900/40 text-orange-300' : 'bg-orange-100 text-orange-700')}>{t('workbench.output')}</span>}
                    {projectInfo.structure?.yaml && <span className={clsx('px-1.5 py-0.5 rounded text-[10px]', isDark ? 'bg-cyan-900/40 text-cyan-300' : 'bg-cyan-100 text-cyan-700')}>{t('workbench.yaml')}</span>}
                  </div>
                  <button
                    onClick={openInFolder}
                    className={clsx('flex items-center gap-1 px-2 py-1 mt-2 text-[10px] rounded transition-colors', isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100')}
                    title={t('workbench.openInExplorer')}
                  >
                    <ExternalLink size={10} /> {t('workbench.openFolder')}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={isDark ? 'text-xs text-gray-500' : 'text-xs text-gray-400'}>{t('workbench.selectProjectInExplorer')}</div>
          )}
        </div>

        <div className="space-y-1.5">
          <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
            <Settings size={12} /> {t('workbench.paraConfig')}
          </h4>
          <Button variant="secondary" size="sm" icon={<FileCode size={12} />} onClick={openParaConfig} disabled={!selectedProject} className="w-full justify-start">
            {t('workbench.openParaXlsx')}
          </Button>
        </div>

        <div className={clsx('border-t pt-3 space-y-1.5', isDark ? 'border-gray-700' : 'border-gray-200')}>
          <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
            <Play size={12} /> {t('workbench.renderConfig')}
          </h4>
          <div className={clsx('flex items-center gap-1 text-[10px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
            <span>{t('workbench.format')}</span>
            <select
              value={config.outputFormat}
              onChange={(e) => setConfig({ outputFormat: e.target.value as 'device_name' | 'device_sn' })}
              className={clsx('text-[10px] border rounded px-1 py-0.5 flex-1', isDark ? 'border-gray-600 bg-gray-800 text-gray-200' : 'border-gray-300 text-gray-700')}
            >
              <option value="device_name">{t('workbench.deviceName')}</option>
              <option value="device_sn">{t('workbench.deviceSn')}</option>
            </select>
          </div>
          <div className={clsx('flex items-center gap-1 text-[10px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
            <span>{t('workbench.type')}</span>
            <select
              value={config.renderType}
              onChange={(e) => setConfig({ renderType: e.target.value as 'project' | 'yaml' })}
              className={clsx('text-[10px] border rounded px-1 py-0.5 flex-1', isDark ? 'border-gray-600 bg-gray-800 text-gray-200' : 'border-gray-300 text-gray-700')}
            >
              <option value="project">{t('workbench.projectConfig')}</option>
              <option value="yaml">{t('workbench.yamlFile')}</option>
            </select>
          </div>
        </div>

        <div className={clsx('border-t pt-3 space-y-1.5', isDark ? 'border-gray-700' : 'border-gray-200')}>
          <h4 className={clsx('text-xs font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>{t('workbench.batchProjects')}</h4>
          <div className={clsx('flex flex-wrap gap-1 max-h-20 overflow-auto', isDark ? 'text-gray-300' : 'text-gray-700')}>
            {projects.length === 0 ? (
              <span className={isDark ? 'text-[10px] text-gray-500' : 'text-[10px] text-gray-400'}>{t('explorer.noProjects')}</span>
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
                          ? 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-500'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400',
                    )}
                  >
                    {p.name}
                  </button>
                )
              })
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Button variant="primary" size="sm" icon={<Play size={12} />} onClick={handleRenderBatch} disabled={isRendering || selectedProjectIds.length === 0} loading={isRendering} className="w-full justify-start">
              {t('workbench.batchRender', { count: selectedProjectIds.length })}
            </Button>
            <Button variant="secondary" size="sm" icon={<Play size={12} />} onClick={handleRenderSingle} disabled={isRendering || !selectedProject} className="w-full justify-start">
              {t('workbench.renderCurrentOnly')}
            </Button>
          </div>
        </div>

        <div className={clsx('border-t pt-3 space-y-1.5', isDark ? 'border-gray-700' : 'border-gray-200')}>
          <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
            <RefreshCw size={12} /> {t('workbench.cleanup')}
          </h4>
          <div className="flex flex-col gap-1">
            <Button variant="secondary" size="sm" icon={<FileOutput size={12} />} onClick={handleDeleteOutput} disabled={isRendering} className="w-full justify-start">
              {t('render.deleteOutput')}
            </Button>
            <Button variant="secondary" size="sm" icon={<FileCode size={12} />} onClick={handleDeleteYaml} disabled={isRendering} className="w-full justify-start">
              {t('render.deleteYaml')}
            </Button>
          </div>
        </div>

        {isRendering && (
          <div className={clsx('space-y-1 border-t pt-2', isDark ? 'border-gray-700' : 'border-gray-200')}>
            <div className={clsx('flex justify-between text-[10px]', isDark ? 'text-gray-400' : 'text-gray-600')}>
              <span className="truncate">{currentMessage || t('workbench.processing')}</span>
              <span>{progress}%</span>
            </div>
            <div className={clsx('w-full rounded-full h-1', isDark ? 'bg-gray-700' : 'bg-gray-200')}>
              <div className="bg-primary-600 h-1 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className={clsx('space-y-1 border-t pt-2', isDark ? 'border-gray-700' : 'border-gray-200')}>
            {errors.map((err, i) => (
              <div key={i} className={clsx('text-[10px] px-2 py-1 rounded', isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-600')}>{err}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

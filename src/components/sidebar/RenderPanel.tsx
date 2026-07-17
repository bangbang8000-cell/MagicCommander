import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { Button } from '@/components/ui/Button'
import {
  Play,
  FileCode,
  RefreshCw,
  FolderOpen,
  FileCheck,
  Printer,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
  FileDown,
  Settings,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import type { LabelPrintConfig } from '@/types/render'
import { DEFAULT_LABEL_CONFIG } from '@/types/render'

type RenderTab = 'config' | 'label' | 'cleanup'

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
  const labelMarkdown = useRenderStore((s) => s.labelMarkdown)
  const labelPdf = useRenderStore((s) => s.labelPdf)
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

  const [activeTab, setActiveTab] = useState<RenderTab>('config')
  const [projectInfo, setProjectInfo] = useState<any>(null)
  const [showProjectInfo, setShowProjectInfo] = useState(true)
  const [showPrintConfig, setShowPrintConfig] = useState(false)
  const [printConfig, setPrintConfig] = useState<LabelPrintConfig>(DEFAULT_LABEL_CONFIG)

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

  // === 渲染配置 handlers ===
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

  // === 打印标签 handlers ===
  const handleLabelMarkdown = useCallback(async () => {
    if (selectedProjectIds.length === 0) return
    await labelMarkdown(selectedProjectIds, printConfig)
  }, [selectedProjectIds, labelMarkdown, printConfig])

  const handleLabelPrint = useCallback(async () => {
    if (selectedProjectIds.length === 0) return
    await labelPrint(selectedProjectIds, printConfig)
  }, [selectedProjectIds, labelPrint, printConfig])

  const handleLabelPdf = useCallback(async () => {
    if (selectedProjectIds.length === 0) return
    await labelPdf(selectedProjectIds, printConfig)
  }, [selectedProjectIds, labelPdf, printConfig])

  const handleLabelDelete = useCallback(async () => {
    if (selectedProjectIds.length === 0) return
    const ok = await window.electron.dialog.showConfirm({
      title: t('project:label.confirmDeleteLabel'),
      message: t('project:label.confirmDeleteLabelMessage'),
    })
    if (ok) await labelDelete(selectedProjectIds)
  }, [selectedProjectIds, labelDelete, t])

  // === 清理文件 handlers ===
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

  const isProcessing = isRendering || isLabelPrinting

  const tabs: { id: RenderTab; labelKey: string }[] = [
    { id: 'config', labelKey: 'common:renderPanel.tabs.config' },
    { id: 'label', labelKey: 'common:renderPanel.tabs.label' },
    { id: 'cleanup', labelKey: 'common:renderPanel.tabs.cleanup' },
  ]

  return (
    <div className={clsx('flex flex-col h-full', isDark ? 'bg-gray-900' : 'bg-white')}>
      {/* 子页签导航 */}
      <div className={clsx('flex shrink-0 border-b', isDark ? 'border-gray-700' : 'border-gray-200')}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium transition-colors border-b-2',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent hover:text-gray-700 dark:hover:text-gray-300',
              isDark ? 'text-gray-400' : 'text-gray-500',
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* 页签内容 */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* === 渲染配置页签 === */}
        {activeTab === 'config' && (
          <>
            {selectedProject && (
              <div className="space-y-1.5">
                <button
                  onClick={() => setShowProjectInfo(!showProjectInfo)}
                  className={clsx(
                    'w-full flex items-center gap-1 text-xs font-semibold',
                    isDark ? 'text-gray-200' : 'text-gray-700',
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
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">
                              {t('common:renderPanel.template')}
                            </span>
                          )}
                          {projectInfo.structure?.para && (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px]">
                              {t('common:renderPanel.parameter')}
                            </span>
                          )}
                          {projectInfo.structure?.output && (
                            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px]">
                              {t('common:renderPanel.output')}
                            </span>
                          )}
                          {projectInfo.structure?.yaml && (
                            <span className="px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded text-[10px]">
                              {t('common:renderPanel.yaml')}
                            </span>
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
                      isDark ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900',
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
                      isDark ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900',
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
                  <span className={clsx('text-[10px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    {t('common:renderPanel.noProjects')}
                  </span>
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
                              : 'bg-white border-gray-300 text-gray-700 hover:border-primary-300',
                        )}
                      >
                        {p.name}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

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
          </>
        )}

        {/* === 打印标签页签 === */}
        {activeTab === 'label' && (
          <>
            <div className="space-y-1.5">
              <h4 className={clsx('text-xs font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
                {t('common:renderPanel.selectProjects')}
                <span className={clsx('font-normal ms-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  ({selectedProjectIds.length}/{projects.length})
                </span>
              </h4>
              <div className={clsx('flex flex-wrap gap-1 max-h-32 overflow-auto rounded p-1', isDark ? 'bg-gray-800' : 'bg-gray-50')}>
                {projects.length === 0 ? (
                  <span className={clsx('text-[10px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    {t('common:renderPanel.noProjects')}
                  </span>
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
                              : 'bg-white border-gray-300 text-gray-700 hover:border-primary-300',
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
                icon={<FileText size={12} />}
                onClick={handleLabelMarkdown}
                disabled={!selectedProject || isLabelPrinting || selectedProjectIds.length === 0}
                loading={isLabelPrinting}
                className="w-full justify-start"
              >
                {t('project:label.generateMarkdown')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Printer size={12} />}
                onClick={handleLabelPrint}
                disabled={!selectedProject || isLabelPrinting || selectedProjectIds.length === 0}
                className="w-full justify-start"
              >
                {t('project:label.exportWord')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileDown size={12} />}
                onClick={handleLabelPdf}
                disabled={!selectedProject || isLabelPrinting || selectedProjectIds.length === 0}
                className="w-full justify-start"
              >
                {t('project:label.exportPdf')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Trash2 size={12} />}
                onClick={handleLabelDelete}
                disabled={!selectedProject || selectedProjectIds.length === 0}
                className="w-full justify-start"
              >
                {t('project:label.deleteLabels')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Settings size={12} />}
                onClick={() => setShowPrintConfig(!showPrintConfig)}
                className="w-full justify-start"
              >
                {t('project:label.printSettings')}
              </Button>
            </div>

            {showPrintConfig && (
              <div className={clsx('border rounded p-2 space-y-2', isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200')}>
                <h5 className={clsx('text-[10px] font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
                  {t('project:label.printConfig')}
                </h5>
                <div className="space-y-1.5 text-[10px]">
                  <div className="flex items-center gap-1">
                    <label className={clsx('w-14 shrink-0', isDark ? 'text-gray-400' : 'text-gray-600')}>
                      {t('project:label.paper')}
                    </label>
                    <select
                      value={printConfig.format}
                      onChange={(e) => setPrintConfig((p) => ({ ...p, format: e.target.value as any }))}
                      className={clsx('flex-1 px-1 py-0.5 border rounded', isDark ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900')}
                    >
                      <option value="A4">A4</option>
                      <option value="A5">A5</option>
                      <option value="custom">{t('project:label.custom')}</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className={clsx('w-14 shrink-0', isDark ? 'text-gray-400' : 'text-gray-600')}>
                      {t('project:label.orientation')}
                    </label>
                    <select
                      value={printConfig.orientation}
                      onChange={(e) => setPrintConfig((p) => ({ ...p, orientation: e.target.value as any }))}
                      className={clsx('flex-1 px-1 py-0.5 border rounded', isDark ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900')}
                    >
                      <option value="portrait">{t('project:label.portrait')}</option>
                      <option value="landscape">{t('project:label.landscape')}</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className={clsx('w-14 shrink-0', isDark ? 'text-gray-400' : 'text-gray-600')}>
                      {t('project:label.labelsPerPage')}
                    </label>
                    <input
                      type="number"
                      value={printConfig.labelsPerPage}
                      onChange={(e) => setPrintConfig((p) => ({ ...p, labelsPerPage: parseInt(e.target.value) || 1 }))}
                      min={1}
                      max={32}
                      className={clsx('flex-1 px-1 py-0.5 border rounded w-16', isDark ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900')}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* === 清理文件页签 === */}
        {activeTab === 'cleanup' && (
          <>
            <div className="space-y-1.5">
              <h4 className={clsx('text-xs font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
                {t('common:renderPanel.selectProjects')}
                <span className={clsx('font-normal ms-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  ({selectedProjectIds.length}/{projects.length})
                </span>
              </h4>
              <div className={clsx('flex flex-wrap gap-1 max-h-32 overflow-auto rounded p-1', isDark ? 'bg-gray-800' : 'bg-gray-50')}>
                {projects.length === 0 ? (
                  <span className={clsx('text-[10px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    {t('common:renderPanel.noProjects')}
                  </span>
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
                              : 'bg-white border-gray-300 text-gray-700 hover:border-primary-300',
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
          </>
        )}

        {/* 进度条（所有页签共用） */}
        {isProcessing && (
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

        {/* 错误（所有页签共用） */}
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
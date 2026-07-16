import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { useEditorStore, type EditorTab } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { showSuccess, showError } from '@/components/ui/Toast'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import React, { useState, useEffect } from 'react'
import { WorkbenchScopeCard } from './workbench/WorkbenchScopeCard'
import { WorkbenchReadinessCard } from './workbench/WorkbenchReadinessCard'
import { WorkbenchOutputCard } from './workbench/WorkbenchOutputCard'
import { WorkbenchActionCard } from './workbench/WorkbenchActionCard'
import { WorkbenchResultCard } from './workbench/WorkbenchResultCard'

export const WorkbenchPanel = React.memo(function WorkbenchPanel() {
  const { t } = useTranslation('project')
  const projects = useProjectStore((s) => s.projects)
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const projectStatuses = useProjectStore((s) => s.projectStatuses)
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
      <div className="p-3 space-y-4">
        <WorkbenchScopeCard
          selectedProject={selectedProject}
          projectInfo={projectInfo}
          projects={projects}
          selectedProjectIds={selectedProjectIds}
          projectStatuses={projectStatuses}
          isDark={isDark}
          onToggleProject={toggleProject}
          onOpenFolder={openInFolder}
        />

        <div className={clsx('border-t', isDark ? 'border-gray-700' : 'border-gray-200')} />

        <WorkbenchReadinessCard
          projectInfo={projectInfo}
          isDark={isDark}
          onOpenParaConfig={openParaConfig}
          selectedProject={selectedProject !== null}
        />

        <div className={clsx('border-t', isDark ? 'border-gray-700' : 'border-gray-200')} />

        <WorkbenchOutputCard
          outputFormat={config.outputFormat}
          renderType={config.renderType}
          isDark={isDark}
          onOutputFormatChange={(format) => setConfig({ outputFormat: format })}
          onRenderTypeChange={(type) => setConfig({ renderType: type })}
        />

        <div className={clsx('border-t', isDark ? 'border-gray-700' : 'border-gray-200')} />

        <WorkbenchActionCard
          isRendering={isRendering}
          selectedProjectIds={selectedProjectIds}
          selectedProject={selectedProject !== null}
          isDark={isDark}
          onBatchRender={handleRenderBatch}
          onSingleRender={handleRenderSingle}
          onDeleteOutput={handleDeleteOutput}
          onDeleteYaml={handleDeleteYaml}
        />

        {(isRendering || errors.length > 0) && (
          <>
            <div className={clsx('border-t', isDark ? 'border-gray-700' : 'border-gray-200')} />
            <WorkbenchResultCard
              isRendering={isRendering}
              progress={progress}
              currentMessage={currentMessage}
              errors={errors}
              isDark={isDark}
            />
          </>
        )}
      </div>
    </div>
  )
})
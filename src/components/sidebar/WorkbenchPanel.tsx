import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { useEditorStore, type EditorTab } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import type { ProjectInfoDetail } from '@/types/ipc'
import { showSuccess, showError } from '@/components/ui/Toast'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import React, { useState, useEffect } from 'react'
import { WorkbenchScopeCard } from './workbench/WorkbenchScopeCard'
import { WorkbenchReadinessCard } from './workbench/WorkbenchReadinessCard'
import { WorkbenchDependencyCard } from './workbench/WorkbenchDependencyCard'
import { WorkbenchProofreadCard } from './workbench/WorkbenchProofreadCard'
import { WorkbenchOutputCard } from './workbench/WorkbenchOutputCard'
import { WorkbenchLabelCard } from './workbench/WorkbenchLabelCard'
import { WorkbenchActionCard } from './workbench/WorkbenchActionCard'
import { WorkbenchDryRunResults } from './workbench/WorkbenchDryRunResults'
import { WorkbenchResultCard } from './workbench/WorkbenchResultCard'
import { Button } from '@/components/ui/Button'
import { BatchProgressPanel } from '@/components/ui/BatchProgressPanel'
import { PipelinePanel } from '@/components/ui/PipelinePanel'
import { useBatchStore } from '@/stores/batch.store'
import { ExternalLink, Zap } from 'lucide-react'

/** MC-M3h / J-UIX-2: 三步步骤分组标签（与 AL v1.6 对齐：①配置与就绪 / ②渲染材料与操作 / ③校对与输出）
 *  v2.0 M3: 升级为数字徽章 + 标题 + 渐变连接线的步骤条语言（编号由 JSX 传入，与 i18n 文案解耦） */
function StepLabel({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-semibold shadow-sm shrink-0">
        {n}
      </span>
      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{text}</span>
      <span className="flex-1 h-px bg-gradient-to-r from-primary-200 dark:from-primary-700 to-transparent" />
    </div>
  )
}

/** 三步分组容器：圆角浅底 + 顶部主色 accent 边框（对齐 AL WorkbenchTab 分组语言） */
function StepGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50/70 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 border-t-2 border-t-primary-200 dark:border-t-primary-700 p-3 space-y-3">
      {children}
    </div>
  )
}

/** MC-M3i / MC-WS2: 无项目空态引导面板（对齐 AL EmptyProjectGuide，不渲染空白卡片骨架） */
function EmptyProjectGuide() {
  const { t } = useTranslation('project')
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="flex flex-col items-center text-center max-w-xs">
        <div className="p-3 rounded-full bg-primary-100 dark:bg-primary-900/40 mb-3">
          <Zap size={28} className="text-primary-500 dark:text-primary-400" />
        </div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t('workbench.emptyWelcome')}</p>
        <p className="text-2xs text-gray-400 mt-1">{t('workbench.emptyHint')}</p>
      </div>
    </div>
  )
}

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
  const dryRun = useRenderStore((s) => s.dryRun)
  const dryRunResults = useRenderStore((s) => s.dryRunResults)
  const clearDryRunResults = useRenderStore((s) => s.clearDryRunResults)
  const validateTemplate = useRenderStore((s) => s.validateTemplate)
  const validateExcel = useRenderStore((s) => s.validateExcel)
  const validationResults = useRenderStore((s) => s.validationResults)
  const isValidationRunning = useRenderStore((s) => s.isValidationRunning)
  const clearValidationResults = useRenderStore((s) => s.clearValidationResults)
  const openFile = useEditorStore((s) => s.openFile)
  const isDark = useUIStore((s) => s.isDark)
  const setActiveActivity = useUIStore((s) => s.setActiveActivity)

  const [projectInfo, setProjectInfo] = useState<ProjectInfoDetail | null>(null)

  useEffect(() => {
    if (selectedProject) {
      window.electron.project
        .info(String(selectedProject.id))
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
    // 4.4 F4-2：批量渲染增强——按项目粒度并行 + 进度 + 失败汇总
    const batchProjects = projects
      .filter((p) => selectedProjectIds.includes(String(p.id)))
      .map((p) => ({ id: p.id, name: p.name }))
    const useBatch = useBatchStore.getState()
    if (config.renderType === 'project') {
      if (config.outputFormat === 'device_name') {
        await useBatch.runBatchRender(batchProjects, {
          renderOne: (project) => window.electron.render.project([String(project.id)]) as Promise<unknown>,
        })
      } else {
        await useBatch.runBatchRender(batchProjects, {
          renderOne: (project) => window.electron.render.projectSn([String(project.id)]) as Promise<unknown>,
        })
      }
    } else {
      if (config.outputFormat === 'device_name') {
        await useBatch.runBatchRender(batchProjects, {
          renderOne: (project) => window.electron.render.yaml([String(project.id)]) as Promise<unknown>,
        })
      } else {
        await useBatch.runBatchRender(batchProjects, {
          renderOne: (project) => window.electron.render.yamlSn([String(project.id)]) as Promise<unknown>,
        })
      }
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

  const handleDryRun = async () => {
    if (!selectedProject) return
    const ids = [String(selectedProject.id)]
    await dryRun(ids, config.outputFormat)
  }

  const handleValidateTemplate = async () => {
    if (!selectedProject) return
    await validateTemplate([String(selectedProject.id)])
  }

  const handleValidateExcel = async () => {
    if (!selectedProject) return
    await validateExcel([String(selectedProject.id)])
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
      {!selectedProject ? (
        // MC-M3i / MC-WS2: 无项目 → 统一空态引导（不渲染 7 张空白卡片骨架）
        <EmptyProjectGuide />
      ) : (
        <div className="p-3 space-y-4">
          {/* ① 配置与就绪 */}
          <StepGroup>
            <StepLabel n="①" text={t('workbench.stepConfig')} />
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

            <WorkbenchReadinessCard
              projectInfo={projectInfo}
              isDark={isDark}
              selectedProject={selectedProject !== null}
              isValidationRunning={isValidationRunning}
              validationResults={validationResults}
              onOpenParaConfig={openParaConfig}
              onValidateTemplate={handleValidateTemplate}
              onValidateExcel={handleValidateExcel}
              onClearValidation={clearValidationResults}
            />
          </StepGroup>

          {/* ② 渲染材料与操作 */}
          <StepGroup>
            <StepLabel n="②" text={t('workbench.stepRender')} />
            <WorkbenchOutputCard
              outputFormat={config.outputFormat}
              renderType={config.renderType}
              isDark={isDark}
              onOutputFormatChange={(format) => setConfig({ outputFormat: format })}
              onRenderTypeChange={(type) => setConfig({ renderType: type })}
            />

            <WorkbenchActionCard
              isRendering={isRendering}
              selectedProjectIds={selectedProjectIds}
              selectedProject={selectedProject !== null}
              isDark={isDark}
              onBatchRender={handleRenderBatch}
              onSingleRender={handleRenderSingle}
              onDryRun={handleDryRun}
              onDeleteOutput={handleDeleteOutput}
              onDeleteYaml={handleDeleteYaml}
            />

            <BatchProgressPanel />
          </StepGroup>

          {/* ③ 校对与输出 */}
          <StepGroup>
            <StepLabel n="③" text={t('workbench.stepResult')} />
            <WorkbenchDependencyCard selectedProject={selectedProject} isDark={isDark} />
            <WorkbenchProofreadCard selectedProject={selectedProject} isDark={isDark} />
            <WorkbenchLabelCard selectedProjectIds={selectedProjectIds} isDark={isDark} />

            <PipelinePanel />

            <Button
              variant="secondary"
              size="sm"
              icon={<ExternalLink size={12} />}
              onClick={() => setActiveActivity('output')}
              className="w-full justify-start mt-2"
            >
              {t('workbench.viewOutput')}
            </Button>

            {dryRunResults.length > 0 && (
              <WorkbenchDryRunResults results={dryRunResults} isDark={isDark} onClear={clearDryRunResults} />
            )}

            {(isRendering || errors.length > 0) && (
              <WorkbenchResultCard
                isRendering={isRendering}
                progress={progress}
                currentMessage={currentMessage}
                errors={errors}
                isDark={isDark}
              />
            )}
          </StepGroup>
        </div>
      )}
    </div>
  )
})

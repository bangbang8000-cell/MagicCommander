import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { useEditorStore } from '@/stores/editor.store'
import {
  useProjectHistoryStore,
  createBackup,
  restoreLatestBackup,
  listScope,
  restoreScope,
  defaultHistoryIo,
  VERSION_HISTORY_LIMIT,
  BACKUP_LIMIT,
  type VersionMeta,
} from '@/stores/projectHistory.store'
import { Button } from '@/components/ui/Button'
import type { ProjectInfoDetail } from '@/types/ipc'
import {
  Play,
  RefreshCw,
  FolderOpen,
  FileCheck,
  FileCode,
  FileOutput,
  History,
  Archive,
  Download,
  Upload,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback, useMemo } from 'react'

export function ConfigPanel() {
  const { t } = useTranslation('project')
  const selectedProject = useProjectStore((s) => s.selectedProject)
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
  const openFile = useEditorStore((s) => s.openFile)

  const [projectInfo, setProjectInfo] = useState<ProjectInfoDetail | null>(null)

  // V4.2.0-42-b/42-c：版本回滚 + 备份/一键恢复
  const historyBusy = useProjectHistoryStore((s) => s.busy)
  const historyMessage = useProjectHistoryStore((s) => s.message)
  const historyKind = useProjectHistoryStore((s) => s.kind)
  const setHistoryBusy = useProjectHistoryStore((s) => s.setBusy)
  const notify = useProjectHistoryStore((s) => s.notify)
  const clearMessage = useProjectHistoryStore((s) => s.clearMessage)
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [backups, setBackups] = useState<VersionMeta[]>([])

  const projectRef = useMemo(
    () => (selectedProject ? { id: selectedProject.id, name: selectedProject.name } : null),
    [selectedProject],
  )

  const refreshHistory = useCallback(async () => {
    if (!projectRef) return
    try {
      const [v, b] = await Promise.all([
        listScope(projectRef, 'history', defaultHistoryIo()),
        listScope(projectRef, 'backup', defaultHistoryIo()),
      ])
      setVersions(v)
      setBackups(b)
    } catch {
      /* 读取失败忽略 */
    }
  }, [projectRef])

  useEffect(() => {
    if (selectedProject) {
      window.electron.project
        .info(String(selectedProject.id))
        .then(setProjectInfo)
        .catch(() => setProjectInfo(null))
      void refreshHistory()
    } else {
      setProjectInfo(null)
      setVersions([])
      setBackups([])
    }
  }, [selectedProject, refreshHistory])

  // 恢复后重开项目标签，让编辑器读取磁盘上恢复后的内容
  const reloadProjectTabs = useCallback(async (projectId: number) => {
    const metas = useEditorStore.getState().tabMetas.filter((m) => m.projectId === projectId)
    useEditorStore.getState().closeTabsByProject(projectId)
    await new Promise((resolve) => setTimeout(resolve, 50))
    for (const meta of metas) {
      useEditorStore.getState().openFile({
        id: meta.tabId,
        title: meta.title,
        filePath: meta.filePath,
        fileType: meta.fileType,
        projectId: meta.projectId,
        projectName: meta.projectName,
        isDirty: false,
      })
    }
  }, [])

  const handleBackup = useCallback(async () => {
    if (!projectRef) return
    setHistoryBusy(true)
    clearMessage()
    try {
      const r = await createBackup(projectRef)
      if (r.ok) {
        notify('success', '备份成功（自动轮转保留最近 5 份）')
        void refreshHistory()
      } else {
        notify('error', `备份失败：${r.reason || '未知原因'}`)
      }
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e))
    } finally {
      setHistoryBusy(false)
    }
  }, [projectRef, setHistoryBusy, clearMessage, notify, refreshHistory])

  const handleRestoreLatestBackup = useCallback(async () => {
    if (!projectRef || !selectedProject) return
    try {
      const confirmed = await window.electron.dialog.showConfirm({
        title: '一键恢复',
        message: '将用最近一次备份覆盖当前项目的配置/参数文件，是否继续？',
      })
      if (!confirmed) return
    } catch {
      /* 对话框失败则继续 */
    }
    setHistoryBusy(true)
    clearMessage()
    try {
      const r = await restoreLatestBackup(projectRef)
      if (r.ok) {
        notify('success', `已恢复 ${r.restored} 个文件`)
        void reloadProjectTabs(selectedProject.id)
        void refreshHistory()
      } else {
        notify('error', `恢复失败：${r.reason || '无可用备份'}`)
      }
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e))
    } finally {
      setHistoryBusy(false)
    }
  }, [projectRef, selectedProject, setHistoryBusy, clearMessage, notify, refreshHistory, reloadProjectTabs])

  // 4.8.0（F8-2 / 48-b）：快照导出为文件 / 导入合并
  const handleExportSnapshot = useCallback(
    async (scope: 'history' | 'backup') => {
      if (!projectRef) return
      setHistoryBusy(true)
      clearMessage()
      try {
        const r = await window.electron.project.exportSnapshot(projectRef.name, scope)
        notify('success', `快照已导出: ${r.path}（${r.itemCount} 条）`)
      } catch (e) {
        notify('error', e instanceof Error ? e.message : String(e))
      } finally {
        setHistoryBusy(false)
      }
    },
    [projectRef, setHistoryBusy, clearMessage, notify],
  )

  const handleImportSnapshot = useCallback(async () => {
    if (!projectRef) return
    setHistoryBusy(true)
    clearMessage()
    try {
      const r = await window.electron.project.importSnapshot(projectRef.name)
      notify('success', `快照导入完成，共 ${r.total} 条（新增 ${r.added} 条）`)
      void refreshHistory()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e))
    } finally {
      setHistoryBusy(false)
    }
  }, [projectRef, setHistoryBusy, clearMessage, notify, refreshHistory])

  const handleRestoreVersion = useCallback(
    async (id: string) => {
      if (!projectRef || !selectedProject) return
      try {
        const confirmed = await window.electron.dialog.showConfirm({
          title: '回滚到历史版本',
          message: '将用所选历史版本覆盖当前项目的配置/参数文件，是否继续？',
        })
        if (!confirmed) return
      } catch {
        /* 对话框失败则继续 */
      }
      setHistoryBusy(true)
      clearMessage()
      try {
        const r = await restoreScope(projectRef, 'history', id, defaultHistoryIo())
        if (r.ok) {
          notify('success', `已回滚 ${r.restored} 个文件`)
          void reloadProjectTabs(selectedProject.id)
          void refreshHistory()
        } else {
          notify('error', `回滚失败：${r.reason || '未知原因'}`)
        }
      } catch (e) {
        notify('error', e instanceof Error ? e.message : String(e))
      } finally {
        setHistoryBusy(false)
      }
    },
    [projectRef, selectedProject, setHistoryBusy, clearMessage, notify, refreshHistory, reloadProjectTabs],
  )

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 p-4 text-center">
        {t('workbench.selectProjectInExplorer')}
      </div>
    )
  }

  const handleRender = async () => {
    const ids = [String(selectedProject.id)]
    if (config.renderType === 'project') {
      if (config.outputFormat === 'device_name') await renderProject(ids)
      else await renderProjectSn(ids)
    } else {
      if (config.outputFormat === 'device_name') await renderYaml(ids)
      else await renderYamlSn(ids)
    }
  }

  const handleDeleteOutput = async () => {
    const ids = [String(selectedProject.id)]
    if (config.outputFormat === 'device_name') await deleteOutput(ids)
    else await deleteOutputSn(ids)
  }

  const handleDeleteYaml = async () => {
    const ids = [String(selectedProject.id)]
    if (config.outputFormat === 'device_name') await deleteYaml(ids)
    else await deleteYamlSn(ids)
  }

  const openParaConfig = () => {
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
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-3 space-y-3">
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <FolderOpen size={12} /> {t('config.projectInfo')}
          </h4>
          <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('workbench.name')}</span>
              <span className="font-medium">{selectedProject.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('workbench.id')}</span>
              <span className="font-medium">{selectedProject.id}</span>
            </div>
            {projectInfo && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('workbench.path')}</span>
                  <span className="font-medium text-[11px] truncate max-w-[140px]">{projectInfo.path}</span>
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {projectInfo.structure?.excel && (
                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[11px]">
                      {t('workbench.excel')}
                    </span>
                  )}
                  {projectInfo.structure?.templates && (
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[11px]">
                      {t('workbench.template')}
                    </span>
                  )}
                  {projectInfo.structure?.para && (
                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[11px]">
                      {t('workbench.para')}
                    </span>
                  )}
                  {projectInfo.structure?.output && (
                    <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[11px]">
                      {t('workbench.output')}
                    </span>
                  )}
                  {projectInfo.structure?.yaml && (
                    <span className="px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded text-[11px]">
                      {t('workbench.yaml')}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <FileCheck size={12} /> {t('workbench.paraConfig')}
          </h4>
          <Button
            variant="secondary"
            size="sm"
            icon={<FileCode size={12} />}
            onClick={openParaConfig}
            className="w-full justify-start"
          >
            {t('workbench.openParaXlsx')}
          </Button>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <Play size={12} /> {t('workbench.renderOperation')}
          </h4>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[11px] text-gray-500">
              <span>{t('workbench.format')}</span>
              <select
                value={config.outputFormat}
                onChange={(e) => setConfig({ outputFormat: e.target.value as 'device_name' | 'device_sn' })}
                className="text-[11px] border border-gray-300 rounded px-1 py-0.5 flex-1"
              >
                <option value="device_name">{t('workbench.deviceName')}</option>
                <option value="device_sn">{t('workbench.deviceSn')}</option>
              </select>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-gray-500">
              <span>{t('workbench.type')}</span>
              <select
                value={config.renderType}
                onChange={(e) => setConfig({ renderType: e.target.value as 'project' | 'yaml' })}
                className="text-[11px] border border-gray-300 rounded px-1 py-0.5 flex-1"
              >
                <option value="project">{t('workbench.projectConfig')}</option>
                <option value="yaml">{t('workbench.yamlFile')}</option>
              </select>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Play size={12} />}
            onClick={handleRender}
            disabled={isRendering}
            loading={isRendering}
            className="w-full justify-start"
          >
            {t('workbench.executeRender')}
          </Button>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <RefreshCw size={12} /> {t('workbench.cleanup')}
          </h4>
          <div className="flex flex-col gap-1">
            <Button
              variant="secondary"
              size="sm"
              icon={<FileOutput size={12} />}
              onClick={handleDeleteOutput}
              disabled={isRendering}
              className="w-full justify-start"
            >
              {t('render.deleteOutput')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<FileCode size={12} />}
              onClick={handleDeleteYaml}
              disabled={isRendering}
              className="w-full justify-start"
            >
              {t('render.deleteYaml')}
            </Button>
          </div>
        </div>

        {/* V4.2.0-42-b/42-c：备份 + 版本回滚（F2-2b / F2-3） */}
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <Archive size={12} /> {t('workbench.backupRestore')}
          </h4>
          <div className="flex flex-col gap-1">
            <Button
              variant="secondary"
              size="sm"
              icon={<Archive size={12} />}
              onClick={handleBackup}
              disabled={historyBusy}
              className="w-full justify-start"
            >
              {t('workbench.createBackup')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<History size={12} />}
              onClick={handleRestoreLatestBackup}
              disabled={historyBusy}
              className="w-full justify-start"
            >
              {t('workbench.restoreLatestBackup')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={12} />}
              onClick={() => void handleExportSnapshot('history')}
              disabled={historyBusy}
              className="w-full justify-start"
            >
              {t('workbench.exportSnapshot')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Upload size={12} />}
              onClick={() => void handleImportSnapshot()}
              disabled={historyBusy}
              className="w-full justify-start"
            >
              {t('workbench.importSnapshot')}
            </Button>
          </div>
          {historyMessage && (
            <p
              className={`text-[11px] ${
                historyKind === 'success'
                  ? 'text-green-600'
                  : historyKind === 'error'
                    ? 'text-red-600'
                    : 'text-gray-500'
              }`}
            >
              {historyMessage}
            </p>
          )}
          <div className="bg-gray-50 rounded p-2 text-[11px] space-y-1">
            <div className="flex items-center gap-1 font-medium text-gray-600">
              <History size={10} /> {t('workbench.versionHistory')}（最近 {VERSION_HISTORY_LIMIT} 版）
            </div>
            {versions.length === 0 ? (
              <p className="text-gray-400">{t('workbench.noVersionHistory')}</p>
            ) : (
              [...versions].reverse().map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-gray-500">
                    {new Date(v.timestamp).toLocaleString()} · {v.note || '自动保存'} · {v.fileCount} 文件
                  </span>
                  <button
                    onClick={() => handleRestoreVersion(v.id)}
                    disabled={historyBusy}
                    className="text-blue-500 hover:underline shrink-0 disabled:opacity-40"
                  >
                    {t('workbench.rollback')}
                  </button>
                </div>
              ))
            )}
            <div className="flex items-center gap-1 font-medium text-gray-600 pt-1 border-t border-gray-200">
              <Archive size={10} /> {t('workbench.backups')}（最近 {BACKUP_LIMIT} 份）
            </div>
            {backups.length === 0 ? (
              <p className="text-gray-400">{t('workbench.noBackups')}</p>
            ) : (
              [...backups].reverse().map((b) => (
                <div key={b.id} className="truncate text-gray-500">
                  {new Date(b.timestamp).toLocaleString()} · {b.note || '自动备份'} · {b.fileCount} 文件
                </div>
              ))
            )}
          </div>
        </div>

        {isRendering && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-gray-600">
              <span className="truncate">{currentMessage || t('workbench.processing')}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div
                className="bg-primary-600 h-1 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/project.store'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { errorService } from '@/services/errorService'
import { Button } from '@/components/ui/Button'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  FolderOpen,
  Loader2,
  AlertCircle,
  RefreshCw,
  Settings,
  Tag,
  FileCode,
  FileCheck,
  FolderX,
  Download,
  Archive,
} from 'lucide-react'
import clsx from 'clsx'
import { getFileTypeFromPath } from '@/types/editor'
import { getOutputDirIcon } from '@/config/icons'
import type { LucideIcon } from 'lucide-react'

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

type OutputTab = 'browse' | 'export'

// 输出目录类型配置
const OUTPUT_DIR_NAMES = ['output', 'output-sn', 'yaml', 'yaml-sn', 'output-label']

const OUTPUT_TYPE_KEY_MAP: Record<string, string> = {
  output: 'common:outputPanel.configOutput',
  'output-sn': 'common:outputPanel.snConfig',
  yaml: 'common:outputPanel.yamlOutput',
  'yaml-sn': 'common:outputPanel.yamlSn',
  'output-label': 'common:outputPanel.labelOutput',
}

const OUTPUT_TYPE_ICON_MAP: Record<string, LucideIcon> = {
  output: Settings,
  'output-sn': Tag,
  yaml: FileCode,
  'yaml-sn': FileCheck,
  'output-label': Tag,
}

async function openInExplorer(projectName: string, relativePath: string) {
  try {
    const workspacePath = await window.electron.app.getPath('workspace')
    const fullPath = `${workspacePath}/${projectName}/${relativePath}`
    window.electron.shell.showItemInFolder(fullPath)
  } catch (err) {
    errorService.handleError(err, 'OutputPanel.openExplorer')
  }
}

export function OutputPanel() {
  const { t } = useTranslation()
  const projects = useProjectStore((s) => s.projects)
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const selectProject = useProjectStore((s) => s.selectProject)
  const openFile = useEditorStore((s) => s.openFile)
  const isDark = useUIStore((s) => s.isDark)

  const [activeTab, setActiveTab] = useState<OutputTab>('browse')
  const [outputStructure, setOutputStructure] = useState<FileNode[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // 导出相关状态
  const [isExporting, setIsExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'zip' | 'dir'>('zip')

  // 加载输出目录结构
  const loadOutputStructure = useCallback(
    async (projectName: string) => {
      setIsLoading(true)
      setError(null)
      try {
        const structure = (await window.electron.project.getStructure(projectName)) as FileNode[]
        const outputDirs = structure.filter(
          (node: FileNode) => OUTPUT_DIR_NAMES.includes(node.name) && node.isDirectory,
        )
        setOutputStructure(outputDirs)

        const firstDir = outputDirs[0]
        if (firstDir && firstDir.children && firstDir.children.length > 0) {
          setExpanded(new Set([firstDir.path]))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common:outputPanel.loadFailed'))
        setOutputStructure([])
      } finally {
        setIsLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    if (selectedProject) {
      loadOutputStructure(selectedProject.name)
    } else {
      setOutputStructure([])
      setExpanded(new Set())
    }
  }, [selectedProject, loadOutputStructure])

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleFileClick = (node: FileNode) => {
    if (node.isDirectory) {
      toggle(node.path)
    } else if (selectedProject) {
      const fileType = getFileTypeFromPath(node.name)
      openFile({
        id: '',
        title: node.name,
        filePath: node.path,
        fileType,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        isDirty: false,
      })
    }
  }

  const handleProjectSelect = (project: (typeof projects)[0]) => {
    selectProject(project)
  }

  // 导出操作
  const handleExportAll = useCallback(async () => {
    if (!selectedProject) return
    setIsExporting(true)
    try {
      const workspacePath = await window.electron.app.getPath('workspace')
      const projectPath = `${workspacePath}/${selectedProject.name}`
      // TODO Phase 2: 实现真正的 ZIP 导出或目录导出
      // 当前打开资源管理器指向输出目录
      const outputDir = outputStructure[0]
      if (outputDir) {
        window.electron.shell.showItemInFolder(`${projectPath}/${outputDir.path}`)
      } else {
        window.electron.shell.showItemInFolder(projectPath)
      }
    } catch (err) {
      errorService.handleError(err, 'OutputPanel.exportAll')
    } finally {
      setIsExporting(false)
    }
  }, [selectedProject, outputStructure])

  // 计算总输出文件数
  const totalFiles = outputStructure.reduce((sum, dir) => sum + (dir.children?.length || 0), 0)

  const tabs: { id: OutputTab; labelKey: string }[] = [
    { id: 'browse', labelKey: 'common:outputPanel.tabs.browse' },
    { id: 'export', labelKey: 'common:outputPanel.tabs.export' },
  ]

  return (
    <div className="flex flex-col h-full">
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
        <div className="flex-1" />
        {selectedProject && activeTab === 'browse' && (
          <button
            onClick={() => loadOutputStructure(selectedProject.name)}
            className={clsx(
              'p-1 mx-1 rounded',
              isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500',
            )}
            title={t('app.refresh')}
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      {/* 项目选择器 */}
      <div
        className={clsx('px-3 py-1.5 border-b', isDark ? 'bg-gray-800/40 border-gray-700' : 'bg-white border-gray-200')}
      >
        <select
          value={selectedProject?.id || ''}
          onChange={(e) => {
            const project = projects.find((p) => p.id === Number(e.target.value))
            if (project) handleProjectSelect(project)
          }}
          className={clsx(
            'w-full text-xs px-2 py-1 rounded border',
            isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-gray-50 border-gray-300 text-gray-700',
          )}
        >
          <option value="">{t('common:outputPanel.selectProject')}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {/* === 文件浏览页签 === */}
      {activeTab === 'browse' && (
        <>
          {!selectedProject ? (
            <div className={clsx('flex-1 flex items-center justify-center text-xs p-4 text-center', isDark ? 'text-gray-500' : 'text-gray-400')}>
              {t('common:outputPanel.selectProjectHint')}
            </div>
          ) : isLoading ? (
            <div className={clsx('flex-1 flex items-center justify-center gap-2 text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
              <Loader2 size={14} className="animate-spin" />
              {t('app.loading')}
            </div>
          ) : error ? (
            <div className={clsx('flex-1 flex flex-col items-center justify-center gap-1 text-xs p-4 text-center', isDark ? 'text-red-400' : 'text-red-500')}>
              <AlertCircle size={16} />
              <span>{t('common:outputPanel.loadFailed')}: {error}</span>
              <button
                onClick={() => loadOutputStructure(selectedProject.name)}
                className={clsx('mt-2 px-2 py-0.5 rounded text-xs', isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}
              >
                {t('app.retry')}
              </button>
            </div>
          ) : outputStructure.length === 0 ? (
            <div className={clsx('flex-1 flex flex-col items-center justify-center text-xs p-4 text-center', isDark ? 'text-gray-500' : 'text-gray-400')}>
              <FolderX size={24} className={clsx('mb-2', isDark ? 'text-gray-600' : 'text-gray-300')} />
              <div>{t('common:outputPanel.noOutputFiles')}</div>
              <div className="text-xs mt-1 opacity-60">{t('common:outputPanel.renderHint')}</div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto py-1">
              {outputStructure.map((node) => (
                <OutputTreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggle}
                  onClick={handleFileClick}
                  isDark={isDark}
                  projectName={selectedProject.name}
                  t={t}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* === 批量导出页签 === */}
      {activeTab === 'export' && (
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {!selectedProject ? (
            <div className={clsx('flex items-center justify-center text-xs p-4 text-center', isDark ? 'text-gray-500' : 'text-gray-400')}>
              {t('common:outputPanel.selectProjectHint')}
            </div>
          ) : (
            <>
              {/* 导出统计 */}
              <div className={clsx('rounded p-3 space-y-2', isDark ? 'bg-gray-800' : 'bg-gray-50')}>
                <div className={clsx('text-xs font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
                  {selectedProject.name}
                </div>
                <div className="space-y-1 text-[11px]">
                  {outputStructure.map((dir) => (
                    <div key={dir.path} className="flex justify-between">
                      <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                        {OUTPUT_TYPE_KEY_MAP[dir.name] ? t(OUTPUT_TYPE_KEY_MAP[dir.name]) : dir.name}
                      </span>
                      <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                        {dir.children?.length || 0} {t('project:common.files')}
                      </span>
                    </div>
                  ))}
                  {totalFiles > 0 && (
                    <div className={clsx('flex justify-between font-medium pt-1 border-t', isDark ? 'border-gray-700 text-gray-200' : 'border-gray-200 text-gray-700')}>
                      <span>{t('common:outputPanel.exportAll')}</span>
                      <span>{totalFiles} {t('project:common.files')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 导出格式选择 */}
              <div className="space-y-1.5">
                <label className={clsx('text-xs font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
                  {t('common:outputPanel.exportFormat')}
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExportFormat('zip')}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border transition-colors',
                      exportFormat === 'zip'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : isDark
                          ? 'border-gray-600 text-gray-400 hover:border-gray-500'
                          : 'border-gray-300 text-gray-500 hover:border-gray-400',
                    )}
                  >
                    <Archive size={12} />
                    {t('common:outputPanel.exportAsZip')}
                  </button>
                  <button
                    onClick={() => setExportFormat('dir')}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border transition-colors',
                      exportFormat === 'dir'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : isDark
                          ? 'border-gray-600 text-gray-400 hover:border-gray-500'
                          : 'border-gray-300 text-gray-500 hover:border-gray-400',
                    )}
                  >
                    <FolderOpen size={12} />
                    {t('common:outputPanel.exportToDir')}
                  </button>
                </div>
              </div>

              {/* 导出按钮 */}
              <Button
                variant="primary"
                size="sm"
                icon={<Download size={12} />}
                onClick={handleExportAll}
                disabled={isExporting || totalFiles === 0}
                loading={isExporting}
                className="w-full justify-start"
              >
                {isExporting ? t('common:outputPanel.exporting') : t('common:outputPanel.exportAll')}
              </Button>

              {totalFiles === 0 && (
                <div className={clsx('text-xs text-center', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  {t('common:outputPanel.renderHint')}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function OutputTreeItem({
  node,
  depth,
  expanded,
  onToggle,
  onClick,
  isDark,
  projectName,
  t,
}: {
  node: FileNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  onClick: (node: FileNode) => void
  isDark: boolean
  projectName: string
  t: (key: string) => string
}) {
  const isOpen = expanded.has(node.path)
  const labelKey = OUTPUT_TYPE_KEY_MAP[node.name]
  const IconComponent = OUTPUT_TYPE_ICON_MAP[node.name]
  const isOutputDir = OUTPUT_DIR_NAMES.includes(node.name)
  const fileCount = node.children?.length || 0

  if (!node.isDirectory) {
    return (
      <div
        className={clsx(
          'group flex items-center gap-1 px-2 py-0.5 text-xs cursor-pointer',
          isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100',
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onClick(node)}
      >
        <FileText size={12} className={clsx('shrink-0', isDark ? 'text-gray-500' : 'text-gray-400')} />
        <span className="truncate flex-1">{node.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            openInExplorer(projectName, node.path)
          }}
          className={clsx(
            'p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity',
            isDark ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
          )}
          title={t('common:outputPanel.openInExplorer')}
        >
          <FolderOpen size={11} />
        </button>
      </div>
    )
  }

  return (
    <div>
      <div
        className={clsx(
          'group flex items-center gap-1 px-2 py-0.5 text-xs cursor-pointer',
          isDark ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-800 hover:bg-gray-100',
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onClick(node)}
      >
        {isOpen ? (
          <ChevronDown size={12} className={clsx('shrink-0', isDark ? 'text-gray-400' : 'text-gray-500')} />
        ) : (
          <ChevronRight size={12} className={clsx('shrink-0', isDark ? 'text-gray-400' : 'text-gray-500')} />
        )}

        {isOutputDir && IconComponent ? (
          <IconComponent size={14} className={clsx('shrink-0', isDark ? 'text-gray-400' : 'text-gray-500')} />
        ) : (
          <Folder
            size={12}
            className={clsx('shrink-0', isOpen ? 'text-primary-500' : isDark ? 'text-gray-400' : 'text-gray-400')}
          />
        )}

        <span className="truncate font-medium flex-1">{isOutputDir && labelKey ? t(labelKey) : node.name}</span>

        {fileCount > 0 && (
          <span className={clsx('text-xs px-1 py-0.5 rounded shrink-0', isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500')}>
            {fileCount}
          </span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation()
            openInExplorer(projectName, node.path)
          }}
          className={clsx(
            'p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity',
            isDark ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
          )}
          title={t('common:outputPanel.openInExplorer')}
        >
          <FolderOpen size={11} />
        </button>
      </div>

      {isOpen &&
        node.children?.map((child) => (
          <OutputTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            onClick={onClick}
            isDark={isDark}
            projectName={projectName}
            t={t}
          />
        ))}
    </div>
  )
}
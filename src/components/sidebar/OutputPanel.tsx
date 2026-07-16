import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/project.store'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { errorService } from '@/services/errorService'
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

// 输出目录类型配置
const OUTPUT_DIR_NAMES = ['output', 'output-sn', 'yaml', 'yaml-sn']

const OUTPUT_TYPE_KEY_MAP: Record<string, string> = {
  output: 'common:outputPanel.configOutput',
  'output-sn': 'common:outputPanel.snConfig',
  yaml: 'common:outputPanel.yamlOutput',
  'yaml-sn': 'common:outputPanel.yamlSn',
}

const OUTPUT_TYPE_ICON_MAP: Record<string, LucideIcon> = {
  output: Settings,
  'output-sn': Tag,
  yaml: FileCode,
  'yaml-sn': FileCheck,
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

  const [outputStructure, setOutputStructure] = useState<FileNode[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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

  return (
    <div className="flex flex-col h-full">
      <div
        className={clsx(
          'px-3 py-2 border-b flex items-center justify-between',
          isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200',
        )}
      >
        <h3
          className={clsx('text-xs font-semibold uppercase tracking-wider', isDark ? 'text-gray-300' : 'text-gray-600')}
        >
          {t('common:outputPanel.outputFiles')}
        </h3>
        {selectedProject && (
          <button
            onClick={() => loadOutputStructure(selectedProject.name)}
            className={clsx(
              'p-1 rounded',
              isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500',
            )}
            title={t('app.refresh')}
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>

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

      {!selectedProject ? (
        <div
          className={clsx(
            'flex-1 flex items-center justify-center text-xs p-4 text-center',
            isDark ? 'text-gray-500' : 'text-gray-400',
          )}
        >
          {t('common:outputPanel.selectProjectHint')}
        </div>
      ) : isLoading ? (
        <div
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 text-xs',
            isDark ? 'text-gray-400' : 'text-gray-500',
          )}
        >
          <Loader2 size={14} className="animate-spin" />
          {t('app.loading')}
        </div>
      ) : error ? (
        <div
          className={clsx(
            'flex-1 flex flex-col items-center justify-center gap-1 text-xs p-4 text-center',
            isDark ? 'text-red-400' : 'text-red-500',
          )}
        >
          <AlertCircle size={16} />
          <span>
            {t('common:outputPanel.loadFailed')}: {error}
          </span>
          <button
            onClick={() => loadOutputStructure(selectedProject.name)}
            className={clsx(
              'mt-2 px-2 py-0.5 rounded text-xs',
              isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700',
            )}
          >
            {t('app.retry')}
          </button>
        </div>
      ) : outputStructure.length === 0 ? (
        <div
          className={clsx(
            'flex-1 flex flex-col items-center justify-center text-xs p-4 text-center',
            isDark ? 'text-gray-500' : 'text-gray-400',
          )}
        >
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
          <span
            className={clsx(
              'text-xs px-1 py-0.5 rounded shrink-0',
              isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500',
            )}
          >
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

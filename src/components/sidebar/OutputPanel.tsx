import { useEffect, useState, useCallback } from 'react'
import { useProjectStore } from '@/stores/project.store'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { ChevronRight, ChevronDown, Folder, FileText, FolderOpen, Loader2, AlertCircle, RefreshCw, Settings, Tag, FileCode, FileCheck, FolderX } from 'lucide-react'
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

const OUTPUT_TYPE_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  'output': { label: '配置输出', icon: Settings },
  'output-sn': { label: 'SN配置', icon: Tag },
  'yaml': { label: 'YAML输出', icon: FileCode },
  'yaml-sn': { label: 'YAML+SN', icon: FileCheck },
}

async function openInExplorer(projectName: string, relativePath: string) {
  try {
    const backendPath = await window.electron.app.getPath('backend')
    const fullPath = `${backendPath}/${projectName}/${relativePath}`
    window.electron.shell.showItemInFolder(fullPath)
  } catch (err) {
    console.error('打开资源管理器失败:', err)
  }
}

export function OutputPanel() {
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
  const loadOutputStructure = useCallback(async (projectName: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const structure = await window.electron.project.getStructure(projectName) as FileNode[]
      // 只筛选输出目录
      const outputDirs = structure.filter((node: FileNode) => 
        OUTPUT_DIR_NAMES.includes(node.name) && node.isDirectory
      )
      setOutputStructure(outputDirs)
      
      // 默认展开第一个有内容的目录
      const firstDir = outputDirs[0]
      if (firstDir && firstDir.children && firstDir.children.length > 0) {
        setExpanded(new Set([firstDir.path]))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
      setOutputStructure([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 选择项目时加载输出结构
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

  const handleProjectSelect = (project: typeof projects[0]) => {
    selectProject(project)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div
        className={clsx(
          'px-3 py-2 border-b flex items-center justify-between',
          isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200',
        )}
      >
        <h3
          className={clsx(
            'text-xs font-semibold uppercase tracking-wider',
            isDark ? 'text-gray-300' : 'text-gray-600',
          )}
        >
          输出文件
        </h3>
        {selectedProject && (
          <button
            onClick={() => loadOutputStructure(selectedProject.name)}
            className={clsx('p-1 rounded', isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500')}
            title="刷新"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      {/* 项目选择器 */}
      <div
        className={clsx(
          'px-3 py-1.5 border-b',
          isDark ? 'bg-gray-800/40 border-gray-700' : 'bg-white border-gray-200',
        )}
      >
        <select
          value={selectedProject?.id || ''}
          onChange={(e) => {
            const project = projects.find((p) => p.id === Number(e.target.value))
            if (project) handleProjectSelect(project)
          }}
          className={clsx(
            'w-full text-xs px-2 py-1 rounded border',
            isDark
              ? 'bg-gray-700 border-gray-600 text-gray-200'
              : 'bg-gray-50 border-gray-300 text-gray-700',
          )}
        >
          <option value="">选择项目...</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {/* 内容区域 */}
      {!selectedProject ? (
        <div
          className={clsx(
            'flex-1 flex items-center justify-center text-xs p-4 text-center',
            isDark ? 'text-gray-500' : 'text-gray-400',
          )}
        >
          请先选择项目查看输出文件
        </div>
      ) : isLoading ? (
        <div className={clsx('flex-1 flex items-center justify-center gap-2 text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
          <Loader2 size={14} className="animate-spin" />
          加载中...
        </div>
      ) : error ? (
        <div className={clsx('flex-1 flex flex-col items-center justify-center gap-1 text-xs p-4 text-center', isDark ? 'text-red-400' : 'text-red-500')}>
          <AlertCircle size={16} />
          <span>加载失败: {error}</span>
          <button
            onClick={() => loadOutputStructure(selectedProject.name)}
            className={clsx('mt-2 px-2 py-0.5 rounded text-xs', isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}
          >
            重试
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
          <div>暂无输出文件</div>
          <div className="text-xs mt-1 opacity-60">执行渲染后将在此显示</div>
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
}: {
  node: FileNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  onClick: (node: FileNode) => void
  isDark: boolean
  projectName: string
}) {
  const isOpen = expanded.has(node.path)
  const config = OUTPUT_TYPE_CONFIG[node.name]
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
          title="在资源管理器中打开"
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
        
        {/* 输出目录特殊图标 */}
        {isOutputDir && config ? (
          <config.icon size={14} className={clsx('shrink-0', isDark ? 'text-gray-400' : 'text-gray-500')} />
        ) : (
          <Folder size={12} className={clsx('shrink-0', isOpen ? 'text-primary-500' : isDark ? 'text-gray-400' : 'text-gray-400')} />
        )}
        
        <span className="truncate font-medium flex-1">
          {isOutputDir && config ? config.label : node.name}
        </span>
        
        {/* 文件计数 */}
        {fileCount > 0 && (
          <span className={clsx(
            'text-xs px-1 py-0.5 rounded shrink-0',
            isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
          )}>
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
          title="在资源管理器中打开"
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
          />
        ))}
    </div>
  )
}
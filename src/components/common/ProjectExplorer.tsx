import { useEffect, useState, useRef } from 'react'
import { useProjectStore } from '@/stores/project.store'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { ChevronRight, ChevronDown, Folder, FileText, RefreshCw, FolderOpen, Loader2, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { getFileTypeFromPath } from '@/types/editor'

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
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

export function ProjectExplorer() {
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId)
  const projectStructure = useProjectStore((s) => s.projectStructure)
  const isLoading = useProjectStore((s) => s.isLoading)
  const error = useProjectStore((s) => s.error)
  const loadStructure = useProjectStore((s) => s.loadStructure)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const openFile = useEditorStore((s) => s.openFile)
  const isDark = useUIStore((s) => s.isDark)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const loadStructureRef = useRef(loadStructure)
  loadStructureRef.current = loadStructure

  useEffect(() => {
    if (selectedProject) {
      loadStructureRef.current(selectedProject.name)
    }
  }, [selectedProject])

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleFileClick = (node: FileNode) => {
    console.log('[ProjectExplorer] handleFileClick - node:', node.name, 'isDirectory:', node.isDirectory, 'path:', node.path)
    if (node.isDirectory) {
      toggle(node.path)
    } else if (selectedProject) {
      const fileType = getFileTypeFromPath(node.name)
      console.log('[ProjectExplorer] 打开文件 - projectId:', selectedProject.id, 'fileType:', fileType, 'filePath:', node.path)
      openFile({
        id: '',
        title: node.name,
        filePath: node.path,
        fileType,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        isDirty: false,
      })
    } else {
      console.log('[ProjectExplorer] 未选择项目')
    }
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
          className={clsx(
            'text-xs font-semibold uppercase tracking-wider',
            isDark ? 'text-gray-300' : 'text-gray-600',
          )}
        >
          资源管理器
        </h3>
        <div className="flex items-center gap-0.5">
          {selectedProject && (
            <button
              onClick={() => openInExplorer(selectedProject.name, '')}
              className={clsx('p-1 rounded', isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500')}
              title="在资源管理器中打开项目根目录"
            >
              <FolderOpen size={12} />
            </button>
          )}
          <button
            onClick={() => fetchProjects()}
            className={clsx('p-1 rounded', isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500')}
            title="刷新"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {!selectedProject ? (
        <div
          className={clsx(
            'flex-1 flex items-center justify-center text-xs p-4 text-center',
            isDark ? 'text-gray-500' : 'text-gray-400',
          )}
        >
          从上方选择项目以查看文件结构
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
            onClick={() => selectedProject && loadStructure(selectedProject.name)}
            className={clsx('mt-2 px-2 py-0.5 rounded text-xs', isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}
          >
            重试
          </button>
        </div>
      ) : projectStructure.length === 0 ? (
        <div
          className={clsx(
            'flex-1 flex items-center justify-center text-xs p-4 text-center',
            isDark ? 'text-gray-500' : 'text-gray-400',
          )}
        >
          项目为空，暂无文件
        </div>
      ) : (
        <div className="flex-1 overflow-auto py-1">
          {projectStructure.map((node) => (
            <TreeItem
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

function TreeItem({
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
        <Folder size={12} className={clsx('shrink-0', isOpen ? 'text-primary-500' : isDark ? 'text-gray-400' : 'text-gray-400')} />
        <span className="truncate font-medium flex-1">{node.name}</span>
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
          <TreeItem
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
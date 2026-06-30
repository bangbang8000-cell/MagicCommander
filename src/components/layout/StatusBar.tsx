import { useRenderStore } from '@/stores/render.store'
import { useLogStore } from '@/stores/log.store'
import { useEditorStore } from '@/stores/editor.store'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import { Activity, Database, Circle, FileText, Folder, FileCode, Maximize2 } from 'lucide-react'
import clsx from 'clsx'
import type { FileNode } from '@/types/project'

function countFiles(nodes: FileNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.isDirectory) {
      count += countFiles(node.children ?? [])
    } else {
      count++
    }
  }
  return count
}

function getFileTypeLabel(fileType: string | undefined, filePath: string): string {
  if (!fileType) {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    return ext || 'unknown'
  }
  return fileType
}

export function StatusBar() {
  const isRendering = useRenderStore((s) => s.isRendering)
  const progress = useRenderStore((s) => s.progress)
  const logCount = useLogStore((s) => s.logs.length)
  const openTabs = useEditorStore((s) => s.openTabs)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const splitTabs = useEditorStore((s) => s.splitTabs)
  const activeSplitTabId = useEditorStore((s) => s.activeSplitTabId)
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const projectStructure = useProjectStore((s) => s.projectStructure)
  const cursorPosition = useUIStore((s) => s.cursorPosition)
  const isDark = useUIStore((s) => s.isDark)
  const resetPanelSizes = useUIStore((s) => s.resetPanelSizes)

  const activeTab = openTabs.find((t) => t.id === activeTabId) || splitTabs.find((t) => t.id === activeSplitTabId)
  const totalOpenTabs = openTabs.length + splitTabs.length
  const totalFiles = countFiles(projectStructure)

  return (
    <footer
      className={clsx(
        'h-6 flex items-center justify-between px-3 text-[11px] shrink-0 border-t',
        isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Circle
            size={8}
            className={clsx(
              isRendering ? 'fill-yellow-500 text-yellow-500 animate-pulse' : 'fill-green-500 text-green-500',
            )}
          />
          <span>{isRendering ? `运行中 (${progress}%)` : '就绪'}</span>
        </div>
        <div className="flex items-center gap-1">
          <Activity size={11} />
          <span>日志: {logCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <Folder size={11} />
          <span>项目: {selectedProject?.name || '未选择'}</span>
        </div>
        <div className="flex items-center gap-1">
          <FileText size={11} />
          <span>打开: {totalOpenTabs} 个文件</span>
        </div>
        {selectedProject && totalFiles > 0 && (
          <div className="flex items-center gap-1">
            <FileCode size={11} />
            <span>项目文件: {totalFiles}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            resetPanelSizes()
            window.location.reload()
          }}
          className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded transition-colors',
            isDark ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-700' : 'text-gray-500 hover:text-primary-600 hover:bg-gray-100',
          )}
          title="重置布局大小"
        >
          <Maximize2 size={11} />
          <span>重置布局</span>
        </button>
        {activeTab && (
          <>
            <span className="truncate max-w-xs">
              文件名: {activeTab.title}
            </span>
            <span>类型: {getFileTypeLabel(activeTab.fileType, activeTab.filePath)}</span>
          </>
        )}
        {cursorPosition && (
          <span>
            行列: {cursorPosition.line}:{cursorPosition.column}
          </span>
        )}
        {activeTab?.fileType === 'excel' && <span>Excel 表格</span>}
        <div className="flex items-center gap-1">
          <Database size={11} />
          <span>MagicCommander</span>
        </div>
      </div>
    </footer>
  )
}

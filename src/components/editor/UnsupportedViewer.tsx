import { FileWarning } from 'lucide-react'
import type { EditorTab } from '@/stores/editor.store'

interface UnsupportedViewerProps {
  tab: EditorTab
  type: string
}

export function UnsupportedViewer({ tab, type }: UnsupportedViewerProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-gray-500">
      <div className="text-center space-y-3 max-w-sm">
        <FileWarning size={48} className="mx-auto text-amber-400" />
        <p className="text-sm font-medium">不支持的文件格式</p>
        <p className="text-xs text-gray-400">
          {type}（{tab.title}）无法在编辑器中直接预览。
        </p>
        <p className="text-xs text-gray-400">
          请使用外部程序打开此文件。
        </p>
      </div>
    </div>
  )
}

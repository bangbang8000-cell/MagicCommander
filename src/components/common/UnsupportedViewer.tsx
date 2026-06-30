import { useUIStore } from '@/stores/ui.store'
import { FileWarning } from 'lucide-react'

export function UnsupportedViewer() {
  const isDark = useUIStore((s) => s.isDark)
  return (
    <div className={`absolute inset-0 flex items-center justify-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
      <div className="text-center space-y-3 max-w-sm">
        <FileWarning size={48} className="mx-auto text-amber-400" />
        <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>不支持的文件格式</p>
        <p className="text-xs text-gray-500">请使用外部程序打开此文件。</p>
      </div>
    </div>
  )
}

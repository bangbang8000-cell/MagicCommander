import { Settings } from 'lucide-react'
import clsx from 'clsx'

type WorkbenchOutputCardProps = {
  outputFormat: 'device_name' | 'device_sn'
  renderType: 'project' | 'yaml'
  isDark: boolean
  onOutputFormatChange: (format: 'device_name' | 'device_sn') => void
  onRenderTypeChange: (type: 'project' | 'yaml') => void
}

export function WorkbenchOutputCard({
  outputFormat,
  renderType,
  isDark,
  onOutputFormatChange,
  onRenderTypeChange,
}: WorkbenchOutputCardProps) {
  return (
    <div className="space-y-2">
      <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
        <Settings size={12} /> 输出设置
      </h4>
      <div className="space-y-1.5">
        <div className={clsx('flex items-center gap-1 text-[10px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
          <span className="min-w-[36px]">格式</span>
          <select
            value={outputFormat}
            onChange={(e) => onOutputFormatChange(e.target.value as 'device_name' | 'device_sn')}
            className={clsx(
              'text-[10px] border rounded px-1 py-0.5 flex-1',
              isDark ? 'border-gray-600 bg-gray-800 text-gray-200' : 'border-gray-300 text-gray-700',
            )}
          >
            <option value="device_name">设备名</option>
            <option value="device_sn">设备 SN</option>
          </select>
        </div>
        <div className={clsx('flex items-center gap-1 text-[10px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
          <span className="min-w-[36px]">类型</span>
          <select
            value={renderType}
            onChange={(e) => onRenderTypeChange(e.target.value as 'project' | 'yaml')}
            className={clsx(
              'text-[10px] border rounded px-1 py-0.5 flex-1',
              isDark ? 'border-gray-600 bg-gray-800 text-gray-200' : 'border-gray-300 text-gray-700',
            )}
          >
            <option value="project">项目配置</option>
            <option value="yaml">YAML 文件</option>
          </select>
        </div>
      </div>
    </div>
  )
}
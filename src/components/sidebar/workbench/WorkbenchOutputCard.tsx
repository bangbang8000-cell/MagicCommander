import { Settings } from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('project')
  return (
    <div className="space-y-2">
      <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
        <Settings size={12} /> {t('workbench.outputSettings')}
      </h4>
      <div className="space-y-1.5">
        <div className={clsx('flex items-center gap-1 text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
          <span className="min-w-[36px]">{t('workbench.format')}</span>
          <select
            value={outputFormat}
            onChange={(e) => onOutputFormatChange(e.target.value as 'device_name' | 'device_sn')}
            className={clsx(
              'text-[11px] border rounded px-1 py-0.5 flex-1',
              isDark ? 'border-gray-600 bg-gray-800 text-gray-200' : 'border-gray-300 text-gray-700',
            )}
          >
            <option value="device_name">{t('workbench.deviceName')}</option>
            <option value="device_sn">{t('workbench.deviceSn')}</option>
          </select>
        </div>
        <div className={clsx('flex items-center gap-1 text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
          <span className="min-w-[36px]">{t('workbench.type')}</span>
          <select
            value={renderType}
            onChange={(e) => onRenderTypeChange(e.target.value as 'project' | 'yaml')}
            className={clsx(
              'text-[11px] border rounded px-1 py-0.5 flex-1',
              isDark ? 'border-gray-600 bg-gray-800 text-gray-200' : 'border-gray-300 text-gray-700',
            )}
          >
            <option value="project">{t('workbench.projectConfig')}</option>
            <option value="yaml">{t('workbench.yamlFile')}</option>
          </select>
        </div>
      </div>
    </div>
  )
}
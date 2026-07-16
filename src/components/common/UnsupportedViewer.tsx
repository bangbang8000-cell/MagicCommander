import { useTranslation } from 'react-i18next'
import { FileWarning } from 'lucide-react'

export function UnsupportedViewer() {
  const { t } = useTranslation()
  return (
    <div className="absolute inset-0 flex items-center justify-center text-gray-500">
      <div className="text-center space-y-3 max-w-sm">
        <FileWarning size={48} className="mx-auto text-amber-400" />
        <p className="text-sm font-medium text-gray-900">{t('editor:unsupported.title')}</p>
        <p className="text-xs text-gray-500">{t('editor:unsupported.openExternally')}</p>
      </div>
    </div>
  )
}

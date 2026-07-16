import { Play, FileOutput, FileCode, Eye } from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

type WorkbenchActionCardProps = {
  isRendering: boolean
  selectedProjectIds: string[]
  selectedProject: boolean
  isDark: boolean
  onBatchRender: () => void
  onSingleRender: () => void
  onDryRun: () => void
  onDeleteOutput: () => void
  onDeleteYaml: () => void
}

export function WorkbenchActionCard({
  isRendering,
  selectedProjectIds,
  selectedProject,
  isDark,
  onBatchRender,
  onSingleRender,
  onDryRun,
  onDeleteOutput,
  onDeleteYaml,
}: WorkbenchActionCardProps) {
  const { t } = useTranslation('project')
  const btnBase = clsx(
    'flex items-center gap-1.5 px-2 py-1.5 text-[11px] rounded transition-colors w-full',
    'disabled:opacity-40 disabled:cursor-not-allowed',
  )

  return (
    <div className="space-y-2">
      <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
        <Play size={12} /> {t('workbench.executeAction')}
      </h4>
      <div className="flex flex-col gap-1">
        <button
          onClick={onBatchRender}
          disabled={isRendering || selectedProjectIds.length === 0}
          className={clsx(btnBase, isDark ? 'bg-primary-600 hover:bg-primary-500 text-white' : 'bg-primary-600 hover:bg-primary-700 text-white')}
        >
          <Play size={12} />
          {t('workbench.batchRender', { count: selectedProjectIds.length })}
        </button>
        <button
          onClick={onSingleRender}
          disabled={isRendering || !selectedProject}
          className={clsx(btnBase, isDark ? 'bg-primary-900/40 hover:bg-primary-800/40 text-primary-200' : 'bg-primary-50 hover:bg-primary-100 text-primary-700')}
        >
          <Play size={12} />
          {t('workbench.renderCurrentOnly')}
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={onDryRun}
          disabled={isRendering || !selectedProject}
          className={clsx(btnBase, isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')}
        >
          <Eye size={12} />
          {t('workbench.dryRunPreview')}
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={onDeleteOutput}
          disabled={isRendering}
          className={clsx(btnBase, isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')}
        >
          <FileOutput size={12} />
          {t('workbench.deleteOutput')}
        </button>
        <button
          onClick={onDeleteYaml}
          disabled={isRendering}
          className={clsx(btnBase, isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')}
        >
          <FileCode size={12} />
          {t('workbench.deleteYaml')}
        </button>
      </div>
    </div>
  )
}
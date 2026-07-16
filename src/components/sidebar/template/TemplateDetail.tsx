import { useTranslation } from 'react-i18next'
import type { TemplateInfo } from '@/types/project'
import { ProjectExplorer } from '@/components/common/ProjectExplorer'
import { ProjectStatusBadge } from '@/components/sidebar/project/ProjectStatusBadge'

type TemplateDetailProps = {
  template: TemplateInfo | null
}

export function TemplateDetail({ template }: TemplateDetailProps) {
  const { t } = useTranslation('project')
  if (!template) {
    return <div className="p-3 text-xs text-gray-500 dark:text-gray-400">{t('template.detail.selectHint')}</div>
  }

  return (
    <div className="h-full overflow-auto p-3 text-xs space-y-3">
      <div>
        <div className="font-medium text-sm">{template.name}</div>
        <div className="text-gray-500 dark:text-gray-400 mt-1">{template.description || t('template.detail.noDescription')}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="text-gray-500 dark:text-gray-400">{t('template.detail.scenario')}</div>
          <div>{template.scenario || t('template.detail.notSet')}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400">{t('template.detail.sourceProject')}</div>
          <div>{template.sourceProject || t('template.detail.unknown')}</div>
        </div>
      </div>
      <div>
        <div className="text-gray-500 dark:text-gray-400 mb-1">{t('template.detail.structure')}</div>
        <ProjectStatusBadge status={template.structure} />
      </div>
      <div>
        <div className="text-gray-500 dark:text-gray-400 mb-1">{t('template.detail.inputRequirements')}</div>
        {template.inputRequirements.length > 0 ? (
          <ul className="list-disc pl-4 space-y-0.5">
            {template.inputRequirements.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : (
          <div>{t('template.detail.notSet')}</div>
        )}
      </div>
      <div>
        <div className="text-gray-500 dark:text-gray-400 mb-1">{t('template.detail.outputDescription')}</div>
        <div>{template.outputDescription || t('template.detail.notSet')}</div>
      </div>
      <div>
        <div className="text-gray-500 dark:text-gray-400 mb-1">{t('template.detail.fileStructure')}</div>
        <ProjectExplorer structure={template.files} />
      </div>
    </div>
  )
}

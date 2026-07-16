import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import type { TemplateInfo, TemplateMeta } from '@/types/project'

type TemplateEditDialogProps = {
  open: boolean
  template: TemplateInfo | null
  onClose: () => void
  onSubmit: (meta: Partial<TemplateMeta>) => Promise<void>
}

export function TemplateEditDialog({ open, template, onClose, onSubmit }: TemplateEditDialogProps) {
  const { t } = useTranslation('project')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scenario, setScenario] = useState('')
  const [sourceProject, setSourceProject] = useState('')
  const [inputRequirements, setInputRequirements] = useState('')
  const [outputDescription, setOutputDescription] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!template) return
    setName(template.name)
    setDescription(template.description)
    setScenario(template.scenario)
    setSourceProject(template.sourceProject)
    setInputRequirements(template.inputRequirements.join('\n'))
    setOutputDescription(template.outputDescription)
  }, [template])

  const submit = async () => {
    setLoading(true)
    try {
      await onSubmit({
        name,
        description,
        scenario,
        sourceProject,
        inputRequirements: inputRequirements.split('\n').map((item) => item.trim()).filter(Boolean),
        outputDescription,
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} title={t('template.edit.title')} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('template.edit.namePlaceholder')} className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('template.edit.descPlaceholder')} className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" rows={2} />
        <input value={scenario} onChange={(event) => setScenario(event.target.value)} placeholder={t('template.edit.scenarioPlaceholder')} className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
        <input value={sourceProject} onChange={(event) => setSourceProject(event.target.value)} placeholder={t('template.edit.sourcePlaceholder')} className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
        <textarea value={inputRequirements} onChange={(event) => setInputRequirements(event.target.value)} placeholder={t('template.edit.inputPlaceholder')} className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" rows={3} />
        <textarea value={outputDescription} onChange={(event) => setOutputDescription(event.target.value)} placeholder={t('template.edit.outputPlaceholder')} className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" rows={2} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700">{t('template.edit.cancel')}</button>
          <button onClick={submit} disabled={loading} className="px-3 py-1.5 rounded bg-primary-600 text-white disabled:opacity-50">{t('template.edit.save')}</button>
        </div>
      </div>
    </Modal>
  )
}

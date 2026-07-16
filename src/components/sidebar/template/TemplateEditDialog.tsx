import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { TemplateInfo, TemplateMeta } from '@/types/project'

type TemplateEditDialogProps = {
  open: boolean
  template: TemplateInfo | null
  onClose: () => void
  onSubmit: (meta: Partial<TemplateMeta>) => Promise<void>
}

export function TemplateEditDialog({ open, template, onClose, onSubmit }: TemplateEditDialogProps) {
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
    <Modal open={open} title="编辑模板信息" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="模板名称" className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="模板简介" className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" rows={2} />
        <input value={scenario} onChange={(event) => setScenario(event.target.value)} placeholder="适用场景" className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
        <input value={sourceProject} onChange={(event) => setSourceProject(event.target.value)} placeholder="来源项目" className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
        <textarea value={inputRequirements} onChange={(event) => setInputRequirements(event.target.value)} placeholder="输入要求，每行一项" className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" rows={3} />
        <textarea value={outputDescription} onChange={(event) => setOutputDescription(event.target.value)} placeholder="输出说明" className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" rows={2} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700">取消</button>
          <button onClick={submit} disabled={loading} className="px-3 py-1.5 rounded bg-primary-600 text-white disabled:opacity-50">保存</button>
        </div>
      </div>
    </Modal>
  )
}

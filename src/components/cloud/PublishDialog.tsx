import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlatformStore } from '@/stores/platform.store'
import { useUIStore } from '@/stores/ui.store'
import { Modal } from '@/components/ui/Modal'
import { showError, showSuccess } from '@/components/ui/Toast'
import clsx from 'clsx'
import type { TemplateInfo, FileNode } from '@/types/project'

interface PublishDialogProps {
  open: boolean
  template: TemplateInfo | null
  onClose: () => void
}

export function PublishDialog({ open, template, onClose }: PublishDialogProps) {
  const { t } = useTranslation('project')
  const isDark = useUIStore((s) => s.isDark)
  const publishTemplate = usePlatformStore((s) => s.publishTemplate)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('switch')
  const [isPublic, setIsPublic] = useState(true)
  const [publishing, setPublishing] = useState(false)

  const CATEGORIES = [
    { value: 'switch', label: t('template.pubCategory.switch') },
    { value: 'router', label: t('template.pubCategory.router') },
    { value: 'firewall', label: t('template.pubCategory.firewall') },
    { value: 'server', label: t('template.pubCategory.server') },
    { value: 'other', label: t('template.pubCategory.other') },
  ]

  useMemo(() => {
    if (open && template) {
      setName(template.name)
      setDescription(template.description || '')
      setCategory(template.scenario || 'switch')
      setIsPublic(true)
    }
  }, [open, template])

  const handlePublish = async () => {
    if (!template || !name.trim()) return
    setPublishing(true)
    try {
      const files: { path: string; content: string }[] = []
      if (!template.files || template.files.length === 0) {
        throw new Error(t('template.noFilesToPublish'))
      }

      const collectFiles = async (items: FileNode[], prefix = '') => {
        for (const item of items) {
          if (item.isDirectory && item.children) {
            await collectFiles(item.children, prefix + item.name + '/')
          } else if (!item.isDirectory) {
            try {
              const ext = item.name.split('.').pop()?.toLowerCase()
              let content: string
              if (ext === 'xlsx' || ext === 'xls') {
                const sheets = await window.electron.project.readTemplateExcel(template.id, item.path)
                content = JSON.stringify(sheets)
              } else {
                content = await window.electron.project.readTemplateFile(template.id, item.path)
              }
              files.push({ path: prefix + item.name, content })
            } catch { /* skip files that can't be read */ }
          }
        }
      }
      await collectFiles(template.files)

      if (files.length === 0) {
        throw new Error(t('template.noFilesToPublish'))
      }

      await publishTemplate({
        name: name.trim(),
        description: description.trim(),
        category,
        public: isPublic,
        files,
      })

      showSuccess(t('template.publishSuccess', { name: name.trim() }))
      onClose()
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('template.publish')}
      width="420px"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className={clsx(
              'px-4 py-1.5 text-sm rounded border transition-colors',
              isDark
                ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50',
            )}
          >
            {t('template.edit.cancel')}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || !name.trim()}
            className={clsx(
              'px-4 py-1.5 text-sm rounded text-white transition-colors',
              publishing || !name.trim()
                ? 'bg-indigo-500/50 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500',
            )}
          >
            {publishing ? t('template.publishing') : t('template.publish')}
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-2">
        <div>
          <label className={clsx('text-xs font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
            {t('template.edit.name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={clsx(
              'w-full mt-1 px-3 py-2 rounded border text-sm',
              isDark
                ? 'bg-gray-800 border-gray-600 text-gray-100 focus:border-indigo-500'
                : 'bg-white border-gray-300 text-gray-900 focus:border-indigo-500',
            )}
          />
        </div>

        <div>
          <label className={clsx('text-xs font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
            {t('template.edit.description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={clsx(
              'w-full mt-1 px-3 py-2 rounded border text-sm resize-none',
              isDark
                ? 'bg-gray-800 border-gray-600 text-gray-100 focus:border-indigo-500'
                : 'bg-white border-gray-300 text-gray-900 focus:border-indigo-500',
            )}
          />
        </div>

        <div>
          <label className={clsx('text-xs font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
            {t('template.edit.category')}
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={clsx(
              'w-full mt-1 px-3 py-2 rounded border text-sm',
              isDark
                ? 'bg-gray-800 border-gray-600 text-gray-100'
                : 'bg-white border-gray-300 text-gray-900',
            )}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className={clsx('text-xs font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
            {t('template.edit.public')}
          </label>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="rounded"
          />
          <span className={clsx('text-xs', isDark ? 'text-gray-500' : 'text-gray-400')}>
            {isPublic
              ? t('template.edit.publicHint')
              : t('template.edit.privateHint')}
          </span>
        </div>
      </div>
    </Modal>
  )
}
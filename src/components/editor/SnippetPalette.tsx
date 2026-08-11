import { useCallback, useEffect, useState } from 'react'
import { Scissors, Plus, X, FileCode, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import type * as monacoEditor from 'monaco-editor'
import type { SnippetInfo } from '@/types/ipc'
import { showSuccess, showError } from '@/components/ui/Toast'

type EditorInstance = monacoEditor.editor.IStandaloneCodeEditor

type SnippetPaletteProps = {
  editor: EditorInstance | null
  isDark: boolean
}

export function SnippetPalette({ editor, isDark }: SnippetPaletteProps) {
  const { t } = useTranslation('project')
  const [open, setOpen] = useState(false)
  const [snippets, setSnippets] = useState<SnippetInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')

  const refresh = useCallback(async () => {
    try {
      setSnippets(await window.electron.project.listSnippets())
    } catch {
      setSnippets([])
    }
  }, [])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const insertAtCursor = useCallback(
    (text: string) => {
      if (!editor) return
      const selection = editor.getSelection()
      const range = selection ?? editor.getModel()?.getFullModelRange() ?? undefined
      if (!range) return
      editor.executeEdits('snippet', [{ range, text }])
      editor.focus()
    },
    [editor],
  )

  const handleInsertContent = useCallback(
    async (s: SnippetInfo) => {
      try {
        const content = await window.electron.project.getSnippet(s.file)
        insertAtCursor(content)
        showSuccess(`${t('snippet.inserted')}: ${s.name}`)
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err))
      }
    },
    [insertAtCursor, t],
  )

  const handleInsertInclude = useCallback(
    (s: SnippetInfo) => {
      insertAtCursor(`{% include '${s.file}' %}`)
      showSuccess(`${t('snippet.inserted')}: include ${s.file}`)
    },
    [insertAtCursor, t],
  )

  const handleDelete = useCallback(
    async (s: SnippetInfo) => {
      try {
        await window.electron.project.deleteSnippet(s.file)
        refresh()
        showSuccess(`${t('snippet.deleted')}: ${s.name}`)
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err))
      }
    },
    [refresh, t],
  )

  const saveSelection = useCallback(async () => {
    if (!editor || !newName.trim()) return
    setSaving(true)
    try {
      const selection = editor.getSelection()
      const model = editor.getModel()
      const content = selection ? (model?.getValueInRange(selection) ?? '') : (model?.getValue() ?? '')
      await window.electron.project.saveSnippet({
        name: newName.trim(),
        content,
        category: '通用',
        description: '',
      })
      setNewName('')
      refresh()
      showSuccess(t('snippet.saved'))
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [editor, newName, refresh, t])

  return (
    <div className="absolute right-2 bottom-2 z-20">
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] shadow-md transition-colors',
          open
            ? 'bg-primary-600 text-white'
            : isDark
              ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50',
        )}
        title={t('snippet.title')}
      >
        <Scissors size={12} />
        {t('snippet.title')}
      </button>

      {open && (
        <div
          className={clsx(
            'absolute right-0 bottom-8 w-80 rounded-lg shadow-xl overflow-hidden border',
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
          )}
        >
          <div
            className={clsx(
              'flex items-center justify-between px-2 py-1.5 border-b text-[11px] font-medium',
              isDark ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-700',
            )}
          >
            {t('snippet.title')}
            <button
              onClick={() => setOpen(false)}
              className={isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}
            >
              <X size={12} />
            </button>
          </div>

          {/* 保存选区为片段 */}
          <div className={clsx('px-2 py-1.5 flex gap-1 border-b', isDark ? 'border-gray-700' : 'border-gray-200')}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('snippet.savePlaceholder')}
              className={clsx(
                'flex-1 min-w-0 text-[11px] px-1.5 py-0.5 rounded border',
                isDark ? 'border-gray-600 bg-gray-900 text-gray-200' : 'border-gray-300 text-gray-800',
              )}
            />
            <button
              onClick={saveSelection}
              disabled={saving || !newName.trim()}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <Plus size={10} /> {t('snippet.save')}
            </button>
          </div>

          {/* 片段列表 */}
          <div className="max-h-48 overflow-auto">
            {snippets.length === 0 ? (
              <div className={clsx('px-3 py-4 text-center text-[11px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
                {t('snippet.empty')}
              </div>
            ) : (
              snippets.map((s) => (
                <div
                  key={s.file}
                  className={clsx(
                    'flex items-center gap-1 px-2 py-1 hover:bg-gray-700/40 group',
                    isDark ? 'border-b border-gray-700/50' : 'border-b border-gray-100',
                  )}
                >
                  <FileCode size={11} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] truncate text-gray-200">{s.name}</div>
                    {s.description && <div className="text-[10px] text-gray-500 truncate">{s.description}</div>}
                  </div>
                  <button
                    onClick={() => handleInsertContent(s)}
                    className="px-1 py-0.5 rounded text-[10px] bg-gray-700 text-gray-200 hover:bg-gray-600"
                    title={t('snippet.insertContent')}
                  >
                    {t('snippet.insert')}
                  </button>
                  <button
                    onClick={() => handleInsertInclude(s)}
                    className="px-1 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300 hover:bg-gray-600"
                    title={t('snippet.insertInclude')}
                  >
                    include
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400"
                    title={t('snippet.delete')}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Boxes, X, Camera, RotateCcw, Play, Loader2, History } from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import type { TemplateVersion } from '@/types/ipc'
import type { EditorTab } from '@/stores/editor.store'
import { showSuccess, showError } from '@/components/ui/Toast'

type TemplateAssetPanelProps = {
  tab: EditorTab
  isDark: boolean
}

export function TemplateAssetPanel({ tab, isDark }: TemplateAssetPanelProps) {
  const { t } = useTranslation('project')
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'versions' | 'preview'>('versions')
  const [versions, setVersions] = useState<TemplateVersion[]>([])
  const [note, setNote] = useState('')
  const [previewResults, setPreviewResults] = useState<Array<{ device: string; content: string }>>([])
  const [selectedDevice, setSelectedDevice] = useState('')
  const [busy, setBusy] = useState(false)

  const refreshVersions = useCallback(async () => {
    try {
      setVersions(await window.electron.project.templateHistory(tab.projectId, tab.filePath))
    } catch {
      setVersions([])
    }
  }, [tab.projectId, tab.filePath])

  useEffect(() => {
    if (open && activeTab === 'versions') refreshVersions()
  }, [open, activeTab, refreshVersions])

  const handleSnapshot = useCallback(async () => {
    setBusy(true)
    try {
      await window.electron.project.templateSnapshot(tab.projectId, tab.filePath, note)
      setNote('')
      await refreshVersions()
      showSuccess(t('templateAsset.snapshotted'))
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [tab.projectId, tab.filePath, note, refreshVersions, t])

  const handleRestore = useCallback(
    async (v: TemplateVersion) => {
      setBusy(true)
      try {
        await window.electron.project.templateRestore(tab.projectId, tab.filePath, v.version)
        showSuccess(`${t('templateAsset.restored')} ${v.timestamp}`)
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [tab.projectId, tab.filePath, t],
  )

  const handlePreview = useCallback(async () => {
    setBusy(true)
    try {
      const r = await window.electron.project.templatePreview(String(tab.projectId), tab.filePath)
      const results = r.results || []
      setPreviewResults(results)
      setSelectedDevice(results[0]?.device || '')
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [tab.projectId, tab.filePath])

  const activePreview = previewResults.find((r) => r.device === selectedDevice)
  const currentOutput = activePreview?.content ?? ''

  return (
    <div className="absolute right-[76px] bottom-2 z-20">
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
        title={t('templateAsset.title')}
      >
        <Boxes size={12} />
        {t('templateAsset.title')}
      </button>

      {open && (
        <div
          className={clsx(
            'absolute right-0 bottom-8 w-[480px] rounded-lg shadow-xl overflow-hidden border',
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
          )}
        >
          <div
            className={clsx(
              'flex items-center justify-between px-2 py-1.5 border-b text-[11px] font-medium',
              isDark ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-700',
            )}
          >
            <div className="flex items-center gap-1">
              <History size={11} /> {t('templateAsset.title')}
              <span className="text-[10px] text-gray-500 ml-1">{tab.filePath}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className={isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}
            >
              <X size={12} />
            </button>
          </div>

          {/* 标签切换 */}
          <div className={clsx('flex border-b', isDark ? 'border-gray-700' : 'border-gray-200')}>
            <button
              onClick={() => setActiveTab('versions')}
              className={clsx(
                'flex-1 py-1 text-[11px]',
                activeTab === 'versions' ? 'text-primary-400 border-b-2 border-primary-500' : 'text-gray-500',
              )}
            >
              {t('templateAsset.versions')}
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={clsx(
                'flex-1 py-1 text-[11px]',
                activeTab === 'preview' ? 'text-primary-400 border-b-2 border-primary-500' : 'text-gray-500',
              )}
            >
              {t('templateAsset.preview')}
            </button>
          </div>

          {activeTab === 'versions' ? (
            <div>
              {/* 快照 */}
              <div className={clsx('px-2 py-1.5 flex gap-1 border-b', isDark ? 'border-gray-700' : 'border-gray-200')}>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('templateAsset.notePlaceholder')}
                  className={clsx(
                    'flex-1 min-w-0 text-[11px] px-1.5 py-0.5 rounded border',
                    isDark ? 'border-gray-600 bg-gray-900 text-gray-200' : 'border-gray-300 text-gray-800',
                  )}
                />
                <button
                  onClick={handleSnapshot}
                  disabled={busy}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  <Camera size={10} /> {t('templateAsset.snapshot')}
                </button>
              </div>
              <div className="max-h-48 overflow-auto">
                {versions.length === 0 ? (
                  <div
                    className={clsx('px-3 py-4 text-center text-[11px]', isDark ? 'text-gray-500' : 'text-gray-400')}
                  >
                    {t('templateAsset.historyEmpty')}
                  </div>
                ) : (
                  versions
                    .slice()
                    .reverse()
                    .map((v) => (
                      <div
                        key={v.version}
                        className={clsx(
                          'flex items-center gap-1 px-2 py-1',
                          isDark ? 'border-b border-gray-700/50' : 'border-b border-gray-100',
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className={clsx('text-[11px] truncate', isDark ? 'text-gray-300' : 'text-gray-700')}>
                            {new Date(v.timestamp).toLocaleString()}
                          </div>
                          {v.note && <div className="text-[10px] text-gray-500 truncate">{v.note}</div>}
                        </div>
                        <button
                          onClick={() => handleRestore(v)}
                          disabled={busy}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50"
                        >
                          <RotateCcw size={10} /> {t('templateAsset.restore')}
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          ) : (
            <div>
              <div
                className={clsx(
                  'px-2 py-1.5 flex gap-1 border-b items-center',
                  isDark ? 'border-gray-700' : 'border-gray-200',
                )}
              >
                <button
                  onClick={handlePreview}
                  disabled={busy}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                  {t('templateAsset.previewRun')}
                </button>
                {previewResults.length > 0 && (
                  <select
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    className={clsx(
                      'text-[11px] px-1.5 py-0.5 rounded border flex-1',
                      isDark ? 'border-gray-600 bg-gray-900 text-gray-200' : 'border-gray-300 text-gray-800',
                    )}
                  >
                    {previewResults.map((r) => (
                      <option key={r.device} value={r.device}>
                        {r.device}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div
                className={clsx(
                  'p-2 max-h-56 overflow-auto font-mono text-[11px] whitespace-pre-wrap',
                  isDark ? 'bg-gray-900 text-green-400' : 'bg-gray-50 text-gray-800',
                )}
              >
                {currentOutput || t('templateAsset.previewEmpty')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

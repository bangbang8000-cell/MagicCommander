import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useRenderStore } from '@/stores/render.store'
import { Button } from '@/components/ui/Button'
import { FileText, Printer, FileDown, Trash2, Settings } from 'lucide-react'
import clsx from 'clsx'
import type { LabelPrintConfig } from '@/types/render'
import { DEFAULT_LABEL_CONFIG } from '@/types/render'

interface WorkbenchLabelCardProps {
  selectedProjectIds: string[]
  isDark: boolean
}

export function WorkbenchLabelCard({ selectedProjectIds, isDark }: WorkbenchLabelCardProps) {
  const { t } = useTranslation('project')
  const isLabelPrinting = useRenderStore((s) => s.isLabelPrinting)
  const labelMarkdown = useRenderStore((s) => s.labelMarkdown)
  const labelPrint = useRenderStore((s) => s.labelPrint)
  const labelPdf = useRenderStore((s) => s.labelPdf)
  const labelDelete = useRenderStore((s) => s.labelDelete)

  const [showPrintConfig, setShowPrintConfig] = useState(false)
  const [printConfig, setPrintConfig] = useState<LabelPrintConfig>(DEFAULT_LABEL_CONFIG)

  const handleLabelMarkdown = useCallback(async () => {
    if (selectedProjectIds.length === 0) return
    await labelMarkdown(selectedProjectIds, printConfig)
  }, [selectedProjectIds, labelMarkdown, printConfig])

  const handleLabelPrint = useCallback(async () => {
    if (selectedProjectIds.length === 0) return
    await labelPrint(selectedProjectIds, printConfig)
  }, [selectedProjectIds, labelPrint, printConfig])

  const handleLabelPdf = useCallback(async () => {
    if (selectedProjectIds.length === 0) return
    await labelPdf(selectedProjectIds, printConfig)
  }, [selectedProjectIds, labelPdf, printConfig])

  const handleLabelDelete = useCallback(async () => {
    if (selectedProjectIds.length === 0) return
    const ok = await window.electron.dialog.showConfirm({
      title: t('label.confirmDeleteLabel'),
      message: t('label.confirmDeleteLabelMessage'),
    })
    if (ok) await labelDelete(selectedProjectIds)
  }, [selectedProjectIds, labelDelete, t])

  const noSelection = selectedProjectIds.length === 0

  return (
    <>
      <div className={clsx('border-t', isDark ? 'border-gray-700' : 'border-gray-200')} />
      <div>
        <h4 className={clsx('text-xs font-semibold mb-2 flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
          <FileText size={12} />
          {t('label.title')}
        </h4>
        <div className="flex flex-col gap-1">
          <Button
            variant="primary"
            size="sm"
            icon={<FileText size={12} />}
            onClick={handleLabelMarkdown}
            disabled={noSelection || isLabelPrinting}
            loading={isLabelPrinting}
            className="w-full justify-start"
          >
            {t('label.generateMarkdown')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Printer size={12} />}
            onClick={handleLabelPrint}
            disabled={noSelection || isLabelPrinting}
            className="w-full justify-start"
          >
            {t('label.exportWord')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<FileDown size={12} />}
            onClick={handleLabelPdf}
            disabled={noSelection || isLabelPrinting}
            className="w-full justify-start"
          >
            {t('label.exportPdf')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Trash2 size={12} />}
            onClick={handleLabelDelete}
            disabled={noSelection}
            className="w-full justify-start"
          >
            {t('label.deleteLabels')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Settings size={12} />}
            onClick={() => setShowPrintConfig(!showPrintConfig)}
            className="w-full justify-start"
          >
            {t('label.printSettings')}
          </Button>
        </div>

        {showPrintConfig && (
          <div className={clsx('mt-2 border rounded p-2 space-y-2', isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200')}>
            <h5 className={clsx('text-[11px] font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
              {t('label.printConfig')}
            </h5>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center gap-1">
                <label className={clsx('w-14 shrink-0', isDark ? 'text-gray-400' : 'text-gray-600')}>
                  {t('label.paper')}
                </label>
                <select
                  value={printConfig.format}
                  onChange={(e) => setPrintConfig((p) => ({ ...p, format: e.target.value as any }))}
                  className={clsx('flex-1 px-1 py-0.5 border rounded', isDark ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900')}
                >
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                  <option value="custom">{t('label.custom')}</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <label className={clsx('w-14 shrink-0', isDark ? 'text-gray-400' : 'text-gray-600')}>
                  {t('label.orientation')}
                </label>
                <select
                  value={printConfig.orientation}
                  onChange={(e) => setPrintConfig((p) => ({ ...p, orientation: e.target.value as any }))}
                  className={clsx('flex-1 px-1 py-0.5 border rounded', isDark ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900')}
                >
                  <option value="portrait">{t('label.portrait')}</option>
                  <option value="landscape">{t('label.landscape')}</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <label className={clsx('w-14 shrink-0', isDark ? 'text-gray-400' : 'text-gray-600')}>
                  {t('label.labelsPerPage')}
                </label>
                <input
                  type="number"
                  value={printConfig.labelsPerPage}
                  onChange={(e) => setPrintConfig((p) => ({ ...p, labelsPerPage: parseInt(e.target.value) || 1 }))}
                  min={1}
                  max={32}
                  className={clsx('flex-1 px-1 py-0.5 border rounded w-16', isDark ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900')}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

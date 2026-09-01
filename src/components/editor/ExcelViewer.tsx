import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore, type EditorTab } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { useUndoStore } from '@/stores/undo.store'
import { useHotkey } from '@/hooks/useHotkey'
import { RefreshCw, AlertCircle, Undo2, Redo2 } from 'lucide-react'
import { showSuccess, showError } from '@/components/ui/Toast'
import { prepareExcelSheets } from '@/workers/excelPrepClient'
import { measureAsync } from '@/utils/perf'
import { VirtualizedExcelTable } from './VirtualizedExcelTable'

interface SheetData {
  name: string
  headers: string[]
  rows: Record<string, unknown>[]
}

export function ExcelViewer({ tab }: { tab: EditorTab }) {
  const updateContent = useEditorStore((s) => s.updateContent)
  const markDirty = useEditorStore((s) => s.markDirty)
  const registerSaveFn = useEditorStore((s) => s.registerSaveFn)
  const isDark = useUIStore((s) => s.isDark)
  const { t } = useTranslation('project')

  const [sheets, setSheets] = useState<SheetData[]>([])
  const [activeSheet, setActiveSheet] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(null)
  const [editValue, setEditValue] = useState('')

  // 使用 ref 跟踪组件是否已卸载，防止 setState after unmount
  const isMountedRef = useRef(true)
  // 跟踪当前正在加载的文件路径，防止重复请求
  const loadingFilePathRef = useRef<string | null>(null)
  // 当前表格引用（撤销/重做读取最新值，避免闭包过期）
  const sheetsRef = useRef<SheetData[]>([])
  sheetsRef.current = sheets

  // V4.2.0-42-b：撤销/重做可用性（订阅栈深，驱动工具条按钮态）
  const canUndo = useUndoStore((s) => (s.undoStack[tab.id] || []).length > 0)
  const canRedo = useUndoStore((s) => (s.redoStack[tab.id] || []).length > 0)

  const applySnapshot = useCallback(
    (result: { ok: boolean; snapshot: unknown | null }) => {
      if (!result.ok || result.snapshot === null) return
      const next = result.snapshot as SheetData[]
      setSheets(next)
      updateContent(tab.id, next)
      markDirty(tab.id, true)
    },
    [tab.id, updateContent, markDirty],
  )

  const handleUndo = useCallback(() => {
    applySnapshot(useUndoStore.getState().undo(tab.id, sheetsRef.current))
  }, [tab.id, applySnapshot])

  const handleRedo = useCallback(() => {
    applySnapshot(useUndoStore.getState().redo(tab.id, sheetsRef.current))
  }, [tab.id, applySnapshot])

  // V4.2.0-42-b：Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z（输入框内不拦截，交给原生行为）
  useHotkey('ctrl+z', handleUndo, [handleUndo])
  useHotkey('ctrl+y', handleRedo, [handleRedo])
  useHotkey('ctrl+shift+z', handleRedo, [handleRedo])

  const loadData = useCallback(async () => {
    const currentPath = `${tab.projectId}:${tab.filePath}`

    // 如果已经在加载同一个文件，跳过
    if (loadingFilePathRef.current === currentPath) {
      return
    }

    loadingFilePathRef.current = currentPath
    setLoading(true)
    setError(null)

    try {
      const result = await Promise.race([
        window.electron.project.readExcel(tab.projectId, tab.filePath, tab.projectName),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(t('excel.timeout'))), 10000)),
      ])

      if (!isMountedRef.current) return

      // 4.2.0-42-d：大参数表数据准备（万行走 Web Worker，主线程不阻塞；小表同步零开销）
      const prep = await measureAsync('Excel 参数表数据准备', 'render', () =>
        prepareExcelSheets(Array.isArray(result) ? result : []),
      )
      if (!isMountedRef.current) return
      const normalized: SheetData[] = prep.sheets

      setSheets(normalized)
      setActiveSheet(normalized[0]?.name ?? '')
      updateContent(tab.id, normalized)
    } catch (err) {
      if (!isMountedRef.current) return
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      showError(t('excel.readFailedMsg', { message: msg }))
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
        loadingFilePathRef.current = null
      }
    }
  }, [tab.filePath, tab.id, tab.projectId, tab.projectName, updateContent, t])

  const handleSave = useCallback(async () => {
    try {
      await window.electron.project.writeExcel(
        tab.projectId,
        tab.filePath,
        sheets as { name: string; headers: string[]; rows: Record<string, unknown>[] }[],
        tab.projectName,
      )
      markDirty(tab.id, false)
      showSuccess(t('excel.saveSuccess', { name: tab.title }))
    } catch (err) {
      showError(t('excel.saveFailed', { message: (err as Error).message }))
    }
  }, [tab.id, tab.filePath, tab.projectId, tab.projectName, tab.title, sheets, markDirty, t])

  useEffect(() => {
    isMountedRef.current = true
    registerSaveFn(tab.id, handleSave)
    return () => {
      isMountedRef.current = false
      loadingFilePathRef.current = null
    }
  }, [tab.id, registerSaveFn, handleSave])

  // 仅在文件路径变化时加载，不要依赖 tab.content（会触发竞态）
  useEffect(() => {
    // 如果 store 层已经有缓存（首次从文件加载后写入，或其他路径传入），直接使用
    if (tab.content !== undefined && Array.isArray(tab.content)) {
      const cached = tab.content as SheetData[]
      setSheets(cached)
      setActiveSheet(cached[0]?.name ?? '')
      setLoading(false)
      return
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意不依赖 tab.content，避免加载竞态（见上方注释）
  }, [loadData])

  const currentSheet = sheets.find((s) => s.name === activeSheet)

  const handleCellClick = (rowIndex: number, colIndex: number, value: string) => {
    setEditCell({ row: rowIndex, col: colIndex })
    setEditValue(String(value ?? ''))
  }

  const handleCellSave = () => {
    if (!editCell || !currentSheet) return
    // V4.2.0-42-b：编辑前压入撤销快照（深拷贝；新编辑清空 redo）
    useUndoStore.getState().record(tab.id, sheets)
    const newSheets = sheets.map((s) => {
      if (s.name !== activeSheet) return s
      const newRows = [...s.rows]
      const header = String(s.headers[editCell.col] ?? '')
      newRows[editCell.row] = { ...newRows[editCell.row], [header]: editValue }
      return { ...s, rows: newRows }
    })
    setSheets(newSheets)
    updateContent(tab.id, newSheets)
    markDirty(tab.id, true)
    setEditCell(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellSave()
    } else if (e.key === 'Escape') {
      setEditCell(null)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      handleCellSave()
      if (editCell && currentSheet) {
        const nextCol = editCell.col + 1
        if (nextCol < currentSheet.headers.length) {
          const value = String(currentSheet.rows[editCell.row]?.[currentSheet.headers[nextCol]] ?? '')
          setEditCell({ row: editCell.row, col: nextCol })
          setEditValue(value)
        }
      }
    }
  }

  if (loading) {
    return (
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center gap-2 ${isDark ? 'text-gray-400' : 'text-gray-400'}`}
      >
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">{t('excel.loading')}</span>
        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{tab.filePath}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 ${isDark ? 'text-red-400' : 'text-red-500'}`}
      >
        <AlertCircle size={32} />
        <span className="font-medium">{t('excel.loadFailed')}</span>
        <span className="text-sm text-center max-w-md">{error}</span>
        <button
          onClick={loadData}
          className={`mt-2 flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-colors ${
            isDark ? 'border-red-700 hover:bg-red-900/30 text-red-400' : 'border-red-300 hover:bg-red-50 text-red-500'
          }`}
        >
          <RefreshCw size={12} />
          {t('excel.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* 工作表切换栏 */}
      <div
        className={`flex items-center gap-1 px-2 py-1.5 border-b shrink-0 overflow-x-auto ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
      >
        {sheets.map((s) => (
          <button
            key={s.name}
            onClick={() => setActiveSheet(s.name)}
            className={`text-xs px-2 py-0.5 rounded whitespace-nowrap shrink-0 ${
              activeSheet === s.name
                ? isDark
                  ? 'bg-gray-900 border border-gray-600 text-gray-100'
                  : 'bg-white border border-gray-300 text-gray-900'
                : isDark
                  ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-700'
                  : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.name}
            <span className={`ms-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              ({t('excel.rows', { count: s.rows.length })})
            </span>
          </button>
        ))}
        <div className="flex-1" />
        {/* V4.2.0-42-b：撤销/重做工具条（Ctrl+Z / Ctrl+Y 等效） */}
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className={`p-1 rounded shrink-0 disabled:opacity-30 ${
            isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-400'
          }`}
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 size={12} />
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className={`p-1 rounded shrink-0 disabled:opacity-30 ${
            isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-400'
          }`}
          title="重做 (Ctrl+Y)"
        >
          <Redo2 size={12} />
        </button>
        <button
          onClick={loadData}
          className={`p-1 rounded shrink-0 ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-400'}`}
          title="刷新"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* 数据表格（4.2.0-42-d：虚拟化，仅渲染可见区域行，万行参数表滚动不卡） */}
      {currentSheet ? (
        <VirtualizedExcelTable
          sheet={currentSheet}
          editCell={editCell}
          editValue={editValue}
          isDark={isDark}
          onCellClick={handleCellClick}
          onCellSave={handleCellSave}
          onCellKeyDown={handleKeyDown}
          onEditValueChange={setEditValue}
        />
      ) : (
        <div
          className={`flex items-center justify-center h-full text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
        >
          {t('excel.noData')}
        </div>
      )}
    </div>
  )
}

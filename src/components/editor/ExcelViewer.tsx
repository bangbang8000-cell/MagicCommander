import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore, type EditorTab } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { showSuccess, showError } from '@/components/ui/Toast'

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

      const normalized: SheetData[] = Array.isArray(result)
        ? result.map((s) => ({
            name: s.name || 'Sheet1',
            headers: Array.isArray(s.headers) ? s.headers : [],
            rows: Array.isArray(s.rows) ? s.rows : [],
          }))
        : []

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
  }, [tab.filePath, tab.id, tab.projectId, updateContent])

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
  }, [tab.id, tab.filePath, tab.projectId, tab.title, sheets, markDirty])

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
  }, [loadData])

  const currentSheet = sheets.find((s) => s.name === activeSheet)

  const handleCellClick = (rowIndex: number, colIndex: number, value: string) => {
    setEditCell({ row: rowIndex, col: colIndex })
    setEditValue(String(value ?? ''))
  }

  const handleCellSave = () => {
    if (!editCell || !currentSheet) return
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
            <span className={`ms-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>({t('excel.rows', { count: s.rows.length })})</span>
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={loadData}
          className={`p-1 rounded shrink-0 ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-400'}`}
          title="刷新"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* 数据表格 */}
      <div className="flex-1 overflow-auto min-h-0">
        {currentSheet ? (
          <table className={`border-collapse text-xs ${isDark ? 'text-gray-200' : ''}`}>
            <thead>
              <tr className={`sticky top-0 z-10 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <th
                  className={`border px-2 py-1.5 text-center w-10 font-medium select-none ${isDark ? 'border-gray-700 text-gray-400 bg-gray-800' : 'border-gray-300 text-gray-500'}`}
                >
                  #
                </th>
                {currentSheet.headers.map((h, i) => (
                  <th
                    key={i}
                    className={`border px-2 py-1.5 whitespace-nowrap min-w-[80px] font-medium select-none ${
                      isDark ? 'border-gray-700 text-gray-300 bg-gray-800' : 'border-gray-300 text-gray-700'
                    }`}
                  >
                    {String(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentSheet.rows.map((row, ri) => (
                <tr key={ri} className={isDark ? 'hover:bg-gray-800' : 'hover:bg-blue-50'}>
                  <td
                    className={`border px-2 py-0.5 text-center w-10 font-mono ${isDark ? 'border-gray-700 text-gray-500 bg-gray-900' : 'border-gray-300 text-gray-400 bg-gray-50'}`}
                  >
                    {ri + 1}
                  </td>
                  {currentSheet.headers.map((h, ci) => {
                    const value = String(row[h] ?? '')
                    const isEditing = editCell?.row === ri && editCell?.col === ci
                    return (
                      <td
                        key={ci}
                        className={`border px-2 py-0.5 cursor-cell min-w-[80px] ${
                          isDark
                            ? 'border-gray-700 text-gray-200 hover:bg-gray-700'
                            : 'border-gray-300 text-gray-800 hover:bg-blue-100'
                        }`}
                        onClick={() => handleCellClick(ri, ci, value)}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={handleKeyDown}
                            className={`w-full outline-none px-1 py-0 ${isDark ? 'bg-gray-700 text-gray-100' : 'bg-blue-50'}`}
                            autoFocus
                          />
                        ) : (
                          <span className="whitespace-nowrap">{value || '\u00A0'}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div
            className={`flex items-center justify-center h-full text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
          >
            {t('excel.noData')}
          </div>
        )}
      </div>
    </div>
  )
}

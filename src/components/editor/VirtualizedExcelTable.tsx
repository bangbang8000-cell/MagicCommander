/**
 * 4.2.0-42-d（F2-4）：Excel 大参数表虚拟化组件（@tanstack/react-virtual）
 *
 * 热点：万行参数表全量渲染为数千个 <tr> DOM 节点，滚动/编辑卡顿。
 * 方案：仅渲染可见区域行（固定行高 + overscan 预渲染），大数据量滚动不卡。
 * 列布局与既有 ExcelViewer 表格一致（# 列 40px，其余列 min-width 80px + 内容撑宽）。
 */
import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'

/** 行高（px），虚拟列表固定行高估算 */
export const EXCEL_ROW_HEIGHT = 24
/** 行号列宽（px） */
export const EXCEL_ROW_NUMBER_WIDTH = 40
/** 数据列最小宽度（px） */
export const EXCEL_COL_MIN_WIDTH = 80
/** 预渲染上下行数，减少滚动闪烁 */
const OVERSCAN = 12

export interface ExcelSheetView {
  name: string
  headers: string[]
  rows: Record<string, unknown>[]
}

type VirtualizedExcelTableProps = {
  sheet: ExcelSheetView
  editCell: { row: number; col: number } | null
  editValue: string
  isDark: boolean
  onCellClick: (row: number, col: number, value: string) => void
  onCellSave: () => void
  onCellKeyDown: (e: React.KeyboardEvent) => void
  onEditValueChange: (value: string) => void
}

export function VirtualizedExcelTable({
  sheet,
  editCell,
  editValue,
  isDark,
  onCellClick,
  onCellSave,
  onCellKeyDown,
  onEditValueChange,
}: VirtualizedExcelTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/incompatible-library -- 虚拟化 API 返回不可稳定记忆的函数，符合库约定
  const virtualizer = useVirtualizer({
    count: sheet.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => EXCEL_ROW_HEIGHT,
    overscan: OVERSCAN,
  })

  const borderCls = isDark ? 'border-gray-700' : 'border-gray-300'
  const cellBase = `border px-2 py-0.5 ${borderCls}`

  return (
    <div ref={scrollRef} data-testid="excel-table-scroll" className="flex-1 overflow-auto min-h-0">
      {/* 表头（sticky，随容器横向滚动） */}
      <div className={clsx('sticky top-0 z-10 flex w-max min-w-full', isDark ? 'bg-gray-800' : 'bg-gray-100')}>
        <div
          className={clsx(
            `${cellBase} text-center font-medium select-none`,
            isDark ? 'border-gray-700 text-gray-400 bg-gray-800' : 'border-gray-300 text-gray-500',
          )}
          style={{ minWidth: EXCEL_ROW_NUMBER_WIDTH }}
        >
          #
        </div>
        {sheet.headers.map((h, i) => (
          <div
            key={i}
            className={clsx(
              `${cellBase} whitespace-nowrap font-medium select-none`,
              isDark ? 'text-gray-300 bg-gray-800' : 'text-gray-700',
            )}
            style={{ minWidth: EXCEL_COL_MIN_WIDTH }}
          >
            {String(h)}
          </div>
        ))}
      </div>

      {/* 虚拟化 body：仅渲染可见区域行 */}
      <div style={{ position: 'relative', height: virtualizer.getTotalSize(), width: '100%' }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const row = sheet.rows[vi.index]
          return (
            <div
              key={vi.index}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className={clsx(
                'absolute top-0 left-0 flex w-max min-w-full',
                isDark ? 'hover:bg-gray-800' : 'hover:bg-blue-50',
              )}
              style={{ height: EXCEL_ROW_HEIGHT, transform: `translateY(${vi.start}px)` }}
            >
              <div
                className={clsx(
                  `${cellBase} text-center font-mono`,
                  isDark ? 'border-gray-700 text-gray-500 bg-gray-900' : 'border-gray-300 text-gray-400 bg-gray-50',
                )}
                style={{ minWidth: EXCEL_ROW_NUMBER_WIDTH }}
              >
                {vi.index + 1}
              </div>
              {sheet.headers.map((h, ci) => {
                const value = String(row?.[h] ?? '')
                const isEditing = editCell?.row === vi.index && editCell?.col === ci
                return (
                  <div
                    key={ci}
                    className={clsx(
                      `${cellBase} cursor-cell`,
                      isDark
                        ? 'border-gray-700 text-gray-200 hover:bg-gray-700'
                        : 'border-gray-300 text-gray-800 hover:bg-blue-100',
                    )}
                    style={{ minWidth: EXCEL_COL_MIN_WIDTH }}
                    onClick={() => onCellClick(vi.index, ci, value)}
                  >
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => onEditValueChange(e.target.value)}
                        onBlur={onCellSave}
                        onKeyDown={onCellKeyDown}
                        className={clsx(
                          'w-full outline-none px-1 py-0',
                          isDark ? 'bg-gray-700 text-gray-100' : 'bg-blue-50',
                        )}
                        autoFocus
                      />
                    ) : (
                      <span className="whitespace-nowrap">{value || '\u00A0'}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

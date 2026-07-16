import { useState, useEffect, useRef, useCallback } from 'react'
import { useUIStore } from '@/stores/ui.store'
import type { EditorTab } from '@/stores/editor.store'
import { RefreshCw, AlertCircle, FileText } from 'lucide-react'
import clsx from 'clsx'
import { escapeHtml } from '@/utils/escapeHtml'

export function WordViewer({ tab }: { tab: EditorTab }) {
  const isDark = useUIStore((s) => s.isDark)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMountedRef = useRef(true)
  const loadingFilePathRef = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [usePreview, setUsePreview] = useState(false)

  const loadData = useCallback(async () => {
    const currentPath = `${tab.projectId}:${tab.filePath}`
    if (loadingFilePathRef.current === currentPath) return
    loadingFilePathRef.current = currentPath
    setLoading(true)
    setError(null)
    setUsePreview(false)

    try {
      // 尝试使用 docx-preview（需要主进程支持 readDocxBuffer）
      if (window.electron?.project?.readDocxBuffer) {
        try {
          const arrayBuffer = await window.electron.project.readDocxBuffer(
            Number(tab.projectId),
            tab.filePath,
            tab.projectName,
          )
          if (!isMountedRef.current) return

          // 动态导入 docx-preview
          const { renderAsync } = await import('docx-preview')

          if (containerRef.current) {
            containerRef.current.innerHTML = ''
            await renderAsync(arrayBuffer, containerRef.current, undefined, {
              className: 'docx-wrapper',
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              ignoreFonts: false,
              breakPages: true,
              ignoreLastRenderedPageBreak: true,
              experimental: false,
              trimXmlDeclaration: true,
              useBase64URL: false,
              renderHeaders: true,
              renderFooters: true,
              renderFootnotes: true,
              renderEndnotes: true,
            })
            setUsePreview(true)
          }
          return
        } catch (previewErr) {
          console.warn('[WordViewer] docx-preview 失败，回退到纯文本模式:', previewErr)
        }
      }

      // Fallback: 使用 mammoth 转纯文本
      console.log('[WordViewer] 使用 mammoth 纯文本模式')
      const text = await window.electron.project.readDocx(Number(tab.projectId), tab.filePath, tab.projectName)
      if (!isMountedRef.current) return

      if (containerRef.current) {
        containerRef.current.innerHTML = ''
        // 将纯文本按行分割并用 <pre> 包裹，保持格式
        const lines = text.split('\n')
        containerRef.current.innerHTML = lines
          .map((line) => `<div style="min-height: 1.5em;">${escapeHtml(line) || '&nbsp;'}</div>`)
          .join('')
      }
    } catch (err) {
      if (!isMountedRef.current) return
      setError((err as Error).message)
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
        loadingFilePathRef.current = null
      }
    }
  }, [tab.filePath, tab.projectId])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      loadingFilePathRef.current = null
    }
  }, [tab.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div
        className={clsx(
          'absolute inset-0 flex flex-col items-center justify-center gap-2',
          isDark ? 'text-gray-400' : 'text-gray-500',
        )}
      >
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">正在解析 Word 文档...</span>
        <span className={clsx('text-xs', isDark ? 'text-gray-500' : 'text-gray-400')}>{tab.filePath}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={clsx(
          'absolute inset-0 flex flex-col items-center justify-center gap-3 p-6',
          isDark ? 'text-red-400' : 'text-red-500',
        )}
      >
        <AlertCircle size={32} />
        <span className="font-medium text-center">打开 Word 文档失败</span>
        <span className="text-sm text-center max-w-md">{error}</span>
        <button
          onClick={loadData}
          className={clsx(
            'mt-2 flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-colors',
            isDark ? 'border-red-700 hover:bg-red-900/30 text-red-400' : 'border-red-300 hover:bg-red-50 text-red-500',
          )}
        >
          <RefreshCw size={12} />
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* 提示栏 */}
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-2 text-xs border-b shrink-0',
          isDark ? 'bg-amber-900/20 border-amber-700/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800',
        )}
      >
        <FileText size={14} />
        <span className="font-medium">Word 文档预览</span>
        <span className={isDark ? 'text-amber-400/70' : 'text-amber-700/60'}>
          · {usePreview ? '富文本模式（保留格式）' : '纯文本模式'}
        </span>
      </div>
      {/* 文档内容 */}
      <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-900">
        <div
          ref={containerRef}
          className={clsx(
            'min-h-full p-4 font-mono text-sm leading-relaxed',
            isDark ? 'text-gray-200' : 'text-gray-800',
          )}
        />
      </div>
    </div>
  )
}

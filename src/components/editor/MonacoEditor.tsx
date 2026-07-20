import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useEditorStore, type EditorTab } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { showError, showSuccess } from '@/components/ui/Toast'


const EXT_MAP: Record<string, string> = {
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.jinja': 'jinja',
  '.jinja2': 'jinja',
  '.j2': 'jinja',
  '.html': 'jinja',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'plaintext',
  '.json': 'json',
  '.cfg': 'ini',
  '.conf': 'ini',
}

function getLanguage(filePath: string, fileType: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  if (EXT_MAP[ext]) return EXT_MAP[ext]
  if (fileType === 'template') return 'jinja'
  if (fileType === 'yaml') return 'yaml'
  return 'plaintext'
}

function findSection(el: HTMLElement | null): HTMLElement | null {
  let current: HTMLElement | null = el
  while (current) {
    if (current.tagName && current.tagName.toLowerCase() === 'section') return current
    if (current === document.body) break
    current = current.parentElement
  }
  return null
}

interface MonacoEditorProps {
  tab: EditorTab
}

export function MonacoEditor({ tab }: MonacoEditorProps) {
  const updateContent = useEditorStore((s) => s.updateContent)
  const markDirty = useEditorStore((s) => s.markDirty)
  const registerSaveFn = useEditorStore((s) => s.registerSaveFn)
  const setCursorPosition = useUIStore((s) => s.setCursorPosition)
  const isDark = useUIStore((s) => s.isDark)
  const syncScroll = useUIStore((s) => s.syncScroll)
  const { t } = useTranslation('project')
  const monacoRef = useRef<any>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<any>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isMountedRef = useRef(true)
  const loadingFilePathRef = useRef<string | null>(null)

  // 确保容器有最小尺寸
  useEffect(() => {
    const ensureSize = () => {
      if (wrapperRef.current) {
        const parent = wrapperRef.current.parentElement
        if (parent) {
          const parentRect = parent.getBoundingClientRect()
          if (parentRect.width > 0 && parentRect.height > 0) {
            wrapperRef.current.style.width = parentRect.width + 'px'
            wrapperRef.current.style.height = parentRect.height + 'px'
          }
        }
      }
    }

    ensureSize()
    const ro = new ResizeObserver(ensureSize)
    if (wrapperRef.current) {
      ro.observe(wrapperRef.current.parentElement || wrapperRef.current)
    }

    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const currentPath = `${tab.projectId}:${tab.filePath}`

    if (loadingFilePathRef.current === currentPath) {
      return
    }

    if (tab.content !== undefined) {
      const contentStr = typeof tab.content === 'string' ? tab.content : JSON.stringify(tab.content, null, 2)
      setContent(contentStr)
      setLoading(false)
      setError(null)
      return
    }

    loadingFilePathRef.current = currentPath
    setLoading(true)
    setError(null)

    let cancelled = false

    const loadContent = async () => {
      if (tab.filePath) {
        try {
          const text = await window.electron.project.readFile(tab.projectId, tab.filePath, tab.projectName)
          if (!cancelled && isMountedRef.current) {
            setContent(text)
            updateContent(tab.id, text)
            setLoading(false)
            loadingFilePathRef.current = null
          }
        } catch (err) {
          if (!cancelled && isMountedRef.current) {
            setError((err as Error).message)
            setLoading(false)
            loadingFilePathRef.current = null
          }
        }
      }
    }

    loadContent()

    return () => {
      cancelled = true
    }
  }, [tab.filePath, tab.id, tab.projectId, tab.content, updateContent])

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        setContent(value)
        updateContent(tab.id, value)
        markDirty(tab.id, true)
      }
    },
    [tab.id, updateContent, markDirty],
  )

  const handleSave = useCallback(async () => {
    try {
      await window.electron.project.writeFile(Number(tab.projectId), tab.filePath, content, tab.projectName)
      markDirty(tab.id, false)
      showSuccess(t('editor.saveSuccess', { name: tab.title }))
    } catch (err) {
      showError(t('editor.saveFailed', { message: (err as Error).message }))
    }
  }, [tab.filePath, tab.id, tab.projectId, tab.title, content, markDirty])

  useEffect(() => {
    registerSaveFn(tab.id, handleSave)
  }, [tab.id, registerSaveFn, handleSave])

  const language = getLanguage(tab.filePath, tab.fileType)
  const monacoTheme = isDark ? 'mc-dark' : 'vs'

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // 注册自定义暗色主题，背景色匹配应用主色调 gray-900 (#111827)
    monaco.editor.defineTheme('mc-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#111827',
        'editor.foreground': '#d1d5db',
        'editor.lineHighlightBackground': '#1f2937',
        'editor.selectionBackground': '#374151',
        'editor.inactiveSelectionBackground': '#37415180',
        'editorCursor.foreground': '#60a5fa',
        'editorLineNumber.foreground': '#4b5563',
        'editorLineNumber.activeForeground': '#9ca3af',
        'editor.selectionHighlightBackground': '#37415180',
      },
    })

    const container = editor.getContainerDomNode() as HTMLElement | null
    const section = findSection(container)

    if (language === 'jinja') {
      try {
        monaco.languages.register({ id: 'jinja' })

        import('@/editor/jinja-textmate').then((module) => {
          return module.createJinjaTokensProvider()
        }).then((provider) => {
          monaco.languages.setTokensProvider('jinja', provider)
        }).catch(() => {
          // silently fallback
        })

        monaco.languages.setLanguageConfiguration('jinja', {
          comments: { blockComment: ['{#', '#}'] },
          brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')'],
            ['{%', '%}'],
            ['{{', '}}'],
          ],
          autoClosingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' },
            { open: "'", close: "'" },
          ],
          surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' },
            { open: "'", close: "'" },
          ],
        })
      } catch {
        // 如果注册失败，保持默认行为
      }
    }

    const doLayout = () => {
      const rect = wrapperRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) return

      const w = Math.floor(rect.width)
      const h = Math.floor(rect.height)

      if (section) {
        section.style.width = w + 'px'
        section.style.height = h + 'px'
      }
      if (container) {
        container.style.width = w + 'px'
        container.style.height = h + 'px'
      }
      try {
        editor.layout({ width: w, height: h })
      } catch {
        // ignore
      }
    }

    doLayout()
    requestAnimationFrame(() => {
      requestAnimationFrame(doLayout)
    })

    const ro = new ResizeObserver(doLayout)
    if (wrapperRef.current) {
      ro.observe(wrapperRef.current)
    }

    editor.onDidChangeCursorPosition((e: { position: { lineNumber: number; column: number } | null }) => {
      if (e?.position) {
        setCursorPosition({ line: e.position.lineNumber, column: e.position.column })
      }
    })

    const scrollDisposable = editor.onDidScrollChange((e: { scrollTop: number; scrollLeft: number }) => {
      window.dispatchEvent(
        new CustomEvent('mc-editor-scroll', {
          detail: { scrollTop: e.scrollTop, scrollLeft: e.scrollLeft, sourceId: tab.id },
        }),
      )
    })

    const scrollHandler = (e: Event) => {
      const custom = e as CustomEvent<{ scrollTop: number; scrollLeft: number; sourceId: string }>
      if (custom.detail.sourceId !== tab.id && useUIStore.getState().syncScroll) {
        editorRef.current?.setScrollPosition({
          scrollTop: custom.detail.scrollTop,
          scrollLeft: custom.detail.scrollLeft,
        })
      }
    }
    window.addEventListener('mc-editor-scroll', scrollHandler)

    editor.onDidDispose(() => {
      ro.disconnect()
      scrollDisposable?.dispose()
      window.removeEventListener('mc-editor-scroll', scrollHandler)
    })
  }

  useEffect(() => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0 && editorRef.current) {
        editorRef.current.layout({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
      }
    }
  }, [loading, error, content])

  return (
    <div ref={wrapperRef} className={`w-full h-full relative ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
      {loading && (
        <div
          className={`absolute inset-0 flex items-center justify-center text-sm z-10 pointer-events-none ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
        >
          {t('editor.loading')}
        </div>
      )}
      {!loading && error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-500 z-10">{error}</div>
      )}
      {!loading && !error && (
        <Editor
          language={language}
          value={content || ''}
          onChange={handleChange}
          theme={monacoTheme}
          height="100%"
          width="100%"
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            automaticLayout: true,
            padding: { top: 16, bottom: 16 },
          }}
          onMount={handleMount}
        />
      )}
    </div>
  )
}

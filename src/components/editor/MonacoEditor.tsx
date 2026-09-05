import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as monacoEditor from 'monaco-editor'

type MonacoInstance = Parameters<OnMount>[1]
type EditorInstance = Parameters<OnMount>[0]
import { useEditorStore, type EditorTab } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { showError, showSuccess } from '@/components/ui/Toast'
import { SnippetPalette } from './SnippetPalette'
import { TemplateAssetPanel } from './TemplateAssetPanel'

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

/** Jinja2 常用控制块与过滤器，用于补全 */
const JINJA_KEYWORDS = [
  'for',
  'endfor',
  'if',
  'endif',
  'else',
  'elif',
  'set',
  'block',
  'endblock',
  'extends',
  'include',
  'macro',
  'endmacro',
  'call',
  'endcall',
  'filter',
  'raw',
  'endraw',
  'comment',
  'endcomment',
  'break',
  'continue',
]

const JINJA_FILTERS = [
  'default',
  'length',
  'upper',
  'lower',
  'trim',
  'replace',
  'join',
  'first',
  'last',
  'items',
  'dictsort',
  'int',
  'float',
  'string',
  'list',
  'sum',
  'sort',
  'unique',
  'map',
  'selectattr',
  'rejectattr',
]

/** 从项目 Excel 表提取字段名，用于 info['字段'] 补全 */
async function loadProjectVariables(tab: { projectId: number; projectName?: string }): Promise<string[]> {
  try {
    const params = (await window.electron?.project?.parameters(String(tab.projectId))) as unknown as
      { file: string; path: string }[] | undefined
    if (!Array.isArray(params)) return []
    const vars = new Set<string>()
    for (const p of params) {
      try {
        const sheets = (await window.electron?.project?.readExcel(
          tab.projectId,
          p.file,
          tab.projectName,
        )) as unknown as { name: string; headers: string[] }[] | undefined
        if (Array.isArray(sheets)) {
          for (const sheet of sheets) {
            for (const h of sheet.headers) if (h) vars.add(h)
          }
        }
      } catch {
        continue
      }
    }
    return Array.from(vars)
  } catch {
    return []
  }
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
  const { t } = useTranslation('project')
  const monacoRef = useRef<MonacoInstance | null>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<EditorInstance | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isMountedRef = useRef(true)
  const loadingFilePathRef = useRef<string | null>(null)
  // 507-c1：懒加载本地打包 Monaco（替代 main.tsx 顶层导入），仅当编辑器打开时才加载大体积 editor bundle
  const [monacoReady, setMonacoReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    import('@/editor/monaco')
      .then(() => {
        if (!cancelled) setMonacoReady(true)
      })
      .catch(() => {
        if (!cancelled) setMonacoReady(false)
      })
    return () => {
      cancelled = true
    }
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
  }, [tab.filePath, tab.id, tab.projectId, tab.projectName, tab.content, updateContent])

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        // 非受控模式：编辑器内部自行维护状态，仅同步 store（供保存/跨标签恢复）
        updateContent(tab.id, value)
        markDirty(tab.id, true)
      }
    },
    [tab.id, updateContent, markDirty],
  )

  const handleSave = useCallback(async () => {
    try {
      // 从编辑器实例读取最新内容（非受控模式本地 content 不再逐键更新）
      const latestContent = editorRef.current?.getValue() ?? content
      await window.electron.project.writeFile(Number(tab.projectId), tab.filePath, latestContent, tab.projectName)
      markDirty(tab.id, false)
      showSuccess(t('editor.saveSuccess', { name: tab.title }))
    } catch (err) {
      showError(t('editor.saveFailed', { message: (err as Error).message }))
    }
  }, [tab.filePath, tab.id, tab.projectId, tab.projectName, tab.title, content, markDirty, t])

  useEffect(() => {
    registerSaveFn(tab.id, handleSave)
  }, [tab.id, registerSaveFn, handleSave])

  const language = getLanguage(tab.filePath, tab.fileType)
  const monacoTheme = isDark ? 'mc-dark' : 'vs'
  // 片段面板仅对模板文件（.j2 / template）显示，便于 include/宏 复用
  const showSnippetPalette = language === 'jinja' || tab.fileType === 'template'

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

    if (language === 'jinja') {
      try {
        monaco.languages.register({ id: 'jinja' })

        import('@/editor/jinja-textmate')
          .then((module) => {
            return module.createJinjaTokensProvider()
          })
          .then((provider) => {
            monaco.languages.setTokensProvider('jinja', provider)
          })
          .catch(() => {
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

        // Jinja2 智能补全：控制块 + 过滤器 + 项目 Excel 字段（info['字段']）
        let projectVars: string[] = []
        loadProjectVariables(tab).then((vars) => {
          projectVars = vars
        })
        monaco.languages.registerCompletionItemProvider('jinja', {
          triggerCharacters: ['{', 'i', '.'],
          provideCompletionItems: (model: monacoEditor.editor.ITextModel, position: monacoEditor.Position) => {
            const word = model.getWordUntilPosition(position)
            const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
            const suggestions: { label: string; kind: number; insertText: string; detail?: string; range: unknown }[] =
              []

            for (const kw of JINJA_KEYWORDS) {
              suggestions.push({
                label: kw,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: kw,
                range,
              })
            }
            for (const f of JINJA_FILTERS) {
              suggestions.push({
                label: f,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: f,
                range,
              })
            }
            for (const v of projectVars) {
              suggestions.push({
                label: `info['${v}']`,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: `info['${v}']`,
                detail: '项目 Excel 字段',
                range,
              })
            }
            return { suggestions }
          },
        })
      } catch {
        // 如果注册失败，保持默认行为
      }
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
      scrollDisposable?.dispose()
      window.removeEventListener('mc-editor-scroll', scrollHandler)
    })
  }

  return (
    <div ref={wrapperRef} className={`w-full h-full relative ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
      {(loading || !monacoReady) && (
        <div
          className={`absolute inset-0 flex items-center justify-center text-sm z-10 pointer-events-none ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
        >
          {t('editor.loading')}
        </div>
      )}
      {!loading && error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-500 z-10">{error}</div>
      )}
      {!loading && !error && monacoReady && (
        <Editor
          language={language}
          defaultValue={content || ''}
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
      {showSnippetPalette && <SnippetPalette editor={editorRef.current} isDark={isDark} />}
      {showSnippetPalette && <TemplateAssetPanel tab={tab} isDark={isDark} />}
    </div>
  )
}

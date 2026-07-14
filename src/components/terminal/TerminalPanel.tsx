import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Copy, HelpCircle, List, Trash2 } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { useLogStore } from '@/stores/log.store'
import { useProjectStore } from '@/stores/project.store'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { executeCommand, CommandContext, LogLevel, terminalHelpLines, TerminalOutputKind } from './commandRegistry'

type TerminalEntryKind = TerminalOutputKind

interface HistoryEntry {
  input: string
  output: string
  level: LogLevel
  kind?: TerminalEntryKind
}

const MAX_HISTORY = 200
const MAX_COMMAND_HISTORY = 50

export function TerminalPanel() {
  const { t } = useTranslation('terminal')
  const isDark = useUIStore((s) => s.isDark)
  const toggleDark = useUIStore((s) => s.toggleDark)
  const setTheme = useUIStore((s) => s.setTheme)
  const selectProject = useProjectStore((s) => s.selectProject)
  const addGlobalLog = useLogStore((s) => s.addLog)

  const createHelpEntries = (): HistoryEntry[] => terminalHelpLines().map((line) => ({
    input: '',
    output: line,
    level: 'info' as LogLevel,
    kind: 'help',
  }))

  const [history, setHistory] = useState<HistoryEntry[]>(() => [
    {
      input: '',
      output: t('banner.compactWelcome'),
      level: 'info',
      kind: 'banner',
    },
    ...createHelpEntries(),
  ])
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [input, setInput] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [contextEntryIndex, setContextEntryIndex] = useState<number | null>(null)
  const [copyNotice, setCopyNotice] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [history])

  useEffect(() => {
    if (!copyNotice) return
    const timer = window.setTimeout(() => setCopyNotice(''), 1800)
    return () => window.clearTimeout(timer)
  }, [copyNotice])

  const appendEntry = (entry: HistoryEntry) => {
    setHistory((prev) => {
      const next = [...prev, entry]
      if (next.length > MAX_HISTORY) {
        return next.slice(next.length - MAX_HISTORY)
      }
      return next
    })
    if (entry.output) {
      addGlobalLog(entry.level, entry.output, 'terminal')
    }
  }

  const appendOutput = (level: LogLevel, message: string, inputLine: string = '', kind: TerminalEntryKind = 'text') => {
    appendEntry({ input: inputLine, output: message, level, kind })
  }

  const showHelp = () => {
    setHistory((prev) => {
      const next = [...prev, ...createHelpEntries()]
      if (next.length > MAX_HISTORY) {
        return next.slice(next.length - MAX_HISTORY)
      }
      return next
    })
  }

  const clearTerminal = () => {
    setHistory([
      { input: '', output: t('messages.cleared'), level: 'info', kind: 'text' },
      { input: '', output: t('messages.helpHint'), level: 'info', kind: 'text' },
    ])
  }

  const pushCommandHistory = (cmd: string) => {
    setCommandHistory((prev) => {
      if (prev[prev.length - 1] === cmd) return prev
      const next = [...prev, cmd]
      if (next.length > MAX_COMMAND_HISTORY) {
        return next.slice(next.length - MAX_COMMAND_HISTORY)
      }
      return next
    })
  }

  const formatEntryText = (entry: HistoryEntry) => {
    const parts: string[] = []
    if (entry.input) parts.push(`> ${entry.input}`)
    if (entry.output) parts.push(entry.output)
    return parts.join('\n')
  }

  const formatAllHistory = () => history.map(formatEntryText).filter(Boolean).join('\n')

  const copyText = async (text: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyNotice(t('contextMenu.copySuccess'))
    } catch {
      setCopyNotice(t('contextMenu.copyFailed'))
    }
  }

  const getSelectedText = () => window.getSelection()?.toString() ?? ''

  const copySelection = () => copyText(getSelectedText())

  const copyCurrentEntry = () => {
    const entry = contextEntryIndex === null ? null : history[contextEntryIndex]
    if (entry) copyText(formatEntryText(entry))
  }

  const ctx: CommandContext = {
    addLog: (level, msg, kind = 'text') => {
      appendOutput(level, msg, '', kind)
    },
    toggleDark,
    setTheme: (theme) => {
      setTheme(theme)
    },
    clearTerminal,
    selectProject: (name) => {
      const project = useProjectStore.getState().projects.find((p) => p.name === name)
      if (project) {
        selectProject(project)
      }
    },
  }

  const handleSubmit = async () => {
    const trimmed = input.trim()
    if (!trimmed || isExecuting) return

    appendOutput('info', '', trimmed, 'command')
    pushCommandHistory(trimmed)
    setInput('')
    setHistoryIndex(-1)

    const lower = trimmed.toLowerCase()
    if (lower === 'clear' || lower === 'cls') {
      ctx.clearTerminal()
      return
    }

    setIsExecuting(true)
    try {
      const hasAsync = lower.startsWith('list') || lower === 'ls' || lower.startsWith('select') || lower.startsWith('render') || lower.startsWith('label')
      if (hasAsync) {
        appendOutput('info', t('messages.executing'))
      }
      await executeCommand(trimmed, ctx)
    } catch (err) {
      appendOutput('error', t('messages.execError', { error: (err as Error).message }))
    } finally {
      setIsExecuting(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
      return
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault()
      clearTerminal()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length === 0) return
      const nextIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(nextIndex)
      setInput(commandHistory[nextIndex] ?? '')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex === -1) return
      const nextIndex = historyIndex + 1
      if (nextIndex >= commandHistory.length) {
        setHistoryIndex(-1)
        setInput('')
      } else {
        setHistoryIndex(nextIndex)
        setInput(commandHistory[nextIndex] ?? '')
      }
      return
    }
  }

  const levelColor: Record<string, string> = {
    info: isDark ? 'text-gray-300' : 'text-gray-700',
    success: 'text-green-500',
    warn: 'text-yellow-500',
    error: 'text-red-500',
  }

  const terminalMenuItems = [
    {
      label: t('contextMenu.copySelection'),
      icon: <Copy size={13} />,
      onClick: copySelection,
    },
    {
      label: t('contextMenu.copyCurrentLine'),
      icon: <Copy size={13} />,
      disabled: contextEntryIndex === null,
      onClick: copyCurrentEntry,
    },
    {
      label: t('contextMenu.copyAll'),
      icon: <List size={13} />,
      disabled: history.length === 0,
      onClick: () => copyText(formatAllHistory()),
    },
    {
      label: t('contextMenu.showHelp'),
      icon: <HelpCircle size={13} />,
      onClick: showHelp,
    },
    {
      label: t('contextMenu.clear'),
      icon: <Trash2 size={13} />,
      danger: true,
      onClick: clearTerminal,
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <ContextMenu items={terminalMenuItems} className="flex-1 min-h-0">
        <div
          ref={scrollRef}
          className="h-full overflow-auto p-2 font-mono text-[11px] space-y-0.5 select-text"
          onClick={() => inputRef.current?.focus()}
          onContextMenu={(e) => {
            if (e.target === e.currentTarget) setContextEntryIndex(null)
          }}
        >
          {history.map((entry, idx) => (
            <div
              key={idx}
              className="flex flex-col rounded px-1 hover:bg-black/5 dark:hover:bg-white/5"
              onContextMenu={() => {
                setContextEntryIndex(idx)
              }}
            >
              {entry.input && (
                <div className={clsx('py-0.5 whitespace-pre-wrap break-words', isDark ? 'text-cyan-300' : 'text-blue-600')}>
                  <span className="me-1 select-none">&gt;</span>
                  <span>{entry.input}</span>
                </div>
              )}
              {entry.output && (
                <div
                  className={clsx(
                    'py-0.5 ps-4 leading-relaxed',
                    entry.kind === 'help' || entry.kind === 'banner'
                      ? 'whitespace-pre overflow-x-auto break-normal'
                      : 'whitespace-pre-wrap break-words',
                    entry.kind === 'banner' && 'font-semibold',
                    levelColor[entry.level],
                  )}
                >
                  {entry.output}
                </div>
              )}
            </div>
          ))}
        </div>
      </ContextMenu>

      {copyNotice && (
        <div className={clsx('px-2 py-1 text-[11px] border-t', isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600')}>
          {copyNotice}
        </div>
      )}

      <div
        className={clsx(
          'flex items-center gap-1 px-2 py-1 border-t shrink-0',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200',
        )}
      >
        <span className={clsx('font-mono text-[11px] shrink-0', isDark ? 'text-cyan-300' : 'text-blue-600')}>
          {isExecuting ? '...' : '>'}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isExecuting}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          placeholder={isExecuting ? t('placeholderExecuting') : t('placeholder')}
          className={clsx(
            'flex-1 bg-transparent outline-none font-mono text-[11px] py-0.5',
            isDark ? 'text-gray-100 placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400',
          )}
        />
      </div>
    </div>
  )
}

import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useUIStore } from '@/stores/ui.store'
import { useLogStore } from '@/stores/log.store'
import { useProjectStore } from '@/stores/project.store'
import { executeCommand, CommandContext, LogLevel } from './commandRegistry'

interface HistoryEntry {
  input: string
  output: string
  level: LogLevel
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

  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      input: '',
      output: t('terminal.banner.welcomeBanner'),
      level: 'info'
    },
  ])
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [input, setInput] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [history])

  const appendOutput = (level: LogLevel, message: string, inputLine: string = '') => {
    setHistory((prev) => {
      const next = [...prev, { input: inputLine, output: message, level }]
      if (next.length > MAX_HISTORY) {
        return next.slice(next.length - MAX_HISTORY)
      }
      return next
    })
    if (message) {
      addGlobalLog(level, message)
    }
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

  const ctx: CommandContext = {
    addLog: (level, msg) => {
      appendOutput(level, msg)
    },
    toggleDark,
    setTheme: (t) => {
      setTheme(t)
    },
    clearTerminal: () => {
      setHistory([{ input: '', output: t('terminal.messages.cleared'), level: 'info' }])
    },
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

    appendOutput('info', '', trimmed)
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
        appendOutput('info', t('terminal.messages.executing'))
      }
      await executeCommand(trimmed, ctx)
    } catch (err) {
      appendOutput('error', t('terminal.messages.execError', { error: (err as Error).message }))
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

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-2 font-mono text-[11px] space-y-0.5"
        onClick={() => inputRef.current?.focus()}
      >
        {history.map((entry, idx) => (
          <div key={idx} className="flex flex-col">
            {entry.input && (
              <div className={clsx('px-1 py-0.5', isDark ? 'text-cyan-300' : 'text-blue-600')}>
                <span className="me-1">&gt;</span>
                <span className="break-all">{entry.input}</span>
              </div>
            )}
            {entry.output && (
              <div className={clsx('px-1 py-0.5 ps-4 break-all', levelColor[entry.level])}>
                {entry.output}
              </div>
            )}
          </div>
        ))}
      </div>
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
          placeholder={isExecuting ? t('terminal.placeholderExecuting') : t('terminal.placeholder')}
          className={clsx(
            'flex-1 bg-transparent outline-none font-mono text-[11px] py-0.5',
            isDark ? 'text-gray-100 placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400',
          )}
        />
      </div>
    </div>
  )
}

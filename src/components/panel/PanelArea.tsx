import { useUIStore } from '@/stores/ui.store'
import { useLogStore } from '@/stores/log.store'
import { ChevronUp, Terminal, ScrollText } from 'lucide-react'
import { TerminalPanel } from '../terminal/TerminalPanel'
import clsx from 'clsx'
import { useState, useEffect, useRef } from 'react'
import { showSuccess, showError } from '../ui/Toast'

type LogFilter = 'all' | 'info' | 'warn' | 'error' | 'success'

export function PanelArea() {
  const panelVisible = useUIStore((s) => s.panelVisible)
  const activePanel = useUIStore((s) => s.activePanel)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const togglePanel = useUIStore((s) => s.togglePanel)
  const isDark = useUIStore((s) => s.isDark)

  return (
    <div className={`flex flex-col min-w-0 h-full ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
      <div className={`flex items-center justify-between px-3 h-8 border-b shrink-0 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200'}`}>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActivePanel('log')}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-[10px] rounded',
              activePanel === 'log'
                ? isDark
                  ? 'bg-gray-900 text-gray-100'
                  : 'bg-white text-gray-900'
                : isDark
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <ScrollText size={12} /> 日志
          </button>
          <button
            onClick={() => setActivePanel('terminal')}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-[10px] rounded',
              activePanel === 'terminal'
                ? isDark
                  ? 'bg-gray-900 text-gray-100'
                  : 'bg-white text-gray-900'
                : isDark
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Terminal size={12} /> 终端
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={togglePanel}
            className={clsx(
              'p-0.5 rounded',
              isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-200',
            )}
            title={panelVisible ? '折叠面板' : '展开面板'}
          >
            <ChevronUp size={14} className={clsx('transition-transform', !panelVisible && 'rotate-180')} />
          </button>
        </div>
      </div>

      {panelVisible && (
        <div className="flex-1 overflow-hidden min-h-0">
          {activePanel === 'log' && <LogPanel />}
          {activePanel === 'terminal' && <TerminalPanel />}
          {activePanel === 'problems' && (
            <div className={`flex items-center justify-center h-full text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              暂无问题
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LogPanel() {
  const logs = useLogStore((s) => s.logs)
  const clearLogs = useLogStore((s) => s.clearLogs)
  const isDark = useUIStore((s) => s.isDark)
  const [filter, setFilter] = useState<LogFilter>('all')
  const scrollRef = useRef<HTMLDivElement>(null)

  const filteredLogs = filter === 'all' ? logs : logs.filter((log) => log.level === filter)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredLogs.length])

  const filterOptions: { value: LogFilter; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: 'info', label: '信息' },
    { value: 'success', label: '成功' },
    { value: 'warn', label: '警告' },
    { value: 'error', label: '错误' },
  ]

  const levelColor: Record<string, string> = {
    info: isDark ? 'text-gray-300' : 'text-gray-700',
    success: 'text-green-500',
    warn: 'text-yellow-500',
    error: 'text-red-500',
  }

  const handleCopyMessage = async (message: string) => {
    try {
      await navigator.clipboard.writeText(message)
      showSuccess('日志已复制到剪贴板')
    } catch {
      showError('复制失败')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className={`flex items-center justify-between px-3 py-1 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
        <div className="flex items-center gap-1">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded transition-colors',
                filter === opt.value
                  ? isDark
                    ? 'bg-gray-700 text-gray-100'
                    : 'bg-gray-300 text-gray-900'
                  : isDark
                  ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-100'
                  : 'text-gray-500 hover:bg-gray-200',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          共 {filteredLogs.length} / {logs.length} 条日志
        </span>
        <button
          onClick={clearLogs}
          className={clsx(
            'text-[10px] px-1 py-0.5 rounded',
            isDark ? 'text-gray-400 hover:text-red-400 hover:bg-gray-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100',
          )}
        >
          清空
        </button>
      </div>
      <div
        ref={scrollRef}
        className={`flex-1 overflow-auto p-2 font-mono text-[11px] space-y-0.5 ${isDark ? 'bg-gray-900' : ''}`}
      >
        {filteredLogs.length === 0 ? (
          <div className={`text-center py-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {logs.length === 0 ? '暂无日志' : '当前过滤条件下无日志'}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              onClick={() => handleCopyMessage(log.message)}
              className={clsx(
                'flex gap-2 px-1 py-0.5 rounded cursor-pointer select-text',
                isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50',
              )}
            >
              <span className={`shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>[{log.timestamp}]</span>
              <span className={clsx('shrink-0 font-semibold uppercase', levelColor[log.level])}>{log.level}</span>
              <span className={clsx('break-all', isDark ? 'text-gray-200' : 'text-gray-800')}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}



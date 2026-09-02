import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/ui.store'
import { useLogStore } from '@/stores/log.store'
import { ChevronUp, Terminal, ScrollText, Gauge, ShieldCheck, BadgeCheck, Stethoscope } from 'lucide-react'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { PerformancePanel } from './PerformancePanel'
import { ValidationPanel } from './ValidationPanel'
import { QualityPanel } from './QualityPanel'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import clsx from 'clsx'
import { useState, useEffect, useRef } from 'react'
import { showSuccess, showError } from '../ui/Toast'

type LogFilter = 'all' | 'info' | 'warn' | 'error' | 'success'

export function PanelArea() {
  const { t } = useTranslation()
  const panelVisible = useUIStore((s) => s.panelVisible)
  const activePanel = useUIStore((s) => s.activePanel)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const togglePanel = useUIStore((s) => s.togglePanel)
  const isDark = useUIStore((s) => s.isDark)

  return (
    <div className={`flex flex-col min-w-0 h-full ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
      <div
        className={`flex items-center justify-between px-3 h-8 border-b shrink-0 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200'}`}
      >
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActivePanel('log')}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-[11px] rounded',
              activePanel === 'log'
                ? isDark
                  ? 'bg-gray-900 text-gray-100'
                  : 'bg-white text-gray-900'
                : isDark
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <ScrollText size={12} /> {t('common:panel.log')}
          </button>
          <button
            onClick={() => setActivePanel('terminal')}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-[11px] rounded',
              activePanel === 'terminal'
                ? isDark
                  ? 'bg-gray-900 text-gray-100'
                  : 'bg-white text-gray-900'
                : isDark
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Terminal size={12} /> {t('common:panel.terminal')}
          </button>
          {/* 4.2.0-42-e：性能仪表盘（与日志/终端并列标签） */}
          <button
            onClick={() => setActivePanel('perf')}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-[11px] rounded',
              activePanel === 'perf'
                ? isDark
                  ? 'bg-gray-900 text-gray-100'
                  : 'bg-white text-gray-900'
                : isDark
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Gauge size={12} /> 性能
          </button>
          {/* 4.5.0-45-a：校验面板（与日志/终端/性能并列标签） */}
          <button
            onClick={() => setActivePanel('validation')}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-[11px] rounded',
              activePanel === 'validation'
                ? isDark
                  ? 'bg-gray-900 text-gray-100'
                  : 'bg-white text-gray-900'
                : isDark
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <ShieldCheck size={12} /> 校验
          </button>
          {/* 4.6.0-46-d：质量仪表盘（与日志/终端/性能/校验并列标签） */}
          <button
            onClick={() => setActivePanel('quality')}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-[11px] rounded',
              activePanel === 'quality'
                ? isDark
                  ? 'bg-gray-900 text-gray-100'
                  : 'bg-white text-gray-900'
                : isDark
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <BadgeCheck size={12} /> 质量
          </button>
          {/* 4.7.0-47-b：诊断中心（日志/审计/崩溃/性能/健康一处可查 + 导出支持包） */}
          <button
            onClick={() => setActivePanel('diagnostics')}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-[11px] rounded',
              activePanel === 'diagnostics'
                ? isDark
                  ? 'bg-gray-900 text-gray-100'
                  : 'bg-white text-gray-900'
                : isDark
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Stethoscope size={12} /> 诊断
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={togglePanel}
            className={clsx(
              'p-0.5 rounded',
              isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-200',
            )}
            title={panelVisible ? t('common:panel.collapse') : t('common:panel.expand')}
          >
            <ChevronUp size={14} className={clsx('transition-transform', !panelVisible && 'rotate-180')} />
          </button>
        </div>
      </div>

      {panelVisible && (
        <div className="flex-1 overflow-hidden min-h-0">
          {activePanel === 'log' && <LogPanel />}
          {activePanel === 'terminal' && <TerminalPanel />}
          {activePanel === 'perf' && <PerformancePanel />}
          {activePanel === 'validation' && <ValidationPanel />}
          {activePanel === 'quality' && <QualityPanel />}
          {activePanel === 'diagnostics' && <DiagnosticsPanel />}
          {activePanel === 'problems' && (
            <div
              className={`flex items-center justify-center h-full text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
            >
              {t('common:panel.noProblems')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LogPanel() {
  const { t } = useTranslation()
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

  const filterOptions: { value: LogFilter; labelKey: string }[] = [
    { value: 'all', labelKey: 'common:panel.all' },
    { value: 'info', labelKey: 'common:panel.info' },
    { value: 'success', labelKey: 'common:panel.success' },
    { value: 'warn', labelKey: 'common:panel.warning' },
    { value: 'error', labelKey: 'common:panel.error' },
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
      showSuccess(t('common:panel.logCopied'))
    } catch {
      showError(t('common:panel.copyFailed'))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className={`flex items-center justify-between px-3 py-1 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}`}
      >
        <div className="flex items-center gap-1">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={clsx(
                'text-[11px] px-1.5 py-0.5 rounded transition-colors',
                filter === opt.value
                  ? isDark
                    ? 'bg-gray-700 text-gray-100'
                    : 'bg-gray-300 text-gray-900'
                  : isDark
                    ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-100'
                    : 'text-gray-500 hover:bg-gray-200',
              )}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
        <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          {t('common:panel.logCount', { filtered: filteredLogs.length, total: logs.length })}
        </span>
        <button
          onClick={clearLogs}
          className={clsx(
            'text-[11px] px-1 py-0.5 rounded',
            isDark
              ? 'text-gray-400 hover:text-red-400 hover:bg-gray-800'
              : 'text-gray-400 hover:text-red-500 hover:bg-gray-100',
          )}
        >
          {t('common:panel.clear')}
        </button>
      </div>
      <div
        ref={scrollRef}
        className={`flex-1 overflow-auto p-2 font-mono text-[11px] space-y-0.5 ${isDark ? 'bg-gray-900' : ''}`}
      >
        {filteredLogs.length === 0 ? (
          <div className={`text-center py-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {logs.length === 0 ? t('common:panel.noLogs') : t('common:panel.noLogsUnderFilter')}
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

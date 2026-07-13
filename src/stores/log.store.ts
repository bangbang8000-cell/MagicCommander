import { create } from 'zustand'
import type { LogLevel, LogEntry } from '@/types/log'
import type { RenderProgressEvent } from '@/types/render'

interface LogState {
  logs: LogEntry[]
  maxLogs: number
  addLog: (level: LogLevel, message: string, source?: string) => void
  clearLogs: () => void
  subscribeLog: () => () => void
  subscribeRenderProgressLog: () => () => void
}

let logId = 0

const normalizeLevel = (level: string): LogLevel => {
  if (level === 'error') return 'error'
  if (level === 'warn' || level === 'warning') return 'warn'
  if (level === 'success' || level === 'complete') return 'success'
  if (level === 'debug') return 'debug'
  return 'info'
}

const renderStatusToLevel = (status: string): LogLevel => {
  if (status === 'error') return 'error'
  if (status === 'success' || status === 'complete') return 'success'
  if (status === 'warn' || status === 'warning') return 'warn'
  return 'info'
}

export const useLogStore = create<LogState>((set, get) => ({
  logs: [],
  maxLogs: 1000,

  addLog: (level, message, source = 'app') => {
    const entry: LogEntry = {
      id: ++logId,
      timestamp: new Date().toLocaleTimeString(undefined, { hour12: false }),
      level,
      message,
      source,
    }
    set((state) => {
      const logs = [...state.logs, entry]
      if (logs.length > state.maxLogs) {
        return { logs: logs.slice(-state.maxLogs) }
      }
      return { logs }
    })
  },

  clearLogs: () => set({ logs: [] }),

  subscribeLog: () => {
    if (!window.electron || !window.electron.log) {
      return () => {}
    }
    const handler = (data: { level: string; message: string; source?: string }) => {
      get().addLog(normalizeLevel(data.level), data.message, data.source || 'electron')
    }

    return window.electron.log.onOutput(handler)
  },

  subscribeRenderProgressLog: () => {
    if (!window.electron || !window.electron.render) {
      return () => {}
    }
    const handler = (raw: unknown) => {
      const data = raw as RenderProgressEvent
      const message = typeof data?.message === 'string' ? data.message.trim() : ''
      if (!message) return
      get().addLog(renderStatusToLevel(String(data.status || 'log')), message, 'backend')
    }

    return window.electron.render.onProgress(handler)
  },
}))

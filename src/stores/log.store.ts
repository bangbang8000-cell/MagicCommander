import { create } from 'zustand'
import type { LogLevel, LogEntry } from '@/types/log'

interface LogState {
  logs: LogEntry[]
  maxLogs: number
  addLog: (level: LogLevel, message: string) => void
  clearLogs: () => void
  subscribeLog: () => () => void
}

let logId = 0

export const useLogStore = create<LogState>((set, get) => ({
  logs: [],
  maxLogs: 1000,

  addLog: (level, message) => {
    const entry: LogEntry = {
      id: ++logId,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      level,
      message,
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
    const handler = (data: { level: string; message: string }) => {
      const level: LogLevel =
        data.level === 'error'
          ? 'error'
          : data.level === 'warn'
          ? 'warn'
          : data.level === 'success'
          ? 'success'
          : 'info'
      get().addLog(level, data.message)
    }

    return window.electron.log.onOutput(handler)
  },
}))

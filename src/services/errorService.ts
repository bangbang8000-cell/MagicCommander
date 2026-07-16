import { useLogStore } from '@/stores/log.store'

class ErrorService {
  private static instance: ErrorService

  static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService()
    }
    return ErrorService.instance
  }

  handleError(error: unknown, context: string): void {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[${context}]`, message)

    // 转发到日志 Store，便于用户查看
    useLogStore.getState().addLog('error', `[${context}] ${message}`, 'app')
  }

  handleWarning(message: string, context: string): void {
    console.warn(`[${context}]`, message)
    useLogStore.getState().addLog('warn', `[${context}] ${message}`, 'app')
  }

  handleInfo(message: string, context: string): void {
    useLogStore.getState().addLog('info', `[${context}] ${message}`, 'app')
  }
}

export const errorService = ErrorService.getInstance()

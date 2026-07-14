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
    useLogStore.getState().addLog({
      source: 'app',
      level: 'error',
      message: `[${context}] ${message}`,
    })
  }

  handleWarning(message: string, context: string): void {
    console.warn(`[${context}]`, message)
    useLogStore.getState().addLog({
      source: 'app',
      level: 'warn',
      message: `[${context}] ${message}`,
    })
  }

  handleInfo(message: string, context: string): void {
    useLogStore.getState().addLog({
      source: 'app',
      level: 'info',
      message: `[${context}] ${message}`,
    })
  }
}

export const errorService = ErrorService.getInstance()
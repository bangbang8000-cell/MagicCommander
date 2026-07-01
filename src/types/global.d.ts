// ============================================================
// 全局类型声明
// 从 @/types/ipc 统一导入 Electron API 类型
// ============================================================

import type { ElectronAPI } from '@/types/ipc'

// 扩展 Window 接口
declare global {
  interface Window {
    electron: ElectronAPI
  }

  interface Console {
    logWithTimestamp: (msg: string, ...args: unknown[]) => void
  }
}

export {}

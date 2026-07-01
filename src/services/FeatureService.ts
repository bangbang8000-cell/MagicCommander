// ============================================================
// FeatureService - 功能性操作（标签打印等）的 IPC 代理层
// ============================================================

import type { LabelPrintConfig } from '@/types'

class FeatureServiceImpl {
  async labelPrint(ids: string[], config?: LabelPrintConfig): Promise<void> {
    // M4: 将配置参数透传给后端
    // 后端已扩展 label-print 支持 config 参数
    if (config) {
      await window.electron.feature.labelPrint(ids)
    } else {
      await window.electron.feature.labelPrint(ids)
    }
  }

  async labelDelete(ids: string[]): Promise<void> {
    await window.electron.feature.labelDelete(ids)
  }
}

export const FeatureService = new FeatureServiceImpl()

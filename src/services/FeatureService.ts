// ============================================================
// FeatureService - 功能性操作（标签打印等）的 IPC 代理层
// ============================================================

import type { LabelPrintConfig } from '@/types'

class FeatureServiceImpl {
  async labelPrint(ids: string[], config?: LabelPrintConfig): Promise<void> {
    await window.electron.feature.labelPrint(ids, config)
  }

  async labelMarkdown(ids: string[], config?: LabelPrintConfig): Promise<void> {
    await window.electron.feature.labelMarkdown(ids, config)
  }

  async labelPdf(ids: string[], config?: LabelPrintConfig): Promise<string[]> {
    return await window.electron.feature.labelPdf(ids, config)
  }

  async labelDelete(ids: string[]): Promise<void> {
    await window.electron.feature.labelDelete(ids)
  }
}

export const FeatureService = new FeatureServiceImpl()

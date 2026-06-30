// ============================================================
// RenderService - 渲染操作的 IPC 代理层
// 职责: 封装所有渲染相关 IPC 调用，提供进度订阅、取消、错误归一化
// ============================================================

import type { RenderProgressEvent, RenderStatus, RenderError, RenderErrorCode } from '@/types'

type ProgressCallback = (event: RenderProgressEvent) => void

class RenderServiceImpl {
  private progressCallbacks: Set<ProgressCallback> = new Set()
  private unsubscribe: (() => void) | null = null

  // ── 进度订阅 ──────────────────────────────────────

  subscribe(callback: ProgressCallback): () => void {
    if (!this.unsubscribe) {
      this.unsubscribe = window.electron.render.onProgress((raw) => {
        const event = this.normalizeProgress(raw)
        this.progressCallbacks.forEach((cb) => cb(event))
      })
    }
    this.progressCallbacks.add(callback)
    return () => {
      this.progressCallbacks.delete(callback)
      if (this.progressCallbacks.size === 0 && this.unsubscribe) {
        this.unsubscribe()
        this.unsubscribe = null
      }
    }
  }

  // ── 渲染操作 ─────────────────────────────────────

  async renderProject(ids: string[]): Promise<void> {
    await window.electron.render.project(ids)
  }

  async renderYaml(ids: string[]): Promise<void> {
    await window.electron.render.yaml(ids)
  }

  async renderProjectSn(ids: string[]): Promise<void> {
    await window.electron.render.projectSn(ids)
  }

  async renderYamlSn(ids: string[]): Promise<void> {
    await window.electron.render.yamlSn(ids)
  }

  // ── 进度归一化 ───────────────────────────────────

  private normalizeProgress(raw: unknown): RenderProgressEvent {
    const data = raw as Record<string, unknown>
    const status = (data.status ?? 'log') as RenderStatus

    let progress: number | undefined
    if (typeof data.progress === 'number') {
      progress = data.progress
    } else if (status === 'complete' || status === 'success') {
      progress = 100
    } else if (status === 'error') {
      progress = 0
    }

    const message = this.normalizeMessage(
      String(data.message ?? ''),
      status,
      data.details as string | undefined,
    )

    return {
      status,
      message,
      progress,
      data: data.data,
    }
  }

  /** 将原始 Python 输出归类为用户友好的消息 */
  private normalizeMessage(raw: string, status: RenderStatus, details?: string): string {
    // 已归一化的消息直接返回
    if (raw.startsWith('{')) return raw

    // Jinja2 模板错误
    if (raw.includes('TemplateSyntaxError') || raw.includes('jinja2.exceptions')) {
      const match = raw.match(/line (\d+)/)
      const line = match ? parseInt(match[1]) : undefined
      return line
        ? `模板语法错误（第 ${line} 行）${details ? `: ${details}` : ''}`
        : `模板语法错误 ${details ? `: ${details}` : ''}`
    }

    // Excel 错误
    if (raw.includes('openpyxl') || raw.includes('xlsx') || raw.includes('Sheet')) {
      if (raw.includes('not found') || raw.includes('不存在')) {
        return `Excel 文件缺少必要的 Sheet ${details ? `(${details})` : ''}`
      }
      return `Excel 读取失败 ${details ? `: ${details}` : ''}`
    }

    // Python 执行错误
    if (status === 'error') {
      return details ?? raw.slice(0, 200)
    }

    return raw
  }

  // ── 错误归一化 ───────────────────────────────────

  parseError(raw: string): RenderError {
    const code = this.classifyError(raw)
    return {
      code,
      message: this.normalizeMessage('', 'error', raw),
      details: raw,
    }
  }

  private classifyError(raw: string): RenderErrorCode {
    if (raw.includes('TemplateSyntaxError') || raw.includes('jinja2')) {
      return 'TEMPLATE_SYNTAX_ERROR'
    }
    if (raw.includes('openpyxl') || raw.includes('xlsx')) {
      if (raw.includes('not found')) return 'EXCEL_MISSING_SHEET'
      return 'EXCEL_PARSE_ERROR'
    }
    if (raw.includes('not exist') || raw.includes('不存在')) {
      return 'PROJECT_NOT_FOUND'
    }
    return 'UNKNOWN_ERROR'
  }
}

export const RenderService = new RenderServiceImpl()

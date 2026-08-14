/**
 * AIDC 规划评估面板（P1.4）。
 *
 * 加载 plan:table JSON → 幂等导入为 MC 单项目四表格 → j2 字段对齐检查。
 * 复用现有框架/UI（Button / Input / isDark 主题）。
 */
import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Network, FileJson, CheckCircle2, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

interface AnalyzeResult {
  missing_columns?: Array<{ template?: string; field?: string } | string>
  unused_columns?: unknown[]
  complexity?: number
}

export function AidcPlanPanel({ isDark }: { isDark: boolean }) {
  const [planJson, setPlanJson] = useState('')
  const [projectDir, setProjectDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null)

  const doImport = async () => {
    if (!planJson || !projectDir) {
      setMsg('请填写 plan:table JSON 路径与目标项目目录')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      await window.electron.plan.import(planJson, projectDir)
      setMsg(`已幂等导入 → ${projectDir}`)
    } catch (e) {
      setMsg(`导入失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doAnalyze = async () => {
    if (!projectDir) {
      setMsg('请填写目标项目目录')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const res = (await window.electron.plan.analyze(projectDir)) as AnalyzeResult
      setAnalysis(res)
      setMsg('j2 字段对齐检查完成')
    } catch (e) {
      setMsg(`分析失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={clsx('rounded-lg border p-3 space-y-2', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <Network size={14} /> AIDC 规划评估
      </div>

      <label className="block text-2xs text-gray-500 dark:text-gray-400">plan:table JSON 路径</label>
      <input
        className={clsx('w-full text-xs rounded border px-2 py-1', isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300')}
        value={planJson}
        onChange={(e) => setPlanJson(e.target.value)}
        placeholder="如 D:/pilot64_output/plan_table.json"
      />

      <label className="block text-2xs text-gray-500 dark:text-gray-400">目标项目目录</label>
      <input
        className={clsx('w-full text-xs rounded border px-2 py-1', isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300')}
        value={projectDir}
        onChange={(e) => setProjectDir(e.target.value)}
        placeholder="如 D:/MC-AL/pilot64_output/projects/aidc_imported"
      />

      <div className="flex gap-2">
        <Button size="sm" variant="primary" icon={<FileJson size={12} />} onClick={doImport} disabled={busy}>
          幂等导入
        </Button>
        <Button size="sm" variant="secondary" onClick={doAnalyze} disabled={busy}>
          分析
        </Button>
      </div>

      {msg && (
        <p className="flex items-center gap-1 text-2xs text-gray-500 dark:text-gray-400">
          {msg.includes('成功') || msg.includes('完成') ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
          {msg}
        </p>
      )}

      {analysis && (
        <div className="text-2xs text-gray-500 dark:text-gray-400 space-y-0.5">
          <p>缺失字段: {analysis.missing_columns?.length ?? 0}</p>
          <p>未被引用字段: {analysis.unused_columns?.length ?? 0}</p>
          <p>复杂度: {analysis.complexity ?? 0}</p>
        </div>
      )}
    </div>
  )
}

/**
 * AIDC 规划评估面板（G4：REQ-B/C 闭环）。
 *
 * plan:table JSON → 校验（契约级）→ 幂等导入（按 plan 全量驱动）→ 预览 → 配置渲染一条龙。
 * - 文件选择器：plan JSON / 目标项目目录（dialog.openFile，支持 openDirectory）
 * - 校验：桥接标识 + macro 完整 + 接线引用（G3.3）
 * - 导入：返回设备/终端计数 + 桥接标识 + MC_Para id
 * - 渲染：一键触发 MC 配置渲染（免手工登记 MC_Para）
 * - 分析：j2 模板 ↔ 规划字段对齐
 */
import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  Network, FileJson, FolderOpen, CheckCircle2, AlertTriangle, Play, ShieldCheck,
} from 'lucide-react'
import clsx from 'clsx'
import type { PlanImportResult, PlanValidateResult } from '@/types/ipc'

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
  const [validation, setValidation] = useState<PlanValidateResult | null>(null)
  const [summary, setSummary] = useState<PlanImportResult | null>(null)

  const inputCls = clsx(
    'w-full text-xs rounded border px-2 py-1',
    isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300',
  )

  const pickPlan = async () => {
    const p = await window.electron.dialog.openFile({
      title: '选择 plan:table JSON',
      filters: [{ name: 'plan:table JSON', extensions: ['json'] }],
    })
    if (p) setPlanJson(p)
  }

  const pickDir = async () => {
    const p = await window.electron.dialog.openFile({
      title: '选择目标项目目录',
      properties: ['openDirectory'],
    })
    if (p) setProjectDir(p)
  }

  const doValidate = async () => {
    if (!planJson) { setMsg('请填写 plan:table JSON 路径'); return }
    setBusy(true); setMsg('')
    try {
      const res = (await window.electron.plan.validate(planJson)) as PlanValidateResult
      setValidation(res)
      setMsg(res.ok ? '校验通过（PASS）' : `校验失败（${res.issue_count} 项问题，见下方）`)
    } catch (e) {
      setMsg(`校验失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    if (!planJson || !projectDir) { setMsg('请填写 plan:table JSON 路径与目标项目目录'); return }
    setBusy(true); setMsg(''); setSummary(null)
    try {
      const res = (await window.electron.plan.import(planJson, projectDir)) as PlanImportResult
      setSummary(res)
      setMsg(`已幂等导入 → ${res.name}（${res.device_count} 台设备 / ${res.terminals} 终端）`)
    } catch (e) {
      setMsg(`导入失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doRender = async () => {
    if (!summary?.mcpara_id) { setMsg('请先导入（需项目已登记 MC_Para 以获取渲染 id）'); return }
    setBusy(true); setMsg('')
    try {
      await window.electron.render.project([String(summary.mcpara_id)])
      setMsg(`已渲染 ${summary.name}（${summary.device_count} 台）→ output/ 目录`)
    } catch (e) {
      setMsg(`渲染失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doAnalyze = async () => {
    if (!projectDir) { setMsg('请填写目标项目目录'); return }
    setBusy(true); setMsg('')
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
        <Network size={14} /> AIDC 规划评估（导入→校验→渲染一条龙）
      </div>

      <div>
        <label className="block text-2xs text-gray-500 dark:text-gray-400 mb-1">plan:table JSON 路径</label>
        <div className="flex gap-1.5">
          <input className={inputCls} value={planJson} onChange={(e) => setPlanJson(e.target.value)}
            placeholder="如 D:/pilot64_output/plan_table.json" />
          <Button size="sm" variant="secondary" onClick={pickPlan}><FolderOpen size={12} /></Button>
        </div>
      </div>

      <div>
        <label className="block text-2xs text-gray-500 dark:text-gray-400 mb-1">目标项目目录（建议在 workspace 下）</label>
        <div className="flex gap-1.5">
          <input className={inputCls} value={projectDir} onChange={(e) => setProjectDir(e.target.value)}
            placeholder="如 D:/MC-AL/MagicCommander-Client/workspace/aidc_x" />
          <Button size="sm" variant="secondary" onClick={pickDir}><FolderOpen size={12} /></Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<ShieldCheck size={12} />} onClick={doValidate} disabled={busy}>
          校验
        </Button>
        <Button size="sm" variant="primary" icon={<FileJson size={12} />} onClick={doImport} disabled={busy}>
          幂等导入
        </Button>
        <Button size="sm" variant="danger" icon={<Play size={12} />} onClick={doRender} disabled={busy || !summary?.mcpara_id}>
          渲染
        </Button>
        <Button size="sm" variant="secondary" onClick={doAnalyze} disabled={busy}>
          分析
        </Button>
      </div>

      {msg && (
        <p className="flex items-center gap-1 text-2xs text-gray-500 dark:text-gray-400">
          {msg.includes('成功') || msg.includes('完成') || msg.includes('PASS')
            ? <CheckCircle2 size={12} />
            : <AlertTriangle size={12} />}
          {msg}
        </p>
      )}

      {validation && (
        <div className="text-2xs text-gray-500 dark:text-gray-400 space-y-0.5">
          <p className={clsx('font-medium', validation.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>
            {validation.ok ? '✓ 校验通过（PASS）' : `✗ 校验失败：${validation.issue_count} 项问题`}
          </p>
          {validation.issues.slice(0, 8).map((it, i) => (
            <p key={i} className="pl-2">- {it}</p>
          ))}
        </div>
      )}

      {summary && (
        <div className="text-2xs text-gray-500 dark:text-gray-400 space-y-0.5 border-t border-gray-200 dark:border-gray-700 pt-2">
          <p className="font-medium text-gray-600 dark:text-gray-300">
            {summary.name} · {summary.device_count} 台设备 · 接线 {summary.connections} · 终端 {summary.terminals}
          </p>
          {summary.bridge?.source && (
            <p>
              桥接标识：{summary.bridge.source}/{summary.bridge.projectType}/v{summary.bridge.bridgeVersion}
              {summary.mcpara_id ? ` · MC_Para id=${summary.mcpara_id}` : ''}
            </p>
          )}
        </div>
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

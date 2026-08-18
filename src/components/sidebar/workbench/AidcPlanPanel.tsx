/**
 * AIDC 规划评估面板（G4 + P2 契约 v1.2）。
 *
 * plan:table JSON / ZIP 交付包 → 校验（契约级）→ 自动匹配导入（新建/更新/跳过，按 projectId）
 * → 微观细化（tunable 可编辑重渲染）→ 配置渲染 → 可视化校对（四网表格/命令核对矩阵/拓扑回显）。
 * - 来源徽标：AL 项目名 + projectId 前 8 位 + mcPlanVersion
 * - 变更记录：changelog 字段级 diff（V-MC6）
 */
import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  Network, FileJson, FolderOpen, CheckCircle2, AlertTriangle, Play, ShieldCheck,
  Table2, GitCompare, SearchCheck, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import type { PlanImportResult, PlanValidateResult, VerifyResult } from '@/types/ipc'

interface AidcPlan {
  meta: {
    project?: string; site?: string; projectId?: string; projectName?: string
    planVersion?: number; planHash?: string
    source?: string; projectType?: string; bridgeVersion?: string
  }
  macro: Record<string, unknown>
  deviceList: Array<{ role: string; name?: string; model?: string; rack?: number; asn?: number; count?: number }>
  connections: Array<{ src: string; src_port?: string; dst: string; rate?: string; desc?: string }>
  terminals?: Array<{ src: string; src_port?: string; vlan?: number | string | null; desc?: string }>
  topology?: Record<string, unknown>
}

interface AnalyzeResult {
  missing_columns?: Array<{ template?: string; field?: string } | string>
  unused_columns?: unknown[]
  complexity?: number
}

interface TableData { name: string; headers: string[]; rows: Record<string, unknown>[] }

const EXCEL_FILES = ['hostname', 'connection', 'ipaddress', 'parameter']
const PLANE_LABEL: Record<string, string> = {
  '参数网': '#F59E0B', '存储网': '#10B981', '业务网': '#0284C7', '带外网': '#6B7280', '其他': '#9CA3AF',
}
const ROLE_PLANE: Record<string, string> = {
  SPINE: '参数网', LEAF: '参数网', STO_SPINE: '存储网', STO_LEAF: '存储网',
  BIZ_AGG: '业务网', BIZ_ACCESS: '业务网', OOB_AGG: '带外网', OOB_ACCESS: '带外网',
}
const ROLE_LAYER: Record<string, number> = {
  SPINE: 0, STO_SPINE: 0, BIZ_AGG: 0, OOB_AGG: 0,
  LEAF: 1, STO_LEAF: 1, BIZ_ACCESS: 1, OOB_ACCESS: 1,
}

/** P2（V-MC3）：plan 拓扑回显（轻量 SVG，平面×层级布局）。 */
function PlanTopologyMini({ plan }: { plan: AidcPlan }) {
  const svg = useMemo(() => {
    const devs = plan.deviceList.filter((d) => d.name)
    const byName = new Map(devs.map((d) => [d.name!, d]))
    const planes = ['参数网', '存储网', '业务网', '带外网']
    const pIdx: Record<string, number> = {}
    planes.forEach((p, i) => { pIdx[p] = i })
    const pos: Record<string, { x: number; y: number }> = {}
    const nodes: Array<{ id: string; x: number; y: number; plane: string; label: string }> = []
    const perKey: Record<string, typeof devs> = {}
    for (const d of devs) {
      const k = `${ROLE_PLANE[d.role] ?? '其他'}|${ROLE_LAYER[d.role] ?? 1}`
      ;(perKey[k] ??= []).push(d)
    }
    for (const [k, list] of Object.entries(perKey)) {
      const [plane, layerS] = k.split('|')
      const layer = Number(layerS)
      const px = pIdx[plane] ?? 3
      list.forEach((d, i) => {
        const x = px * 240 + 24 + (i % 2) * 118
        const y = layer * 130 + Math.floor(i / 2) * 34 + 12
        pos[d.name!] = { x, y }
        nodes.push({ id: d.name!, x, y, plane, label: d.name! })
      })
    }
    const edges: Array<{ source: string; target: string }> = []
    const byRole: Record<string, string[]> = {}
    for (const d of devs) { (byRole[d.role] ??= []).push(d.name!) }
    const counters: Record<string, number> = {}
    for (const c of plan.connections) {
      let t = c.dst
      if (!byName.has(t)) {
        const pool = byRole[t]
        if (!pool || !pool.length) continue
        counters[t] = (counters[t] ?? 0) + 1
        t = pool[(counters[t] - 1) % pool.length]
      }
      if (pos[c.src] && pos[t] && c.src !== t) edges.push({ source: c.src, target: t })
    }
    const W = planes.length * 240 + 60
    const H = 280
    return { nodes, edges, planes, W, H, pIdx }
  }, [plan])

  return (
    <div className="border rounded overflow-auto">
      <svg width={svg.W} height={svg.H} className="bg-white dark:bg-app-surface">
        {svg.edges.map((e, i) => {
          const a = svg.nodes.find((n) => n.id === e.source)
          const b = svg.nodes.find((n) => n.id === e.target)
          if (!a || !b) return null
          return <line key={i} x1={a.x + 60} y1={a.y + 10} x2={b.x} y2={b.y + 10}
            stroke="#94a3b8" strokeWidth={0.4} opacity={0.35} />
        })}
        {svg.nodes.map((n) => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={116} height={20} rx={3}
              fill={(PLANE_LABEL[n.plane] ?? '#999') + '33'} stroke={PLANE_LABEL[n.plane] ?? '#999'} strokeWidth={1} />
            <text x={n.x + 6} y={n.y + 14} fontSize={9} fill="currentColor"
              className="text-gray-700 dark:text-gray-200">
              {n.label.length > 16 ? n.label.slice(0, 15) + '…' : n.label}
            </text>
          </g>
        ))}
        {svg.planes.map((p, i) => (
          <text key={p} x={i * 240 + 28} y={10} fontSize={11} fontWeight={600} fill={PLANE_LABEL[p]}>{p}</text>
        ))}
      </svg>
    </div>
  )
}

/** P2（V-MC2）：命令核对矩阵。 */
function VerifyMatrix({ data }: { data: VerifyResult }) {
  const [openRows, setOpenRows] = useState(5)
  if (!data.ok) return <p className="text-2xs text-gray-500">{data.error ?? '核对失败'}</p>
  const checks = data.checks
  return (
    <div className="text-2xs">
      <p className="text-gray-500 mb-1">渲染于 {data.rendered_at} · {data.devices.length} 台设备</p>
      <div className="overflow-auto max-h-[380px] border rounded">
        <table className="w-full text-2xs">
          <thead className="sticky top-0 bg-gray-50 dark:bg-app-surface">
            <tr>
              <th className="px-1.5 py-1 text-left">设备</th>
              {checks.map((c) => <th key={c} className="px-1 py-1 font-medium">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.devices.slice(0, openRows).map((d) => (
              <tr key={d.name} className="border-t border-gray-100 dark:border-edge-subtle">
                <td className="px-1.5 py-0.5 font-mono">{d.name}</td>
                {d.results.map((r) => (
                  <td key={r.check} className={clsx('px-1 py-0.5 text-center',
                    !r.applicable ? 'text-gray-300 dark:text-gray-600'
                    : r.hit ? 'text-green-600' : 'text-red-500')}>
                    {!r.applicable ? '—' : r.hit ? '✓' : '✗'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.devices.length > openRows && (
        <button type="button" onClick={() => setOpenRows(openRows + 10)}
          className="text-xs text-primary-500 mt-1">展开更多设备</button>
      )}
      <div className="mt-2 space-y-0.5">
        {checks.filter((c) => data.summary[c]).map((c) => {
          const s = data.summary[c]
          const ok = s.hit === s.total
          return (
            <p key={c} className={clsx(ok ? 'text-green-600' : 'text-amber-600')}>
              {ok ? '✓' : '⚠'} {c}: {s.hit}/{s.total}
            </p>
          )
        })}
      </div>
    </div>
  )
}

/** P2（V-MC6）：变更记录（changelog）。 */
function ChangelogView({ changelog }: { changelog: PlanImportResult['changelog'] }) {
  if (!changelog?.length) return <p className="text-2xs text-gray-400">暂无变更记录</p>
  return (
    <div className="space-y-1 text-2xs">
      {changelog.map((c, i) => (
        <div key={i} className="border rounded p-2">
          <p className="text-gray-500">
            MC v{c.mcPlanVersion}（AL v{c.planVersion ?? '-'}）· {c.at?.slice(0, 19)?.replace('T', ' ')}
          </p>
          <p className="mt-0.5">{c.summary || '无字段级变化'}</p>
          {c.changed && c.changed.length > 0 && (
            <div className="mt-1 pl-2 border-l-2 border-gray-200 dark:border-edge-subtle space-y-0.5">
              {c.changed.slice(0, 8).map((ch, j) => (
                <p key={j} className="font-mono text-gray-600 dark:text-gray-300">
                  {ch.field}: {String(ch.from ?? '∅')} → {String(ch.to ?? '∅')}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function AidcPlanPanel({ isDark }: { isDark: boolean }) {
  const [planJson, setPlanJson] = useState('')
  const [projectDir, setProjectDir] = useState('')
  const [planObj, setPlanObj] = useState<AidcPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null)
  const [validation, setValidation] = useState<PlanValidateResult | null>(null)
  const [summary, setSummary] = useState<PlanImportResult | null>(null)
  const [verify, setVerify] = useState<VerifyResult | null>(null)
  const [tables, setTables] = useState<TableData[] | null>(null)
  const [pfc, setPfc] = useState('3')
  const [cnp, setCnp] = useState('6')
  const [resultTab, setResultTab] = useState<'tables' | 'verify' | 'topo' | 'changelog'>('tables')

  const inputCls = clsx(
    'w-full text-xs rounded border px-2 py-1',
    isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300',
  )

  const pickPlan = async () => {
    const p = await window.electron.dialog.openFile({
      title: '选择 plan:table JSON / ZIP 交付包',
      filters: [
        { name: 'plan:table JSON / 交付包', extensions: ['json', 'zip'] },
      ],
    })
    if (p) setPlanJson(p)
  }

  const pickDir = async () => {
    const p = await window.electron.dialog.openFile({
      title: '目标项目目录（可选，留空自动匹配）',
      properties: ['openDirectory'],
    })
    if (p) setProjectDir(p)
  }

  const targetDir = projectDir.trim() || undefined

  const doValidate = async () => {
    if (!planJson) { setMsg('请选择 plan:table JSON / ZIP 路径'); return }
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

  const loadPlanObject = async (name: string, id?: number) => {
    try {
      if (!id) return
      const text = await window.electron.project.readFile(id, 'plan.json', name)
      if (text) {
        const p = JSON.parse(text) as AidcPlan
        setPlanObj(p)
        setPfc(String((p.macro.pfcQueue ?? p.macro.pfc_queue ?? 3) as number))
        setCnp(String((p.macro.cnpQueue ?? p.macro.cnp_queue ?? 6) as number))
      }
    } catch { /* 读 plan 失败不阻塞 */ }
  }

  const doImport = async () => {
    if (!planJson) { setMsg('请选择 plan:table JSON / ZIP 路径'); return }
    setBusy(true); setMsg(''); setSummary(null); setVerify(null); setTables(null)
    try {
      const res = (await window.electron.plan.import(planJson, targetDir)) as PlanImportResult
      setSummary(res)
      const m = res.origin?.matched
      setMsg(m === 'skip'
        ? `规划无变化，跳过（${res.name} · MC v${res.mcPlanVersion}）`
        : `${m === 'update' ? '已更新' : m === 'new' ? '已新建' : '已导入'} → ${res.name}（MC v${res.mcPlanVersion}）`)
      await loadPlanObject(res.name, res.mcpara_id)
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
    if (!targetDir && !summary?.project_dir) { setMsg('请填写目标项目目录（或先导入）'); return }
    setBusy(true); setMsg('')
    try {
      const dir = targetDir || summary?.project_dir || ''
      const res = (await window.electron.plan.analyze(dir)) as AnalyzeResult
      setAnalysis(res)
      setMsg('j2 字段对齐检查完成')
    } catch (e) {
      setMsg(`分析失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doVerify = async () => {
    if (!targetDir && !summary?.project_dir) { setMsg('请填写目标项目目录（或先导入）'); return }
    setBusy(true); setMsg('')
    try {
      const dir = targetDir || summary?.project_dir || ''
      const res = (await window.electron.plan.verify(dir)) as VerifyResult
      setVerify(res)
      setResultTab('verify')
      setMsg(res.ok ? `命令核对完成（${res.devices?.length ?? 0} 台设备）` : (res.error ?? '核对失败'))
    } catch (e) {
      setMsg(`命令核对失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doTables = async () => {
    if (!summary?.mcpara_id) { setMsg('请先导入'); return }
    setBusy(true); setMsg('')
    try {
      const all: TableData[] = []
      for (const f of EXCEL_FILES) {
        const data = (await window.electron.project.readExcel(summary.mcpara_id, `excel/${f}.xlsx`, summary.name)) as TableData[]
        if (Array.isArray(data)) all.push(...data)
      }
      setTables(all)
      setResultTab('tables')
      setMsg(`已载入四网表格（${all.length} 个 sheet）`)
    } catch (e) {
      setMsg(`表格读取失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doTunableReimport = async () => {
    if (!planObj) { setMsg('请先导入以载入 plan'); return }
    setBusy(true); setMsg('')
    try {
      const next = structuredClone(planObj) as AidcPlan
      next.macro.pfcQueue = Number(pfc)
      next.macro.cnpQueue = Number(cnp)
      const res = (await window.electron.plan.importData(next, targetDir || summary?.project_dir)) as PlanImportResult
      setSummary(res)
      setPlanObj(next)
      setMsg(`tunable 已应用并重导入（MC v${res.mcPlanVersion}）：PFC=${pfc} CNP=${cnp}，可重新渲染`)
    } catch (e) {
      setMsg(`tunable 应用失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const matchedLabel = summary?.origin?.matched === 'skip' ? '跳过'
    : summary?.origin?.matched === 'update' ? '更新'
    : summary?.origin?.matched === 'new' ? '新建' : '导入'

  return (
    <div className={clsx('rounded-lg border p-3 space-y-2', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <Network size={14} /> AIDC 规划评估（契约 v1.2：导入→校验→细化→渲染→校对）
      </div>

      <div>
        <label className="block text-2xs text-gray-500 dark:text-gray-400 mb-1">plan:table JSON / ZIP 交付包路径</label>
        <div className="flex gap-1.5">
          <input className={inputCls} value={planJson} onChange={(e) => setPlanJson(e.target.value)}
            placeholder="支持 .json / .zip（AL 交付包）" />
          <Button size="sm" variant="secondary" onClick={pickPlan}><FolderOpen size={12} /></Button>
        </div>
      </div>

      <div>
        <label className="block text-2xs text-gray-500 dark:text-gray-400 mb-1">目标项目目录（可选，留空自动匹配 projectId）</label>
        <div className="flex gap-1.5">
          <input className={inputCls} value={projectDir} onChange={(e) => setProjectDir(e.target.value)}
            placeholder="留空 → 命中按 projectId 更新，否则默认 AL 项目名" />
          <Button size="sm" variant="secondary" onClick={pickDir}><FolderOpen size={12} /></Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<ShieldCheck size={12} />} onClick={doValidate} disabled={busy}>
          校验
        </Button>
        <Button size="sm" variant="primary" icon={<FileJson size={12} />} onClick={doImport} disabled={busy}>
          自动匹配导入
        </Button>
        <Button size="sm" variant="danger" icon={<Play size={12} />} onClick={doRender} disabled={busy || !summary?.mcpara_id}>
          渲染
        </Button>
        <Button size="sm" variant="secondary" onClick={doAnalyze} disabled={busy}>
          分析
        </Button>
        <Button size="sm" variant="secondary" icon={<SearchCheck size={12} />} onClick={doVerify} disabled={busy}>
          命令核对
        </Button>
        <Button size="sm" variant="secondary" icon={<Table2 size={12} />} onClick={doTables} disabled={busy}>
          四网表格
        </Button>
      </div>

      {/* P2（V-MC4）：tunable 可编辑 + 重导入 */}
      {planObj && (
        <div className="flex flex-wrap items-center gap-2 p-2 border rounded bg-gray-50/50 dark:bg-app-surface">
          <span className="text-2xs text-gray-500">可调参数（tunable）：</span>
          <label className="text-2xs text-gray-500">PFC 队列
            <input className={clsx(inputCls, '!w-14 ml-1')} type="number" min={0} max={7}
              value={pfc} onChange={(e) => setPfc(e.target.value)} aria-label="PFC 队列" />
          </label>
          <label className="text-2xs text-gray-500">CNP 队列
            <input className={clsx(inputCls, '!w-14 ml-1')} type="number" min={0} max={7}
              value={cnp} onChange={(e) => setCnp(e.target.value)} aria-label="CNP 队列" />
          </label>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={12} />} onClick={doTunableReimport}
            disabled={busy}>应用并重导入</Button>
          <span className="text-2xs text-gray-400">应用后需重新「渲染」生成新版本配置</span>
        </div>
      )}

      {msg && (
        <p className="flex items-center gap-1 text-2xs text-gray-500 dark:text-gray-400">
          {msg.includes('成功') || msg.includes('完成') || msg.includes('PASS') || msg.includes('已')
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
            {' · '}<span className={clsx(
              summary.origin?.matched === 'update' ? 'text-amber-600'
              : summary.origin?.matched === 'skip' ? 'text-gray-400'
              : 'text-green-600')}>{matchedLabel}</span>
            {' · '}MC v{summary.mcPlanVersion ?? '-'}{summary.origin?.planVersion != null ? ` · AL v${summary.origin.planVersion}` : ''}
          </p>
          {/* 来源徽标（M-7）：AL 项目 → MC 项目溯源 */}
          {summary.origin?.projectId && (
            <p className="flex items-center gap-1">
              <GitCompare size={12} />
              来源 AL 项目：{summary.origin.projectName || '-'}
              <span className="font-mono text-gray-400">#{String(summary.origin.projectId).replace(/-/g, '').slice(0, 8)}</span>
              {summary.origin.site ? ` · ${summary.origin.site}` : ''}
            </p>
          )}
          {summary.bridge?.source && (
            <p>
              桥接标识：{summary.bridge.source}/{summary.bridge.projectType}/v{summary.bridge.bridgeVersion}
              {summary.mcpara_id ? ` · MC_Para id=${summary.mcpara_id}` : ''}
            </p>
          )}
          {summary.warnings?.map((w, i) => <p key={i} className="text-amber-600">⚠ {w}</p>)}
        </div>
      )}

      {analysis && (
        <div className="text-2xs text-gray-500 dark:text-gray-400 space-y-0.5">
          <p>缺失字段: {analysis.missing_columns?.length ?? 0}</p>
          <p>未被引用字段: {analysis.unused_columns?.length ?? 0}</p>
          <p>复杂度: {analysis.complexity ?? 0}</p>
        </div>
      )}

      {/* 结果区：四网表格 / 命令核对 / 拓扑回显 / 变更记录 */}
      {summary && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
          <div className="flex flex-wrap gap-2 mb-2">
            {([['tables', '四网表格'], ['verify', '命令核对'], ['topo', '拓扑回显'], ['changelog', '变更记录']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setResultTab(k)}
                className={clsx('text-2xs px-2 py-0.5 rounded',
                  resultTab === k ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-app-surface hover:bg-gray-200')}>
                {l}
              </button>
            ))}
          </div>

          {resultTab === 'tables' && (tables
            ? (
              <div className="space-y-3 max-h-[380px] overflow-auto">
                {tables.map((t) => (
                  <div key={t.name} className="border rounded overflow-auto">
                    <p className="text-2xs font-medium px-2 py-1 bg-gray-50 dark:bg-app-surface sticky left-0">{t.name}</p>
                    <table className="w-full text-2xs">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-app-surface">
                        <tr>{t.headers.map((h) => <th key={h} className="px-1.5 py-0.5 text-left">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {t.rows.slice(0, 200).map((r, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-edge-subtle">
                            {t.headers.map((h) => <td key={h} className="px-1.5 py-0.5">{String(r[h] ?? '')}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )
            : <p className="text-2xs text-gray-400">点「四网表格」载入</p>)}

          {resultTab === 'verify' && (verify
            ? <VerifyMatrix data={verify} />
            : <p className="text-2xs text-gray-400">先渲染后再「命令核对」</p>)}

          {resultTab === 'topo' && (planObj
            ? <PlanTopologyMini plan={planObj} />
            : <p className="text-2xs text-gray-400">导入后回显 AL 规划拓扑</p>)}

          {resultTab === 'changelog' && <ChangelogView changelog={summary.changelog} />}
        </div>
      )}
    </div>
  )
}

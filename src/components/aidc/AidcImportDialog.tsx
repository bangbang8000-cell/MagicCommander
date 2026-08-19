/**
 * 打磨轮（P-C / MC-1）：「导入 AutoLink 项目」独立对话框——导入→校验→细化→渲染→校对 一条龙。
 *
 * 与常规项目工作台分离；复用现有 IPC 原语（plan.validate/import/importData/verify + render.project + project.readExcel）。
 */
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  FileJson, FolderOpen, CheckCircle2, AlertTriangle, Play, ShieldCheck,
  Table2, SearchCheck, GitCompare, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import type { PlanImportResult, PlanValidateResult, VerifyResult } from '@/types/ipc'

interface AidcPlan {
  meta: Record<string, unknown>
  macro: Record<string, unknown>
  deviceList: Array<{ role: string; name?: string; model?: string; rack?: number; asn?: number }>
  connections: Array<{ src: string; src_port?: string; dst: string; rate?: string; desc?: string }>
}

interface TableData { name: string; headers: string[]; rows: Record<string, unknown>[] }

const STEPS = ['导入', '校验', '细化', '渲染', '校对'] as const
const EXCEL_FILES = ['hostname', 'connection', 'ipaddress', 'parameter']

const ROLE_PLANE: Record<string, string> = {
  SPINE: '参数网', LEAF: '参数网', STO_SPINE: '存储网', STO_LEAF: '存储网',
  BIZ_AGG: '业务网', BIZ_ACCESS: '业务网', OOB_AGG: '带外网', OOB_ACCESS: '带外网',
}
const PLANE_LABEL: Record<string, string> = {
  '参数网': '#F59E0B', '存储网': '#10B981', '业务网': '#0284C7', '带外网': '#6B7280',
}

export function AidcImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [planJson, setPlanJson] = useState('')
  const [planObj, setPlanObj] = useState<AidcPlan | null>(null)
  const [summary, setSummary] = useState<PlanImportResult | null>(null)
  const [validation, setValidation] = useState<PlanValidateResult | null>(null)
  const [verify, setVerify] = useState<VerifyResult | null>(null)
  const [tables, setTables] = useState<TableData[] | null>(null)
  const [pfc, setPfc] = useState('3')
  const [cnp, setCnp] = useState('6')
  const [step, setStep] = useState(0)
  const [resultTab, setResultTab] = useState<'tables' | 'verify' | 'topo' | 'changelog'>('tables')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const inputCls = 'w-full text-xs rounded border px-2 py-1 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700'

  const pickPlan = async () => {
    const p = await window.electron.dialog.openFile({
      title: '选择 AutoLink 规划交付包（plan.json / zip）',
      filters: [{ name: 'plan:table JSON / 交付包', extensions: ['json', 'zip'] }],
    })
    if (p) setPlanJson(p)
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
    if (!planJson) { setMsg('请选择 AutoLink 规划交付包'); return }
    setBusy(true); setMsg(''); setSummary(null)
    try {
      const res = (await window.electron.plan.import(planJson)) as PlanImportResult
      setSummary(res)
      const m = res.origin?.matched
      setMsg(m === 'skip' ? `规划无变化，跳过（${res.name} · MC v${res.mcPlanVersion}）`
        : `${m === 'update' ? '已更新' : m === 'new' ? '已新建' : '已导入'} → ${res.name}（MC v${res.mcPlanVersion}）`)
      await loadPlanObject(res.name, res.mcpara_id)
      setStep(1)
    } catch (e) {
      setMsg(`导入失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doValidate = async () => {
    if (!planJson) { setMsg('请选择 AutoLink 规划交付包'); return }
    setBusy(true); setMsg('')
    try {
      const res = (await window.electron.plan.validate(planJson)) as PlanValidateResult
      setValidation(res)
      setMsg(res.ok ? '校验通过（PASS）' : `校验失败（${res.issue_count} 项问题）`)
      if (res.ok) setStep(2)
    } catch (e) {
      setMsg(`校验失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doTune = async () => {
    if (!planObj) { setMsg('请先导入以载入 plan'); return }
    setBusy(true); setMsg('')
    try {
      const next = structuredClone(planObj) as AidcPlan
      next.macro.pfcQueue = Number(pfc)
      next.macro.cnpQueue = Number(cnp)
      const res = (await window.electron.plan.importData(next, summary?.project_dir)) as PlanImportResult
      setSummary(res)
      setPlanObj(next)
      setMsg(`tunable 已应用并重导入（MC v${res.mcPlanVersion}）：PFC=${pfc} CNP=${cnp}`)
      setStep(3)
    } catch (e) {
      setMsg(`细化失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doRender = async () => {
    if (!summary?.mcpara_id) { setMsg('请先导入（需 MC_Para id）'); return }
    setBusy(true); setMsg('')
    try {
      await window.electron.render.project([String(summary.mcpara_id)])
      setMsg(`已渲染 ${summary.name}（${summary.device_count} 台）→ output/`)
      setStep(4)
    } catch (e) {
      setMsg(`渲染失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const doVerify = async () => {
    if (!summary?.project_dir) { setMsg('请先导入'); return }
    setBusy(true); setMsg('')
    try {
      const res = (await window.electron.plan.verify(summary.project_dir)) as VerifyResult
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

  const close = () => { onClose(); setStep(0); setSummary(null); setPlanObj(null); setPlanJson(''); setMsg('') }

  // 轻量拓扑回显
  const topo = useMemo(() => {
    if (!planObj) return null
    const devs = planObj.deviceList.filter((d) => d.name)
    const byName = new Map(devs.map((d) => [d.name!, d]))
    const byRole: Record<string, string[]> = {}
    for (const d of devs) { (byRole[d.role] ??= []).push(d.name!) }
    const pos: Record<string, { x: number; y: number }> = {}
    const nodes = devs.map((d, i) => {
      const px = (ROLE_PLANE[d.role] === '参数网' ? 0 : ROLE_PLANE[d.role] === '存储网' ? 1 : ROLE_PLANE[d.role] === '业务网' ? 2 : 3)
      const x = px * 240 + 24 + (i % 2) * 118
      const y = (d.role.includes('SPINE') || d.role.includes('AGG') ? 40 : 170) + Math.floor(i / 2) * 34
      pos[d.name!] = { x, y }
      return { id: d.name!, x, y, plane: ROLE_PLANE[d.role] ?? '其他' }
    })
    const edges: Array<{ s: string; t: string }> = []
    const counters: Record<string, number> = {}
    for (const c of planObj.connections) {
      let target = c.dst
      if (!byName.has(target)) {
        const pool = byRole[target]
        if (!pool || !pool.length) continue
        counters[target] = (counters[target] ?? 0) + 1
        target = pool[(counters[target] - 1) % pool.length]
      }
      if (pos[c.src] && pos[target]) edges.push({ s: c.src, t: target })
    }
    return { nodes, edges }
  }, [planObj])

  const matchedLabel = summary?.origin?.matched === 'skip' ? '跳过'
    : summary?.origin?.matched === 'update' ? '更新' : summary?.origin?.matched === 'new' ? '新建' : '导入'

  return (
    <Modal open={open} onClose={close} title="导入 AutoLink 项目" width="820px"
      footer={
        <div className="flex items-center gap-2">
          <span className="text-2xs text-gray-500 flex-1">{msg}</span>
          <Button size="sm" variant="secondary" onClick={close}>关闭</Button>
        </div>
      }>
      <div className="space-y-3">
        {/* 步骤指示 */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <span className={clsx('px-2 py-0.5 text-2xs rounded',
                i === step ? 'bg-primary-500 text-white' : i < step ? 'bg-success-100 dark:bg-success-900/30 text-success-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-500')}>
                {i + 1}. {s}
              </span>
              {i < STEPS.length - 1 && <span className="text-gray-300 dark:text-gray-600">→</span>}
            </div>
          ))}
        </div>

        {/* Step 1 导入 */}
        {step === 0 && (
          <div className="space-y-2">
            <label className="block text-2xs text-gray-500">AutoLink 规划交付包路径（plan.json / ZIP）</label>
            <div className="flex gap-1.5">
              <input className={inputCls} value={planJson} onChange={(e) => setPlanJson(e.target.value)} placeholder="支持 AutoLink 导出的 .json / .zip 交付包" />
              <Button size="sm" variant="secondary" onClick={pickPlan}><FolderOpen size={12} /></Button>
            </div>
            <Button size="sm" variant="primary" icon={<FileJson size={12} />} onClick={doImport} disabled={busy || !planJson}>
              {busy ? '导入中…' : '自动匹配导入'}
            </Button>
          </div>
        )}

        {/* Step 2 校验 */}
        {step === 1 && (
          <div className="space-y-2">
            <Button size="sm" variant="secondary" icon={<ShieldCheck size={12} />} onClick={doValidate} disabled={busy}>
              契约级校验
            </Button>
            {validation && (
              <div className="text-2xs space-y-0.5">
                <p className={clsx('font-medium', validation.ok ? 'text-green-600' : 'text-red-500')}>
                  {validation.ok ? '✓ 校验通过（PASS）' : `✗ 校验失败：${validation.issue_count} 项问题`}
                </p>
                {validation.issues.slice(0, 8).map((it, i) => <p key={i} className="pl-2 text-gray-500">- {it}</p>)}
              </div>
            )}
            {summary && (
              <div className="text-2xs text-gray-500 space-y-0.5 border-t pt-2">
                <p className="font-medium text-gray-700 dark:text-gray-300">
                  {summary.name} · {summary.device_count} 台 · {matchedLabel} · MC v{summary.mcPlanVersion}
                  {summary.origin?.planVersion != null ? ` · AL v${summary.origin.planVersion}` : ''}
                </p>
                {summary.origin?.projectId && (
                  <p className="flex items-center gap-1">
                    <GitCompare size={12} />
                    来源 AutoLink 项目：{summary.origin.projectName || '-'}
                    <span className="font-mono text-gray-400">#{String(summary.origin.projectId).replace(/-/g, '').slice(0, 8)}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3 细化 */}
        {step === 2 && (
          <div className="space-y-2">
            <p className="text-2xs text-gray-500">可调参数（tunable）：PFC / CNP 队列，应用后重新导入（版本标记）</p>
            <div className="flex items-center gap-3">
              <label className="text-2xs text-gray-500">PFC 队列
                <input className={clsx(inputCls, '!w-16 ml-1')} type="number" min={0} max={7} value={pfc} onChange={(e) => setPfc(e.target.value)} />
              </label>
              <label className="text-2xs text-gray-500">CNP 队列
                <input className={clsx(inputCls, '!w-16 ml-1')} type="number" min={0} max={7} value={cnp} onChange={(e) => setCnp(e.target.value)} />
              </label>
              <Button size="sm" variant="secondary" icon={<RefreshCw size={12} />} onClick={doTune} disabled={busy}>
                应用并重导入
              </Button>
            </div>
          </div>
        )}

        {/* Step 4 渲染 */}
        {step === 3 && (
          <div className="space-y-2">
            <p className="text-2xs text-gray-500">渲染该 AIDC 项目的全部设备配置（复用常规渲染通道，输出到 output/ 时间戳批次）</p>
            <Button size="sm" variant="danger" icon={<Play size={12} />} onClick={doRender} disabled={busy || !summary?.mcpara_id}>
              {busy ? '渲染中…' : `渲染 ${summary?.device_count ?? 0} 台设备`}
            </Button>
          </div>
        )}

        {/* Step 5 校对 */}
        {step === 4 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<Table2 size={12} />} onClick={doTables} disabled={busy}>四网表格</Button>
              <Button size="sm" variant="secondary" icon={<SearchCheck size={12} />} onClick={doVerify} disabled={busy}>命令核对</Button>
            </div>
            <div className="flex flex-wrap gap-2 mb-1">
              {([['tables', '四网表格'], ['verify', '命令核对'], ['topo', '拓扑回显'], ['changelog', '变更记录']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setResultTab(k)}
                  className={clsx('text-2xs px-2 py-0.5 rounded', resultTab === k ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-700')}>
                  {l}
                </button>
              ))}
            </div>

            {resultTab === 'tables' && (tables
              ? (
                <div className="space-y-2 max-h-[320px] overflow-auto">
                  {tables.map((tb) => (
                    <div key={tb.name} className="border rounded overflow-auto">
                      <p className="text-2xs font-medium px-2 py-1 bg-gray-50 dark:bg-gray-800 sticky left-0">{tb.name}</p>
                      <table className="w-full text-2xs">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                          <tr>{tb.headers.map((h) => <th key={h} className="px-1.5 py-0.5 text-left">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {tb.rows.slice(0, 100).map((r, i) => (
                            <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                              {tb.headers.map((h) => <td key={h} className="px-1.5 py-0.5">{String(r[h] ?? '')}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : <p className="text-2xs text-gray-400">点「四网表格」载入</p>)}

            {resultTab === 'verify' && (verify
              ? (
                <div className="text-2xs overflow-auto max-h-[320px]">
                  {verify.devices?.length ? (
                    <table className="w-full">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800"><tr><th className="px-1.5 py-1 text-left">设备</th>{verify.checks.map((c) => <th key={c} className="px-1">{c}</th>)}</tr></thead>
                      <tbody>
                        {verify.devices.slice(0, 20).map((d) => (
                          <tr key={d.name} className="border-t border-gray-100 dark:border-gray-700">
                            <td className="px-1.5 py-0.5 font-mono">{d.name}</td>
                            {d.results.map((r) => (
                              <td key={r.check} className={clsx('px-1 text-center', !r.applicable ? 'text-gray-300 dark:text-gray-600' : r.hit ? 'text-green-600' : 'text-red-500')}>
                                {!r.applicable ? '—' : r.hit ? '✓' : '✗'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-gray-400">{verify.error ?? '先渲染后再核对'}</p>}
                </div>
              ) : <p className="text-2xs text-gray-400">先渲染后再「命令核对」</p>)}

            {resultTab === 'topo' && (topo
              ? (
                <div className="border rounded overflow-auto">
                  <svg width={1000} height={280}>
                    {topo.edges.map((e, i) => {
                      const a = topo.nodes.find((n) => n.id === e.s)
                      const b = topo.nodes.find((n) => n.id === e.t)
                      if (!a || !b) return null
                      return <line key={i} x1={a.x + 60} y1={a.y + 10} x2={b.x} y2={b.y + 10} stroke="#94a3b8" strokeWidth={0.4} opacity={0.35} />
                    })}
                    {topo.nodes.map((n) => (
                      <g key={n.id}>
                        <rect x={n.x} y={n.y} width={116} height={20} rx={3} fill={(PLANE_LABEL[n.plane] ?? '#999') + '33'} stroke={PLANE_LABEL[n.plane] ?? '#999'} />
                        <text x={n.x + 6} y={n.y + 14} fontSize={9} fill="currentColor">{n.id.length > 16 ? n.id.slice(0, 15) + '…' : n.id}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              ) : <p className="text-2xs text-gray-400">导入后回显 AutoLink 规划拓扑</p>)}

            {resultTab === 'changelog' && (
              <div className="text-2xs space-y-1 max-h-[320px] overflow-auto">
                {summary?.changelog?.length ? summary.changelog.map((c, i) => (
                  <div key={i} className="border rounded p-2">
                    <p className="text-gray-500">MC v{c.mcPlanVersion}（AL v{c.planVersion ?? '-'}）· {c.at?.slice(0, 19)?.replace('T', ' ')}</p>
                    <p className="mt-0.5">{c.summary || '无字段级变化'}</p>
                  </div>
                )) : <p className="text-gray-400">暂无变更记录</p>}
              </div>
            )}
          </div>
        )}

        {msg && (
          <p className={clsx('flex items-center gap-1 text-2xs', msg.includes('失败') ? 'text-red-500' : 'text-gray-500')}>
            {msg.includes('失败') ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
            {msg}
          </p>
        )}
      </div>
    </Modal>
  )
}

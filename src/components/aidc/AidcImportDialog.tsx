/**
 * 打磨轮（P-C / MC-1）：「导入 AutoLink 项目」独立对话框——导入→校验→细化→渲染→校对 一条龙。
 *
 * 与常规项目工作台分离；复用现有 IPC 原语（plan.validate/import/importData/verify + render.project + project.readExcel）。
 * M2（MC-I1 / MC-UI1）：全量接入 aidc:import.* 命名空间 i18n；样式由 msgError 状态字段驱动（非 includes('失败')）。
 */
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/project.store'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  FileJson,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  Play,
  ShieldCheck,
  Table2,
  SearchCheck,
  GitCompare,
  RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import type { PlanImportResult, PlanValidateResult, VerifyResult } from '@/types/ipc'

interface AidcPlan {
  meta: Record<string, unknown>
  macro: Record<string, unknown>
  deviceList: Array<{ role: string; name?: string; model?: string; rack?: number; asn?: number }>
  connections: Array<{ src: string; src_port?: string; dst: string; rate?: string; desc?: string }>
}

interface TableData {
  name: string
  headers: string[]
  rows: Record<string, unknown>[]
}

const STEPS_KEYS = ['import', 'validate', 'tune', 'render', 'proofread'] as const
const EXCEL_FILES = ['hostname', 'connection', 'ipaddress', 'parameter']

// MC-M3b: 结果分页（校验 issue / 四网表格 / 核对矩阵 超阈值翻页）
const PAGE_SIZE_TABLE = 100
const PAGE_SIZE_VERIFY = 20

/** 轻量翻页条：superset 时展示，避免一次性渲染海量行 */
function Pager({
  page,
  total,
  pageSize,
  t,
  onPrev,
  onNext,
}: {
  page: number
  total: number
  pageSize: number
  t: (k: string, opts?: Record<string, string | number>) => string
  onPrev: () => void
  onNext: () => void
}) {
  if (total === 0) return null
  const start = page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, total)
  return (
    <div className="flex items-center gap-1 text-2xs text-gray-500">
      <button
        type="button"
        disabled={page === 0}
        onClick={onPrev}
        className="px-1.5 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ← {t('aidc:import.pagePrev')}
      </button>
      <span className="font-mono">{t('aidc:import.pageInfo', { start, end, total })}</span>
      <button
        type="button"
        disabled={end >= total}
        onClick={onNext}
        className="px-1.5 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {t('aidc:import.pageNext')} →
      </button>
    </div>
  )
}

/** 角色 → 平面（i18n key 后缀：param/storage/biz/oob） */
const ROLE_PLANE: Record<string, 'param' | 'storage' | 'biz' | 'oob'> = {
  SPINE: 'param',
  LEAF: 'param',
  STO_SPINE: 'storage',
  STO_LEAF: 'storage',
  BIZ_AGG: 'biz',
  BIZ_ACCESS: 'biz',
  OOB_AGG: 'oob',
  OOB_ACCESS: 'oob',
}
const PLANE_COLOR: Record<string, string> = {
  param: '#F59E0B',
  storage: '#10B981',
  biz: '#0284C7',
  oob: '#6B7280',
}

export function AidcImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [planJson, setPlanJson] = useState('')
  const [planObj, setPlanObj] = useState<AidcPlan | null>(null)
  // MC-M3a: plan 对象 ref——自动流转（导入→校验→细化）在同一异步链中需读取最新 plan，避免闭包过期
  const planObjRef = useRef<AidcPlan | null>(null)
  const [summary, setSummary] = useState<PlanImportResult | null>(null)
  const [validation, setValidation] = useState<PlanValidateResult | null>(null)
  const [verify, setVerify] = useState<VerifyResult | null>(null)
  const [tables, setTables] = useState<TableData[] | null>(null)
  // MC-M3b: 各表格独立分页 + 核对矩阵分页；MC-M3d: 拓扑缩放
  const [tablePage, setTablePage] = useState<Record<string, number>>({})
  const [verifyPage, setVerifyPage] = useState(0)
  const [issuePage, setIssuePage] = useState(0)
  const [topoZoom, setTopoZoom] = useState(1)
  const [pfc, setPfc] = useState('3')
  const [cnp, setCnp] = useState('6')
  // MC-M3f: tunable 扩展——bgpMaxPaths / ipSegments / naming 进 GUI（细化时生效）
  const [bgpMax, setBgpMax] = useState('16')
  const [segments, setSegments] = useState<Record<string, string>>({})
  const [namingFormat, setNamingFormat] = useState('')
  const SEGMENT_KEYS = ['loopback', 'compute', 'storage', 'biz', 'oob', 'interconnect'] as const
  const [step, setStep] = useState(0)
  const [resultTab, setResultTab] = useState<'tables' | 'verify' | 'topo' | 'changelog'>('tables')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  // MC-U1: 状态字段驱动样式（i18n 后不能靠 includes('失败') 判断）
  const [msgError, setMsgError] = useState(false)

  const inputCls =
    'w-full text-xs rounded border px-2 py-1 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700'

  const setStatus = (m: string, isError = false) => {
    setMsg(m)
    setMsgError(isError)
  }

  const pickPlan = async () => {
    const p = await window.electron.dialog.openFile({
      title: t('aidc:import.dialogTitle'),
      filters: [{ name: t('aidc:import.dialogFilter'), extensions: ['json', 'zip'] }],
    })
    if (p) setPlanJson(p)
  }

  const loadPlanObject = async (name: string, id?: number) => {
    try {
      if (!id) return
      const text = await window.electron.project.readFile(id, 'plan.json', name)
      if (text) {
        const p = JSON.parse(text) as AidcPlan
        planObjRef.current = p
        setPlanObj(p)
        setPfc(String((p.macro.pfcQueue ?? p.macro.pfc_queue ?? 3) as number))
        setCnp(String((p.macro.cnpQueue ?? p.macro.cnp_queue ?? 6) as number))
        // MC-M3f: bgpMaxPaths / ipSegments / naming 预载
        setBgpMax(String((p.macro.bgpMaxPaths ?? p.macro.bgp_max_paths ?? 16) as number))
        const segs = (p.macro.ipSegments ?? p.macro.ip_segments) as Record<string, string> | undefined
        const naming = (p.macro.naming ?? {}) as Record<string, unknown> | undefined
        setSegments({
          loopback: segs?.loopback ?? '10.1.0.0/20',
          compute: segs?.compute ?? '10.1.16.0/20',
          storage: segs?.storage ?? '10.1.32.0/20',
          biz: segs?.biz ?? '10.1.48.0/20',
          oob: segs?.oob ?? '10.1.64.0/21',
          interconnect: segs?.interconnect ?? '10.1.72.0/21',
        })
        setNamingFormat((naming?.format as string) ?? '{site}-R{rack:02d}-AIDC-{vendor}-{abbr}-{seq:02d}')
      }
    } catch {
      /* 读 plan 失败不阻塞 */
    }
  }

  const doImport = async () => {
    if (!planJson) {
      setStatus(t('aidc:import.selectPlan'), true)
      return
    }
    setBusy(true)
    setStatus('')
    setSummary(null)
    try {
      const res = (await window.electron.plan.import(planJson)) as PlanImportResult
      setSummary(res)
      // 导入成功后刷新项目列表（新项目立即可见于项目浏览器；此前列表为应用启动时快照）
      await useProjectStore.getState().fetchProjects()
      const m = res.origin?.matched
      if (m === 'skip') {
        setStatus(t('aidc:import.skipped', { name: res.name, ver: res.mcPlanVersion }))
      } else {
        const action =
          m === 'update' ? t('aidc:import.updated') : m === 'new' ? t('aidc:import.created') : t('aidc:import.imported')
        setStatus(t('aidc:import.importedMsg', { action, name: res.name, ver: res.mcPlanVersion }))
      }
      await loadPlanObject(res.name, res.mcpara_id)
      setStep(1)
      // MC-M3a: 自动流转——导入成功自动进入校验
      await doValidate()
    } catch (e) {
      setStatus(t('aidc:import.importFailed', { err: (e as Error).message }), true)
    } finally {
      setBusy(false)
    }
  }

  const doValidate = async () => {
    // MC-M3e: 校验数据源统一——优先以内存 plan 对象为准；路径仅在初始导入时读取
    const current = planObjRef.current ?? planObj
    if (!current && !planJson) {
      setStatus(t('aidc:import.selectPlan'), true)
      return
    }
    setBusy(true)
    setStatus('')
    try {
      const res = current
        ? ((await window.electron.plan.validateData(current)) as PlanValidateResult)
        : ((await window.electron.plan.validate(planJson)) as PlanValidateResult)
      setValidation(res)
      setStatus(
        res.ok ? t('aidc:import.validatePass') : t('aidc:import.validateFail', { count: res.issue_count }),
        !res.ok,
      )
      if (res.ok) {
        setStep(2)
        // MC-M3a: 校验通过自动细化（用已载入的 PFC/CNP 队列值）
        await doTune()
      }
    } catch (e) {
      setStatus(t('aidc:import.validateFailed', { err: (e as Error).message }), true)
    } finally {
      setBusy(false)
    }
  }

  const doTune = async () => {
    const current = planObjRef.current ?? planObj
    if (!current) {
      setStatus(t('aidc:import.selectPlanFirst'), true)
      return
    }
    setBusy(true)
    setStatus('')
    try {
      const next = structuredClone(current) as AidcPlan
      next.macro.pfcQueue = Number(pfc)
      next.macro.cnpQueue = Number(cnp)
      // MC-M3f: 应用扩展 tunable（bgpMaxPaths / ipSegments / naming.format）
      next.macro.bgpMaxPaths = Number(bgpMax) || 16
      const segs = next.macro.ipSegments as Record<string, string> | undefined
      const baseSegs = (segs && typeof segs === 'object' ? segs : {}) as Record<string, string>
      for (const k of SEGMENT_KEYS) {
        const v = segments[k]?.trim()
        if (v) baseSegs[k] = v
      }
      next.macro.ipSegments = baseSegs
      const nm = (next.macro.naming ?? {}) as Record<string, unknown>
      nm.format = namingFormat.trim() || nm.format
      next.macro.naming = nm
      const res = (await window.electron.plan.importData(next, summary?.project_dir)) as PlanImportResult
      planObjRef.current = next
      setSummary(res)
      setPlanObj(next)
      setStatus(t('aidc:import.tuneApplied', { ver: res.mcPlanVersion, pfc, cnp }))
      setStep(3)
    } catch (e) {
      setStatus(t('aidc:import.tuneFailed', { err: (e as Error).message }), true)
    } finally {
      setBusy(false)
    }
  }

  const doRender = async () => {
    if (!summary?.mcpara_id) {
      setStatus(t('aidc:import.needMcpara'), true)
      return
    }
    setBusy(true)
    setStatus('')
    try {
      await window.electron.render.project([String(summary.mcpara_id)])
      setStatus(t('aidc:import.rendered', { name: summary.name, count: summary.device_count }))
      setStep(4)
    } catch (e) {
      setStatus(t('aidc:import.renderFailed', { err: (e as Error).message }), true)
    } finally {
      setBusy(false)
    }
  }

  const doVerify = async () => {
    if (!summary?.project_dir) {
      setStatus(t('aidc:import.needImport'), true)
      return
    }
    setBusy(true)
    setStatus('')
    try {
      const res = (await window.electron.plan.verify(summary.project_dir)) as VerifyResult
      setVerify(res)
      setResultTab('verify')
      setStatus(
        res.ok
          ? t('aidc:import.verifyDone', { count: res.devices?.length ?? 0 })
          : (res.error ?? t('aidc:import.verifyFailed', { err: '' })),
        !res.ok,
      )
    } catch (e) {
      setStatus(t('aidc:import.verifyFailed', { err: (e as Error).message }), true)
    } finally {
      setBusy(false)
    }
  }

  const doTables = async () => {
    if (!summary?.mcpara_id) {
      setStatus(t('aidc:import.needImport'), true)
      return
    }
    setBusy(true)
    setStatus('')
    try {
      const all: TableData[] = []
      for (const f of EXCEL_FILES) {
        const data = (await window.electron.project.readExcel(
          summary.mcpara_id,
          `excel/${f}.xlsx`,
          summary.name,
        )) as TableData[]
        if (Array.isArray(data)) all.push(...data)
      }
      setTables(all)
      setResultTab('tables')
      setStatus(t('aidc:import.tablesLoaded', { count: all.length }))
    } catch (e) {
      setStatus(t('aidc:import.tablesFailed', { err: (e as Error).message }), true)
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    onClose()
    setStep(0)
    setSummary(null)
    setPlanObj(null)
    setPlanJson('')
    setStatus('')
  }

  // 轻量拓扑回显
  const topo = useMemo(() => {
    if (!planObj) return null
    const devs = planObj.deviceList.filter((d) => d.name)
    const byName = new Map(devs.map((d) => [d.name!, d]))
    const byRole: Record<string, string[]> = {}
    for (const d of devs) {
      ;(byRole[d.role] ??= []).push(d.name!)
    }
    const pos: Record<string, { x: number; y: number }> = {}
    const nodes = devs.map((d, i) => {
      const plane = ROLE_PLANE[d.role] ?? 'other'
      const px = plane === 'param' ? 0 : plane === 'storage' ? 1 : plane === 'biz' ? 2 : 3
      const x = px * 240 + 24 + (i % 2) * 118
      const y = (d.role.includes('SPINE') || d.role.includes('AGG') ? 40 : 170) + Math.floor(i / 2) * 34
      pos[d.name!] = { x, y }
      return { id: d.name!, x, y, plane }
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

  const matchedLabel =
    summary?.origin?.matched === 'skip'
      ? t('aidc:import.matched.skip')
      : summary?.origin?.matched === 'update'
        ? t('aidc:import.matched.update')
        : summary?.origin?.matched === 'new'
          ? t('aidc:import.matched.new')
          : t('aidc:import.matched.import')

  const stepLabel = (key: string) => t(`aidc:import.steps.${key}`)

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('aidc:import.title')}
      width="820px"
      footer={
        <div className="flex items-center gap-2">
          <span className={clsx('text-2xs flex-1', msgError ? 'text-red-500' : 'text-gray-500')}>{msg}</span>
          <Button size="sm" variant="secondary" onClick={close}>
            {t('aidc:import.close')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* 步骤指示 */}
        <div className="flex items-center gap-1">
          {STEPS_KEYS.map((k, i) => (
            <div key={k} className="flex items-center gap-1">
              <span
                className={clsx(
                  'px-2 py-0.5 text-2xs rounded',
                  i === step
                    ? 'bg-primary-500 text-white'
                    : i < step
                      ? 'bg-success-100 dark:bg-success-900/30 text-success-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500',
                )}
              >
                {i + 1}. {stepLabel(k)}
              </span>
              {i < STEPS_KEYS.length - 1 && <span className="text-gray-300 dark:text-gray-600">→</span>}
            </div>
          ))}
        </div>

        {/* Step 1 导入 */}
        {step === 0 && (
          <div className="space-y-2">
            <label className="block text-2xs text-gray-500">{t('aidc:import.pathLabel')}</label>
            <div className="flex gap-1.5">
              <input
                className={inputCls}
                value={planJson}
                onChange={(e) => setPlanJson(e.target.value)}
                placeholder={t('aidc:import.pathPlaceholder')}
              />
              <Button size="sm" variant="secondary" onClick={pickPlan}>
                <FolderOpen size={12} />
              </Button>
            </div>
            <Button
              size="sm"
              variant="primary"
              icon={<FileJson size={12} />}
              onClick={doImport}
              disabled={busy || !planJson}
            >
              {busy ? t('aidc:import.importing') : t('aidc:import.importBtn')}
            </Button>
          </div>
        )}

        {/* Step 2 校验 */}
        {step === 1 && (
          <div className="space-y-2">
            <Button size="sm" variant="secondary" icon={<ShieldCheck size={12} />} onClick={doValidate} disabled={busy}>
              {t('aidc:import.validateBtn')}
            </Button>
            {validation && (
              <div className="text-2xs space-y-0.5">
                <p className={clsx('font-medium', validation.ok ? 'text-green-600' : 'text-red-500')}>
                  {validation.ok
                    ? t('aidc:import.validatePass')
                    : t('aidc:import.validateFail', { count: validation.issue_count })}
                </p>
                {validation.issues.slice(issuePage * 8, (issuePage + 1) * 8).map((it, i) => (
                  <p key={i} className="pl-2 text-gray-500">
                    - {it}
                  </p>
                ))}
                {validation.issues.length > 8 && (
                  <Pager
                    page={issuePage}
                    total={validation.issues.length}
                    pageSize={8}
                    t={t}
                    onPrev={() => setIssuePage((p) => Math.max(0, p - 1))}
                    onNext={() => setIssuePage((p) => p + 1)}
                  />
                )}
              </div>
            )}
            {summary && (
              <div className="text-2xs text-gray-500 space-y-0.5 border-t pt-2">
                <p className="font-medium text-gray-700 dark:text-gray-300">
                  {summary.name} · {t('aidc:import.devices', { count: summary.device_count })} · {matchedLabel} · MC v
                  {summary.mcPlanVersion}
                  {summary.origin?.planVersion != null ? ` · AL v${summary.origin.planVersion}` : ''}
                </p>
                {summary.origin?.projectId && (
                  <p className="flex items-center gap-1">
                    <GitCompare size={12} />
                    {t('aidc:import.sourceProject')}
                    {summary.origin.projectName || '-'}
                    <span className="font-mono text-gray-400">
                      #{String(summary.origin.projectId).replace(/-/g, '').slice(0, 8)}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3 细化 */}
        {step === 2 && (
          <div className="space-y-2">
            <p className="text-2xs text-gray-500">{t('aidc:import.tuneDesc')}</p>
            <div className="flex items-center gap-3">
              <label className="text-2xs text-gray-500">
                {t('aidc:import.tunePfc')}
                <input
                  className={clsx(inputCls, '!w-16 ml-1')}
                  type="number"
                  min={0}
                  max={7}
                  value={pfc}
                  onChange={(e) => setPfc(e.target.value)}
                />
              </label>
              <label className="text-2xs text-gray-500">
                {t('aidc:import.tuneCnp')}
                <input
                  className={clsx(inputCls, '!w-16 ml-1')}
                  type="number"
                  min={0}
                  max={7}
                  value={cnp}
                  onChange={(e) => setCnp(e.target.value)}
                />
              </label>
              {/* MC-M3f: bgpMaxPaths */}
              <label className="text-2xs text-gray-500">
                {t('aidc:import.tuneBgpMax')}
                <input
                  className={clsx(inputCls, '!w-20 ml-1')}
                  type="number"
                  min={1}
                  max={32}
                  value={bgpMax}
                  onChange={(e) => setBgpMax(e.target.value)}
                />
              </label>
              <Button size="sm" variant="secondary" icon={<RefreshCw size={12} />} onClick={doTune} disabled={busy}>
                {t('aidc:import.tuneApply')}
              </Button>
            </div>
            <details className="text-2xs text-gray-500 border border-gray-200 dark:border-gray-700 rounded p-2">
              <summary className="cursor-pointer font-medium">{t('aidc:import.tuneAdvanced')}</summary>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="text-2xs text-gray-400 mb-1">{t('aidc:import.tuneIpSegments')}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {SEGMENT_KEYS.map((k) => (
                      <label key={k} className="flex items-center gap-1">
                        <span className="w-24 shrink-0">{t(`aidc:import.seg.${k}`)}</span>
                        <input
                          className={clsx(inputCls, 'flex-1 font-mono')}
                          value={segments[k] ?? ''}
                          onChange={(e) => setSegments((s) => ({ ...s, [k]: e.target.value }))}
                          placeholder="10.1.0.0/20"
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-1">
                  <span className="w-24 shrink-0">{t('aidc:import.tuneNamingFormat')}</span>
                  <input
                    className={clsx(inputCls, 'flex-1 font-mono')}
                    value={namingFormat}
                    onChange={(e) => setNamingFormat(e.target.value)}
                    placeholder="{site}-R{rack:02d}-AIDC-{vendor}-{abbr}-{seq:02d}"
                  />
                </label>
              </div>
            </details>
          </div>
        )}

        {/* Step 4 渲染 */}
        {step === 3 && (
          <div className="space-y-2">
            <p className="text-2xs text-gray-500">{t('aidc:import.renderDesc')}</p>
            <Button
              size="sm"
              variant="danger"
              icon={<Play size={12} />}
              onClick={doRender}
              disabled={busy || !summary?.mcpara_id}
            >
              {busy ? t('aidc:import.rendering') : t('aidc:import.renderBtn', { count: summary?.device_count ?? 0 })}
            </Button>
          </div>
        )}

        {/* Step 5 校对 */}
        {step === 4 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<Table2 size={12} />} onClick={doTables} disabled={busy}>
                {t('aidc:import.proofTables')}
              </Button>
              <Button size="sm" variant="secondary" icon={<SearchCheck size={12} />} onClick={doVerify} disabled={busy}>
                {t('aidc:import.proofVerify')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mb-1">
              {(
                [
                  ['tables', t('aidc:import.proofTables')],
                  ['verify', t('aidc:import.proofVerify')],
                  ['topo', t('aidc:import.proofTopo')],
                  ['changelog', t('aidc:import.proofChangelog')],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setResultTab(k)}
                  className={clsx(
                    'text-2xs px-2 py-0.5 rounded',
                    resultTab === k ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-700',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>

            {resultTab === 'tables' &&
              (tables ? (
                <div className="space-y-2 max-h-[320px] overflow-auto">
                  {tables.map((tb) => {
                    const page = tablePage[tb.name] ?? 0
                    const pageRows = tb.rows.slice(page * PAGE_SIZE_TABLE, (page + 1) * PAGE_SIZE_TABLE)
                    return (
                      <div key={tb.name} className="border rounded overflow-auto">
                        <div className="flex items-center justify-between px-2 py-1 bg-gray-50 dark:bg-gray-800 sticky left-0">
                          <p className="text-2xs font-medium">{tb.name}</p>
                          {tb.rows.length > PAGE_SIZE_TABLE && (
                            <Pager
                              page={page}
                              total={tb.rows.length}
                              pageSize={PAGE_SIZE_TABLE}
                              t={t}
                              onPrev={() =>
                                setTablePage((p) => ({ ...p, [tb.name]: Math.max(0, (p[tb.name] ?? 0) - 1) }))
                              }
                              onNext={() => setTablePage((p) => ({ ...p, [tb.name]: (p[tb.name] ?? 0) + 1 }))}
                            />
                          )}
                        </div>
                        <table className="w-full text-2xs">
                          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                            <tr>
                              {tb.headers.map((h) => (
                                <th key={h} className="px-1.5 py-0.5 text-left">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pageRows.map((r, i) => (
                              <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                                {tb.headers.map((h) => (
                                  <td key={h} className="px-1.5 py-0.5">
                                    {String(r[h] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-2xs text-gray-400">{t('aidc:import.tablesHint')}</p>
              ))}

            {resultTab === 'verify' &&
              (verify ? (
                <div className="text-2xs overflow-auto max-h-[320px]">
                  {verify.devices?.length ? (
                    <>
                      {verify.devices.length > PAGE_SIZE_VERIFY && (
                        <div className="flex justify-end sticky top-0 bg-gray-50 dark:bg-gray-800 z-10 px-1 py-0.5">
                          <Pager
                            page={verifyPage}
                            total={verify.devices.length}
                            pageSize={PAGE_SIZE_VERIFY}
                            t={t}
                            onPrev={() => setVerifyPage((p) => Math.max(0, p - 1))}
                            onNext={() => setVerifyPage((p) => p + 1)}
                          />
                        </div>
                      )}
                      <table className="w-full">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-1.5 py-1 text-left">{t('aidc:import.deviceHeader')}</th>
                            {verify.checks.map((c) => (
                              <th key={c} className="px-1">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {verify.devices
                            .slice(verifyPage * PAGE_SIZE_VERIFY, (verifyPage + 1) * PAGE_SIZE_VERIFY)
                            .map((d) => (
                              <tr key={d.name} className="border-t border-gray-100 dark:border-gray-700">
                                <td className="px-1.5 py-0.5 font-mono">{d.name}</td>
                                {d.results.map((r) => (
                                  <td
                                    key={r.check}
                                    className={clsx(
                                      'px-1 text-center',
                                      !r.applicable
                                        ? 'text-gray-300 dark:text-gray-600'
                                        : r.hit
                                          ? 'text-green-600'
                                          : 'text-red-500',
                                    )}
                                  >
                                    {!r.applicable ? '—' : r.hit ? '✓' : '✗'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </>
                  ) : (
                    <p className="text-gray-400">{verify.error ?? t('aidc:import.verifyEmpty')}</p>
                  )}
                </div>
              ) : (
                <p className="text-2xs text-gray-400">{t('aidc:import.verifyHint')}</p>
              ))}

            {resultTab === 'topo' &&
              (topo ? (
                <div className="border rounded">
                  <div className="flex items-center gap-1 px-1 py-0.5 border-b bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                    <button
                      type="button"
                      onClick={() => setTopoZoom((z) => Math.min(2, z + 0.25))}
                      title={t('aidc:import.topoZoomIn')}
                      className="px-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-xs"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopoZoom((z) => Math.max(0.5, z - 0.25))}
                      title={t('aidc:import.topoZoomOut')}
                      className="px-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-xs"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopoZoom(1)}
                      title={t('aidc:import.topoZoomReset')}
                      className="px-1.5 rounded text-2xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      {Math.round(topoZoom * 100)}%
                    </button>
                  </div>
                  <div className="overflow-auto max-h-[300px]">
                    <div
                      style={{
                        transform: `scale(${topoZoom})`,
                        transformOrigin: 'top left',
                        width: 1000 * topoZoom,
                        height: 280 * topoZoom,
                      }}
                    >
                      <svg width={1000} height={280}>
                        {topo.edges.map((e, i) => {
                          const a = topo.nodes.find((n) => n.id === e.s)
                          const b = topo.nodes.find((n) => n.id === e.t)
                          if (!a || !b) return null
                          return (
                            <line
                              key={i}
                              x1={a.x + 60}
                              y1={a.y + 10}
                              x2={b.x}
                              y2={b.y + 10}
                              stroke="#94a3b8"
                              strokeWidth={0.4}
                              opacity={0.35}
                            />
                          )
                        })}
                        {topo.nodes.map((n) => (
                          <g key={n.id}>
                            <rect
                              x={n.x}
                              y={n.y}
                              width={116}
                              height={20}
                              rx={3}
                              fill={(PLANE_COLOR[n.plane] ?? '#999') + '33'}
                              stroke={PLANE_COLOR[n.plane] ?? '#999'}
                            />
                            <text x={n.x + 6} y={n.y + 14} fontSize={9} fill="currentColor">
                              {n.id.length > 16 ? n.id.slice(0, 15) + '…' : n.id}
                            </text>
                          </g>
                        ))}
                      </svg>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-2xs text-gray-400">{t('aidc:import.topoHint')}</p>
              ))}

            {resultTab === 'changelog' && (
              <div className="text-2xs space-y-1 max-h-[320px] overflow-auto">
                {summary?.changelog?.length ? (
                  summary.changelog.map((c, i) => (
                    <div key={i} className="border rounded p-2">
                      <p className="text-gray-500">
                        MC v{c.mcPlanVersion}（AL v{c.planVersion ?? '-'}）· {c.at?.slice(0, 19)?.replace('T', ' ')}
                      </p>
                      <p className="mt-0.5">{c.summary || t('aidc:import.noChange')}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400">{t('aidc:import.changelogEmpty')}</p>
                )}
              </div>
            )}
          </div>
        )}

        {msg && (
          <p className={clsx('flex items-center gap-1 text-2xs', msgError ? 'text-red-500' : 'text-gray-500')}>
            {msgError ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
            {msg}
          </p>
        )}
      </div>
    </Modal>
  )
}

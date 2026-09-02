/**
 * 4.6.0-F6-4（46-d）质量仪表盘数据仓库：本地聚合覆盖率/门禁/测试/校验/性能，手动刷新（不遥测）
 *
 * 数据来源（本地，不上传）：
 *  1. reports/quality_report.json —— 最近一次 python scripts/test_report.py 聚合结果（覆盖率+门禁+测试）
 *  2. reports/coverage/backend/coverage.json + frontend/coverage-summary.json —— 报告缺失时的覆盖率兜底
 *  3. validation.store —— 当前校验结果（通过/错误/警告）
 *  4. utils/perf —— 性能基准参考（对齐 scripts/bench_perf.py）
 *
 * 读取走 window.electron.file.read（json 在白名单内）；路径由 app.getPath('backend') 上溯到仓库根。
 * aggregateQualityData() 为纯函数，供 Q-4 单测直接断言。
 */
import { create } from 'zustand'
import { useValidationStore } from '@/stores/validation.store'
import { getBenchmarkReference } from '@/utils/perf'

export interface QualityCoverage {
  lines: number | null
  statements: number | null
  functions: number | null
  branches: number | null
  threshold: number
}

export interface QualityGateResult {
  id: string
  name: string
  status: 'pass' | 'fail' | 'unknown'
  detail?: string
}

export interface QualitySummary {
  status: 'pass' | 'fail'
  modules: number
  passed: number
  failed: number
  totalTests: number
  passedTests: number
}

export interface QualityData {
  reportAvailable: boolean
  coverageBackend: QualityCoverage
  coverageFrontend: QualityCoverage
  gates: QualityGateResult[]
  summary: QualitySummary | null
  validation: { ok: boolean | null; errors: number; warnings: number; lastRunAt: string | null }
  perf: Array<{ id: string; label: string; thresholdMs: number }>
  lastUpdatedAt: string | null
}

interface QualityState {
  data: QualityData
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  setData: (data: QualityData) => void
  /** 仅同步本地校验结果到已有数据（不重新读文件） */
  syncValidation: () => void
  clear: () => void
}

export const DEFAULT_THRESHOLDS = { backend: 55, frontend: 26 }

const REPORT_REL = 'reports/quality_report.json'
const BACKEND_COV_REL = 'reports/coverage/backend/coverage.json'
const FRONTEND_COV_REL = 'reports/coverage/frontend/coverage-summary.json'
const THRESHOLDS_REL = 'tests/coverage_thresholds.json'

function safeParse(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** 通过 window.electron.file.read 读取仓库根相对路径（json 白名单）；无 IPC 时返回 null */
async function readRepoFile(rel: string): Promise<string | null> {
  try {
    const win =
      typeof window !== 'undefined'
        ? (window as unknown as {
            electron?: {
              file?: { read: (p: string) => Promise<string> }
              app?: { getPath: (n: string) => Promise<string> }
            }
          })
        : undefined
    if (!win?.electron?.file?.read || !win?.electron?.app?.getPath) return null
    const backendDir = await win.electron.app.getPath('backend')
    const root = backendDir.replace(/[\\/]backend$/, '') || backendDir
    return await win.electron.file.read(`${root}/${rel}`)
  } catch {
    return null
  }
}

async function readThresholds(): Promise<{ backend: number; frontend: number }> {
  const raw = await readRepoFile(THRESHOLDS_REL)
  const data = safeParse(raw) as { backend?: { fail_under?: number }; frontend?: { fail_under?: number } } | null
  if (data) {
    return {
      backend: typeof data.backend?.fail_under === 'number' ? data.backend.fail_under : DEFAULT_THRESHOLDS.backend,
      frontend: typeof data.frontend?.fail_under === 'number' ? data.frontend.fail_under : DEFAULT_THRESHOLDS.frontend,
    }
  }
  return DEFAULT_THRESHOLDS
}

interface AggregateInput {
  report?: { modules?: unknown[]; summary?: QualitySummary } | null
  backendCov?: { totals?: { percent_covered?: number } } | null
  frontendCov?: { total?: Record<string, { pct?: number }> } | null
  validation: QualityData['validation']
  perf: QualityData['perf']
  backendThreshold: number
  frontendThreshold: number
}

function coverageFromModule(module: unknown, side: 'backend' | 'frontend'): QualityCoverage | null {
  const m = module as { id?: string; coverage?: Record<string, unknown> } | null
  if (!m?.coverage) return null
  const c = m.coverage
  const num = (k: string): number | null => (typeof c[k] === 'number' ? (c[k] as number) : null)
  const threshold =
    typeof c.threshold === 'number'
      ? (c.threshold as number)
      : side === 'backend'
        ? DEFAULT_THRESHOLDS.backend
        : DEFAULT_THRESHOLDS.frontend
  return {
    lines: num('lines'),
    statements: side === 'frontend' ? num('statements') : null,
    functions: side === 'frontend' ? num('functions') : null,
    branches: side === 'frontend' ? num('branches') : null,
    threshold,
  }
}

export function aggregateQualityData(input: AggregateInput): QualityData {
  let coverageBackend: QualityCoverage = {
    lines: null,
    statements: null,
    functions: null,
    branches: null,
    threshold: input.backendThreshold,
  }
  let coverageFrontend: QualityCoverage = {
    lines: null,
    statements: null,
    functions: null,
    branches: null,
    threshold: input.frontendThreshold,
  }
  let gates: QualityGateResult[] = []
  let summary: QualitySummary | null = input.report?.summary ?? null

  if (input.report?.modules) {
    gates = input.report.modules.map((m) => {
      const mod = m as { id?: string; name?: string; status?: string; detail?: string }
      const status = mod.status === 'pass' || mod.status === 'fail' ? mod.status : 'unknown'
      return { id: mod.id ?? '?', name: mod.name ?? mod.id ?? '?', status, detail: mod.detail }
    })
    for (const m of input.report.modules) {
      const mod = m as { id?: string }
      if (mod.id === 'pytest-backend') {
        coverageBackend = coverageFromModule(m, 'backend') ?? coverageBackend
      } else if (mod.id === 'vitest-frontend') {
        coverageFrontend = coverageFromModule(m, 'frontend') ?? coverageFrontend
      }
    }
  } else {
    if (input.backendCov?.totals && typeof input.backendCov.totals.percent_covered === 'number') {
      coverageBackend = { ...coverageBackend, lines: input.backendCov.totals.percent_covered }
    }
    if (input.frontendCov?.total) {
      const pct = (k: string): number | null => {
        const v = input.frontendCov?.total?.[k]
        return typeof v?.pct === 'number' ? v.pct : null
      }
      coverageFrontend = {
        ...coverageFrontend,
        lines: pct('lines'),
        statements: pct('statements'),
        functions: pct('functions'),
        branches: pct('branches'),
      }
    }
  }

  return {
    reportAvailable: !!input.report,
    coverageBackend,
    coverageFrontend,
    gates,
    summary,
    validation: input.validation,
    perf: input.perf,
    lastUpdatedAt: new Date().toISOString(),
  }
}

function emptyData(): QualityData {
  return {
    reportAvailable: false,
    coverageBackend: {
      lines: null,
      statements: null,
      functions: null,
      branches: null,
      threshold: DEFAULT_THRESHOLDS.backend,
    },
    coverageFrontend: {
      lines: null,
      statements: null,
      functions: null,
      branches: null,
      threshold: DEFAULT_THRESHOLDS.frontend,
    },
    gates: [],
    summary: null,
    validation: { ok: null, errors: 0, warnings: 0, lastRunAt: null },
    perf: [],
    lastUpdatedAt: null,
  }
}

function currentValidation(): QualityData['validation'] {
  const v = useValidationStore.getState()
  return {
    ok: v.report?.ok ?? null,
    errors: v.report?.summary.errors ?? 0,
    warnings: v.report?.summary.warnings ?? 0,
    lastRunAt: v.lastRunAt,
  }
}

export const useQualityStore = create<QualityState>((set) => ({
  data: emptyData(),
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const reportRaw = await readRepoFile(REPORT_REL)
      const report = safeParse(reportRaw) as AggregateInput['report']
      let backendCov: AggregateInput['backendCov'] = null
      let frontendCov: AggregateInput['frontendCov'] = null
      if (!report) {
        backendCov = safeParse(await readRepoFile(BACKEND_COV_REL)) as AggregateInput['backendCov']
        frontendCov = safeParse(await readRepoFile(FRONTEND_COV_REL)) as AggregateInput['frontendCov']
      }
      const thresholds = await readThresholds()
      const data = aggregateQualityData({
        report,
        backendCov,
        frontendCov,
        validation: currentValidation(),
        perf: getBenchmarkReference().map((b) => ({ id: b.id, label: b.label, thresholdMs: b.thresholdMs })),
        backendThreshold: thresholds.backend,
        frontendThreshold: thresholds.frontend,
      })
      set({ data, loading: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false })
    }
  },

  setData: (data) => set({ data, loading: false, error: null }),
  syncValidation: () => set((s) => ({ data: { ...s.data, validation: currentValidation() } })),
  clear: () => set({ data: emptyData(), loading: false, error: null }),
}))

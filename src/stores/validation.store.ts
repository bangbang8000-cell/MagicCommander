import { create } from 'zustand'
import { useUIStore } from '@/stores/ui.store'
import { runProjectValidation, type ValidationReport, type ProjectData } from '@/utils/validation'

interface ValidationState {
  report: ValidationReport | null
  running: boolean
  error: string | null
  lastRunAt: string | null
  /** 校验失败时置 true（门禁提示：后续渲染/导出前建议先修复） */
  gateBlocked: boolean
  runValidation: (projectId?: number | null, scope?: string) => Promise<ValidationReport | null>
  setReport: (report: ValidationReport | null) => void
  clear: () => void
}

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

/**
 * 通过既有 IPC 通道采集项目数据（listFiles/readExcel/readFile），
 * 组装为 ProjectData 交给纯函数校验引擎。electron IPC 不可扩展，
 * 故复用现有 project 通道读取原始数据。
 */
async function collectProjectData(projectId: number): Promise<ProjectData | null> {
  const projects = await window.electron.project.list()
  const proj = projects.find((p) => p.id === projectId)
  if (!proj) return null

  const allFiles = await window.electron.project.listFiles(String(projectId))
  const excelFiles = allFiles.filter((f) => /\.(xlsx|xls)$/i.test(f.path))
  const tplFiles = allFiles.filter((f) => /\.(j2|jinja|jinja2)$/i.test(f.path))
  const outputTxts = allFiles.filter((f) => f.path.startsWith('output/') && /\.txt$/i.test(f.path)).slice(0, 50)

  // para.xlsx / project_para
  let paraRows: Array<Record<string, string | number>> = []
  try {
    const paraSheets = await window.electron.project.readExcel(projectId, 'para.xlsx')
    const pp = paraSheets.find((s) => s.name === 'project_para')
    if (pp) paraRows = pp.rows as Array<Record<string, string | number>>
  } catch {
    paraRows = []
  }

  // excel 工作簿各工作表
  const sheets: ProjectData['sheets'] = []
  for (const f of excelFiles) {
    try {
      const data = await window.electron.project.readExcel(projectId, f.path)
      for (const sheet of data) {
        sheets.push({
          file: basename(f.path),
          sheet: sheet.name,
          headers: sheet.headers ?? [],
          rows: (sheet.rows ?? []) as Array<Record<string, unknown>>,
        })
      }
    } catch {
      // 单个工作簿读取失败不阻断整体校验
    }
  }

  // 模板
  const templates: ProjectData['templates'] = []
  for (const f of tplFiles) {
    try {
      const content = await window.electron.project.readFile(projectId, f.path)
      templates.push({ name: basename(f.path), content })
    } catch {
      // 忽略
    }
  }

  // output 产物（数量/命名 + 可选内容引用）
  const outputDevices: ProjectData['outputDevices'] = []
  let outputBatch: string | null = null
  let hasOutput = false
  const roleDirCount = new Map<string, number>()
  for (const f of outputTxts) {
    const parts = f.path.split('/')
    if (parts.length >= 4 && parts[0] === 'output') {
      outputBatch = parts[1]
      hasOutput = true
      roleDirCount.set(parts[2], (roleDirCount.get(parts[2]) ?? 0) + 1)
    }
  }
  for (const f of outputTxts) {
    const parts = f.path.split('/')
    if (parts.length >= 4 && parts[0] === 'output') {
      outputDevices.push({ name: basename(f.path).replace(/\.txt$/, ''), role: parts[2] })
    }
  }

  return {
    project: proj.name,
    paraRows,
    sheets,
    templates,
    outputDevices,
    outputBatch,
    hasOutput,
  }
}

export const useValidationStore = create<ValidationState>((set) => ({
  report: null,
  running: false,
  error: null,
  lastRunAt: null,
  gateBlocked: false,

  runValidation: async (projectId?: number | null, scope = 'all') => {
    const id = projectId ?? useUIStore.getState().activeProjectId
    if (id == null) {
      set({ error: '请先选择一个项目', gateBlocked: false })
      return null
    }
    set({ running: true, error: null })
    try {
      const data = await collectProjectData(id)
      if (!data) {
        set({ error: '未找到该项目', running: false })
        return null
      }
      const report = runProjectValidation(data, scope)
      const now = new Date().toISOString()
      set({
        report,
        running: false,
        lastRunAt: now,
        gateBlocked: !report.ok,
      })
      return report
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set({ error: msg, running: false })
      return null
    }
  },

  setReport: (report) => set({ report, gateBlocked: report ? !report.ok : false }),
  clear: () => set({ report: null, error: null, lastRunAt: null, gateBlocked: false, running: false }),
}))

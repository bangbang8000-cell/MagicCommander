// ============================================================
// 4.5.0（F5-1 ~ F5-3）校验引擎前端 util（与 backend/validation 结构契约对齐）
// 纯函数：输入已解析的项目数据（store 通过 IPC 拉取），输出结构化问题列表
// （severity/类别/定位/建议），供校验面板展示与校验报告导出复用。
// 注意：本文件不触碰 window.electron / fetch / Node API（CI 安全基线约束），
// 数据采集在 validation.store 中完成。
// ============================================================

export type ValidationSeverity = 'error' | 'warning' | 'info'
export type ValidationCategory = 'para' | 'template' | 'output' | 'ip' | 'field' | 'ai'

export interface ValidationIssue {
  severity: ValidationSeverity
  category: ValidationCategory
  location: string
  message: string
  suggestion: string
}

export interface ValidationSummary {
  total: number
  errors: number
  warnings: number
  infos: number
}

export interface ValidationReport {
  ok: boolean
  project: string
  scope: string
  checks: string[]
  summary: ValidationSummary
  issues: ValidationIssue[]
}

/** 项目已解析数据（校验输入） */
export interface ProjectData {
  project: string
  /** para.xlsx / project_para 行（工作簿名称/工作表名称/工作表类型/对称列数/key列数） */
  paraRows: Array<Record<string, string | number>>
  /** 参数表（excel/*.xlsx 的各工作表） */
  sheets: Array<{ file: string; sheet: string; headers: string[]; rows: Array<Record<string, unknown>> }>
  /** 模板（templates/*.j2） */
  templates: Array<{ name: string; content: string }>
  /** 渲染批次产物（output/<时间戳>/<角色>/*.txt） */
  outputDevices: Array<{ name: string; role: string; content?: string }>
  outputBatch: string | null
  hasOutput: boolean
}

export const CATEGORY_LABELS: Record<ValidationCategory, string> = {
  para: '参数表完整性',
  template: '模板与参数一致性',
  output: '导出数据核对',
  ip: 'IP 规划',
  field: '配置字段',
  ai: 'AI 规划器准确性',
}

export const SEVERITY_LABELS: Record<ValidationSeverity, string> = {
  error: '错误',
  warning: '警告',
  info: '信息',
}

const SHEET_TYPES = ['赋值表', '对称表', '参数表']
const PARA_REQUIRED_COLUMNS = ['工作簿名称', '工作表名称', '工作表类型', '对称列数', 'key列数']

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function makeIssue(
  severity: ValidationSeverity,
  category: ValidationCategory,
  location: string,
  message: string,
  suggestion = '',
): ValidationIssue {
  return { severity, category, location, message, suggestion }
}

function newReport(project: string, scope: string, checks: string[]): ValidationReport {
  return { ok: true, project, scope, checks, summary: { total: 0, errors: 0, warnings: 0, infos: 0 }, issues: [] }
}

function addIssue(report: ValidationReport, issue: ValidationIssue): void {
  report.issues.push(issue)
  if (issue.severity === 'error') report.ok = false
}

function finalize(report: ValidationReport): ValidationReport {
  report.summary = {
    total: report.issues.length,
    errors: report.issues.filter((i) => i.severity === 'error').length,
    warnings: report.issues.filter((i) => i.severity === 'warning').length,
    infos: report.issues.filter((i) => i.severity === 'info').length,
  }
  return report
}

export function isIPv4(value: unknown): boolean {
  const s = str(value)
  if (!s) return false
  const parts = s.split('.')
  if (parts.length !== 4) return false
  return parts.every((p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255)
}

export function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, p) => acc * 256 + Number(p), 0)
}

export function cidrToRange(ip: string, prefix: number): [number, number] {
  const ipInt = ipToInt(ip)
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  const network = (ipInt & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  return [network, broadcast]
}

export function subnetsOverlap(aIp: string, aPrefix: number, bIp: string, bPrefix: number): boolean {
  const [aLo, aHi] = cidrToRange(aIp, aPrefix)
  const [bLo, bHi] = cidrToRange(bIp, bPrefix)
  return !(aHi < bLo || bHi < aLo)
}

export function parsePrefix(mask: unknown): number | null {
  const s = str(mask)
  if (!s) return null
  if (/^\d+$/.test(s)) {
    const p = Number(s)
    return p >= 0 && p <= 32 ? p : null
  }
  // 点分掩码 → 前缀
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) {
    const bits = s
      .split('.')
      .map(Number)
      .map((n) => n.toString(2).padStart(8, '0'))
      .join('')
    const firstZero = bits.indexOf('0')
    return firstZero === -1 ? 32 : firstZero
  }
  return null
}

// ── T1 一致性校验（参数表/模板/配置字段） ──────────────────────────

export function validateConsistency(data: ProjectData): ValidationReport {
  const report = newReport(data.project, 'consistency', [
    'para: para.xlsx 与 project_para 完整性',
    'template: 角色→模板映射与模板变量引用',
    'field: 关键字段非空与 IP 格式',
  ])

  // 参数表完整性
  if (data.paraRows.length === 0) {
    addIssue(
      report,
      makeIssue(
        'error',
        'para',
        'para.xlsx/project_para',
        'project_para 工作表为空或不存在',
        '在 para.xlsx 中声明要读取的工作簿/工作表清单',
      ),
    )
  }
  data.paraRows.forEach((row, i) => {
    const loc = `para.xlsx/project_para/第${i + 2}行`
    const missing = PARA_REQUIRED_COLUMNS.filter((c) => !(c in row))
    if (missing.length > 0) {
      addIssue(
        report,
        makeIssue(
          'error',
          'para',
          loc,
          `缺少必填列: ${missing.join(', ')}`,
          '补齐 工作簿名称/工作表名称/工作表类型/对称列数/key列数',
        ),
      )
      return
    }
    const sheetType = str(row['工作表类型'])
    if (sheetType && !SHEET_TYPES.includes(sheetType)) {
      addIssue(
        report,
        makeIssue(
          'error',
          'para',
          loc,
          `工作表类型 '${sheetType}' 非法（应为 ${SHEET_TYPES.join('/')}）`,
          '修正工作表类型为 赋值表/对称表/参数表',
        ),
      )
    }
    const workbook = str(row['工作簿名称'])
    const sheetName = str(row['工作表名称'])
    if (workbook && sheetName) {
      const sheet = data.sheets.find((s) => s.file === workbook && s.sheet === sheetName)
      if (!sheet) {
        addIssue(
          report,
          makeIssue(
            'error',
            'para',
            loc,
            `工作表 '${sheetName}' 在 ${workbook} 中不存在或读取失败`,
            '确认工作表名称与工作簿内 Sheet 一致',
          ),
        )
      } else if (sheet.rows.length === 0) {
        addIssue(report, makeIssue('warning', 'para', loc, `工作表 '${sheetName}' 为空`, '补充数据或删除该行声明'))
      }
    }
  })

  if (!data.sheets.some((s) => s.file.includes('hostname')) && data.paraRows.length > 0) {
    // 不强制；交由角色映射检查兜底
  }

  // 模板一致性：角色映射 + 变量引用
  const roles = new Set<string>()
  const fields = new Set<string>()
  for (const s of data.sheets) {
    if (s.headers.includes('角色')) {
      for (const r of s.rows) {
        const v = str(r['角色'])
        if (v) roles.add(v)
      }
    }
    for (const h of s.headers) fields.add(str(h))
  }
  for (const role of roles) {
    const hasTemplate = data.templates.some((t) => t.name === `${role}.j2`)
    if (!hasTemplate) {
      addIssue(
        report,
        makeIssue(
          'error',
          'template',
          `templates/${role}.j2`,
          `角色 '${role}' 缺少对应模板 ${role}.j2`,
          `创建 templates/${role}.j2，或调整参数表中的 角色 值`,
        ),
      )
    }
  }
  const varRe = /info\s*\[\s*['"]([^'"]+)['"]\s*\]/g
  for (const tpl of data.templates) {
    let m: RegExpExecArray | null
    const missingVars = new Set<string>()
    varRe.lastIndex = 0
    while ((m = varRe.exec(tpl.content)) !== null) {
      if (!fields.has(m[1])) missingVars.add(m[1])
    }
    if (missingVars.size > 0) {
      addIssue(
        report,
        makeIssue(
          'warning',
          'template',
          `templates/${tpl.name}`,
          `模板引用的字段在参数表中不存在: ${[...missingVars].join(', ')}`,
          "在参数表中补充对应列，或修正模板中的 info['字段'] 引用",
        ),
      )
    }
  }

  // 配置字段校验
  const seenDevices = new Set<string>()
  for (const s of data.sheets) {
    s.rows.forEach((r, rIdx) => {
      const loc = `${s.file}/${s.sheet}/第${rIdx + 2}行`
      for (const col of ['设备名', '角色']) {
        if (s.headers.includes(col) && !str(r[col])) {
          addIssue(report, makeIssue('warning', 'field', loc, `关键字段 '${col}' 为空`, `补全 '${col}' 字段`))
        }
      }
      for (const col of ['管理IP', '网关IP']) {
        if (s.headers.includes(col) && str(r[col]) && !isIPv4(r[col])) {
          addIssue(
            report,
            makeIssue(
              'error',
              'field',
              loc,
              `字段 '${col}' 不是合法 IPv4: ${str(r[col])}`,
              '修正为合法 IPv4 地址（如 192.168.1.1）',
            ),
          )
        }
      }
      if (s.headers.includes('设备名')) {
        const name = str(r['设备名'])
        if (name) {
          if (seenDevices.has(name)) {
            addIssue(report, makeIssue('warning', 'field', loc, `设备名重复: ${name}`, '确保设备名全局唯一'))
          }
          seenDevices.add(name)
        }
      }
    })
  }

  return finalize(report)
}

// ── T2 导出数据核对（数量/命名/引用） ─────────────────────────────

export function validateOutput(data: ProjectData): ValidationReport {
  const report = newReport(data.project, 'output', ['output: 数量/命名/引用核对'])
  if (!data.hasOutput) {
    addIssue(
      report,
      makeIssue(
        'warning',
        'output',
        'output/',
        '没有渲染批次（output/ 为空或不存在）',
        '先执行渲染（render project）生成配置产物',
      ),
    )
    return finalize(report)
  }

  const paraNames = new Set<string>()
  const refMap = new Map<string, Set<string>>()
  for (const s of data.sheets) {
    if (s.headers.includes('设备名')) {
      for (const r of s.rows) {
        const v = str(r['设备名'])
        if (v) paraNames.add(v)
      }
    }
    // 「己端设备 → 关联终端/对端」映射（仅核对各设备自身关联引用，避免全量误报）
    if (s.headers.includes('己端设备')) {
      const refCols = s.headers.filter((c) => ['终端名称', '对端设备', '对端接口所属设备'].includes(c))
      if (refCols.length > 0) {
        for (const r of s.rows) {
          const selfDev = str(r['己端设备'])
          if (!selfDev) continue
          for (const col of refCols) {
            const v = str(r[col])
            if (v) {
              if (!refMap.has(selfDev)) refMap.set(selfDev, new Set())
              refMap.get(selfDev)!.add(v)
            }
          }
        }
      }
    }
  }

  const outNames = new Set(data.outputDevices.map((d) => d.name))
  if (paraNames.size === 0) {
    addIssue(
      report,
      makeIssue('warning', 'output', 'output/', '参数表为空，无法核对数量/命名', '补充参数表数据后重新渲染'),
    )
    return finalize(report)
  }

  if (outNames.size !== paraNames.size) {
    addIssue(
      report,
      makeIssue(
        'error',
        'output',
        `output/${data.outputBatch ?? ''}`,
        `产物设备数(${outNames.size})与参数表设备数(${paraNames.size})不一致`,
        '重新渲染或核对参数表/产物是否漂移',
      ),
    )
  }
  const missing = [...paraNames].filter((n) => !outNames.has(n)).sort()
  if (missing.length > 0) {
    addIssue(
      report,
      makeIssue(
        'error',
        'output',
        `output/${data.outputBatch ?? ''}`,
        `产物缺失设备: ${missing.join(', ')}`,
        '重新渲染补齐缺失设备配置',
      ),
    )
  }
  const extra = [...outNames].filter((n) => !paraNames.has(n)).sort()
  if (extra.length > 0) {
    addIssue(
      report,
      makeIssue(
        'warning',
        'output',
        `output/${data.outputBatch ?? ''}`,
        `产物存在参数表外设备: ${extra.join(', ')}`,
        '参数表与渲染输入不一致，请核对',
      ),
    )
  }

  // 引用核对：按「己端设备 → 关联终端/对端」映射，仅核对各设备自身的关联引用
  if (refMap.size > 0 && data.outputDevices.some((d) => d.content !== undefined)) {
    for (const d of data.outputDevices) {
      const expected = refMap.get(d.name)
      if (!expected || expected.size === 0) continue
      const missing = [...expected].filter((ref) => !(d.content ?? '').includes(ref)).sort()
      if (missing.length > 0) {
        addIssue(
          report,
          makeIssue(
            'warning',
            'output',
            `output/${data.outputBatch ?? ''}/${d.role}/${d.name}.txt`,
            `产物未引用其关联终端/对端: ${missing.slice(0, 5).join(', ')}`,
            '核对模板是否遗漏该终端/对端的配置段落',
          ),
        )
      }
    }
  }

  return finalize(report)
}

// ── T3 IP 规划校验（掩码/重复/子网重叠） ──────────────────────────

export function validateIp(data: ProjectData): ValidationReport {
  const report = newReport(data.project, 'ip', ['ip: 掩码合法性/重复分配/子网重叠'])

  const entries: Array<{ location: string; ip: string; prefix: unknown }> = []
  const subnets: Array<{ location: string; network: string; prefix: number | null }> = []
  for (const s of data.sheets) {
    s.rows.forEach((r, rIdx) => {
      const loc = `${s.file}/${s.sheet}/第${rIdx + 2}行`
      let ip: string | null = null
      let prefix: unknown = null
      for (const col of ['网关IP', '管理IP', 'IP', '地址', '起始IP']) {
        if (s.headers.includes(col) && str(r[col])) {
          ip = str(r[col])
          break
        }
      }
      for (const col of ['网关掩码', '掩码', '前缀', '子网掩码']) {
        if (s.headers.includes(col) && str(r[col])) {
          prefix = r[col]
          break
        }
      }
      if (ip && isIPv4(ip)) {
        entries.push({ location: loc, ip, prefix })
      }
      // 网段声明（网段/子网 字段，形如 192.168.1.0/24）
      for (const netCol of ['网段', '子网']) {
        if (!s.headers.includes(netCol)) continue
        const v = str(r[netCol])
        if (!v) continue
        const slash = v.indexOf('/')
        if (slash !== -1) {
          const net = v.slice(0, slash)
          const p = Number(v.slice(slash + 1))
          if (isIPv4(net) && p >= 0 && p <= 32) {
            subnets.push({ location: loc, network: net, prefix: p })
          }
        } else if (isIPv4(v)) {
          subnets.push({ location: loc, network: v, prefix: parsePrefix(prefix) })
        }
      }
    })
  }

  if (entries.length === 0 && subnets.length === 0) {
    addIssue(
      report,
      makeIssue(
        'info',
        'ip',
        '参数表',
        '未发现 IP 规划字段（网关IP/管理IP/IP/掩码），跳过 IP 校验',
        '如需 IP 校验，在参数表中补充 IP 与掩码字段',
      ),
    )
    return finalize(report)
  }

  if (entries.length > 0) {
    const seen = new Map<string, string>()
    for (const e of entries) {
      if (e.prefix !== null && e.prefix !== undefined && parsePrefix(e.prefix) === null) {
        addIssue(
          report,
          makeIssue(
            'error',
            'ip',
            e.location,
            `掩码非法: ${str(e.prefix)}（应为 0-32 前缀或合法点分掩码）`,
            '修正掩码为 0-32 前缀或合法点分掩码',
          ),
        )
      }
      if (seen.has(e.ip)) {
        addIssue(
          report,
          makeIssue(
            'error',
            'ip',
            e.location,
            `IP 重复分配: ${e.ip}（已出现于 ${seen.get(e.ip)}）`,
            '确保 IP 分配唯一',
          ),
        )
      } else {
        seen.set(e.ip, e.location)
      }
    }
  }

  for (let i = 0; i < subnets.length; i++) {
    for (let j = i + 1; j < subnets.length; j++) {
      const a = subnets[i]
      const b = subnets[j]
      if (a.prefix === null || b.prefix === null) continue
      if (subnetsOverlap(a.network, a.prefix, b.network, b.prefix)) {
        addIssue(
          report,
          makeIssue(
            'error',
            'ip',
            `${a.location} ↔ ${b.location}`,
            `子网重叠: ${a.network}/${a.prefix} 与 ${b.network}/${b.prefix}`,
            '调整网段划分，避免地址空间重叠',
          ),
        )
      }
    }
  }

  return finalize(report)
}

// ── 统一入口 ─────────────────────────────────────────────────────

export function runProjectValidation(data: ProjectData, scope: string = 'all'): ValidationReport {
  if (scope === 'consistency') return validateConsistency(data)
  if (scope === 'output') return validateOutput(data)
  if (scope === 'ip') return validateIp(data)

  const report = newReport(data.project, 'all', [])
  for (const fn of [validateConsistency, validateOutput, validateIp]) {
    const sub = fn(data)
    report.checks.push(...sub.checks)
    for (const issue of sub.issues) addIssue(report, issue)
  }
  return finalize(report)
}

/** 校验报告 JSON 序列化（导出用，缩进美化） */
export function reportToJson(report: ValidationReport): string {
  return JSON.stringify(report, null, 2)
}

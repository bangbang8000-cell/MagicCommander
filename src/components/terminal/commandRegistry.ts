import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import i18n from '@/i18n'

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

export type TerminalOutputKind = 'text' | 'command' | 'help' | 'banner'

export interface CommandContext {
  addLog: (level: LogLevel, msg: string, kind?: TerminalOutputKind) => void
  toggleDark: () => void
  setTheme: (theme: 'light' | 'dark') => void
  clearTerminal: () => void
  selectProject: (name: string) => void
}

interface CommandEntry {
  desc: string | (() => string)
  fn: (args: string[], ctx: CommandContext) => Promise<void> | void
}

function tt(key: string, options?: Record<string, unknown>): string {
  const normalizedKey = key.startsWith('terminal:') ? key : `terminal:${key.replace(/^terminal\./, '')}`
  return i18n.t(normalizedKey, options)
}

function tLines(key: string): string[] {
  const value = i18n.t(key, { returnObjects: true })
  return Array.isArray(value) ? value.map(String) : String(value).split('\n')
}

function printLines(ctx: CommandContext, lines: string[]) {
  lines.forEach((line) => ctx.addLog('info', line, 'help'))
}

export function terminalHelpLines(): string[] {
  return tLines('terminal:help.terminal')
}

export function cliHelpLines(): string[] {
  return tLines('terminal:help.cli')
}

function parseFormatOption(args: string[]): { args: string[]; format: 'device_name' | 'device_sn' } {
  const nextArgs: string[] = []
  let format: 'device_name' | 'device_sn' = 'device_name'

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--format' || arg === '-f') {
      const value = args[i + 1]
      if (value === 'device_name' || value === 'device_sn') {
        format = value
        i += 1
      }
      continue
    }
    nextArgs.push(arg)
  }

  return { args: nextArgs, format }
}

function resolveIds(args: string[]): string[] {
  if (args.length > 0) {
    return args
      .join(',')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  }
  const selected = useProjectStore.getState().selectedProject
  if (selected) return [String(selected.id)]
  return []
}

async function resolveProjectId(nameOrId: string): Promise<number | null> {
  const stored = useProjectStore.getState().projects
  const found = stored.find(
    (p) => p.name === nameOrId || String(p.id) === nameOrId,
  )
  if (found) return found.id
  if (window.electron?.project) {
    const raw = await window.electron.project.list()
    const projects = Array.isArray(raw) ? raw : []
    const match = projects.find(
      (p: any) => String(p.name ?? '') === nameOrId || String(p.id ?? '') === nameOrId,
    )
    if (match) return (match as any).id ?? 0
  }
  return null
}

export const commands: { [name: string]: CommandEntry } = {
  // ── 帮助 ──
  help: {
    desc: () => tt('terminal.commands.help.desc'),
    fn: (args, ctx) => {
      const topic = (args[0] ?? '').toLowerCase()
      printLines(ctx, topic === 'cli' || topic === 'cmd' || topic === 'command' ? cliHelpLines() : terminalHelpLines())
    },
  },
  '?': {
    desc: () => tt('terminal.commands.question.desc'),
    fn: (args, ctx) => commands.help.fn(args, ctx),
  },

  // ── 版本 ──
  version: {
    desc: () => tt('terminal.commands.version.desc'),
    fn: (_, ctx) => {
      ctx.addLog('success', 'MagicCommander v3.5.0')
    },
  },
  ver: {
    desc: () => tt('terminal.commands.ver.desc'),
    fn: (args, ctx) => commands.version.fn(args, ctx),
  },

  // ── 项目管理 ──
  list: {
    desc: () => tt('terminal.commands.list.desc'),
    fn: async (args, ctx) => {
      if (args.length === 0 || args[0] === 'projects') {
        const stored = useProjectStore.getState().projects
        if (stored && stored.length > 0) {
          ctx.addLog('info', `项目列表 (${stored.length}):`)
          stored.forEach((p) => ctx.addLog('info', `  #${p.id}  ${p.name}`))
          return
        }
        if (!window.electron?.project) {
          ctx.addLog('error', '需要 Electron 环境')
          return
        }
        const raw = await window.electron.project.list()
        const projects = Array.isArray(raw) ? raw : []
        if (projects.length === 0) {
          ctx.addLog('warn', '没有项目')
          return
        }
        ctx.addLog('info', `项目列表 (${projects.length}):`)
        projects.forEach((p: any) => ctx.addLog('info', `  #${p.id ?? '?'}  ${String(p.name ?? '')}`))
      } else if (args[0] === 'examples') {
        if (!window.electron?.project) { ctx.addLog('error', '需要 Electron 环境'); return }
        const examples = await window.electron.project.listExamples()
        ctx.addLog('info', `示例模板 (${examples.length}):`)
        examples.forEach((e: string) => ctx.addLog('info', `  - ${e}`))
      } else if (args[0] === 'templates') {
        if (!window.electron?.project) { ctx.addLog('error', '需要 Electron 环境'); return }
        const templates = await window.electron.project.listTemplates()
        ctx.addLog('info', `模板 (${templates.length}):`)
        templates.forEach((t: any) => ctx.addLog('info', `  - ${t.name ?? t.id}`))
      } else {
        ctx.addLog('error', `未知参数: ${args.join(' ')}。可用: projects, examples, templates`)
      }
    },
  },
  ls: {
    desc: () => tt('terminal.commands.ls.desc'),
    fn: (args, ctx) => commands.list.fn(args.length === 0 ? ['projects'] : args, ctx),
  },

  create: {
    desc: () => '创建新项目: create <name> [--empty] [--template <name>]',
    fn: async (args, ctx) => {
      if (!window.electron?.project) { ctx.addLog('error', '需要 Electron 环境'); return }
      if (args.length === 0) { ctx.addLog('error', '用法: create <项目名> [--empty] [--template <模板名>]'); return }
      const name = args[0]
      const options: { template?: string; empty?: boolean } = {}
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--empty') options.empty = true
        if (args[i] === '--template' && args[i + 1]) options.template = args[++i]
      }
      try {
        await window.electron.project.create(name, options)
        ctx.addLog('success', `项目 "${name}" 创建成功`)
      } catch (err) {
        ctx.addLog('error', `创建失败: ${(err as Error).message}`)
      }
    },
  },

  select: {
    desc: () => '选择项目: select <名称或ID>',
    fn: async (args, ctx) => {
      if (args.length === 0) { ctx.addLog('error', '用法: select <项目名或ID>'); return }
      const target = args.join(' ')
      let project = useProjectStore.getState().projects.find((p) => p.name === target)
      if (!project && window.electron?.project) {
        const raw = await window.electron.project.list()
        const projects = Array.isArray(raw) ? raw : []
        const found: any = projects.find((p: any) => String(p.name ?? '') === target || String(p.id ?? '') === target)
        if (found) project = { id: found.id ?? 0, name: String(found.name ?? ''), index: found.index ?? 0 }
      }
      if (!project) { ctx.addLog('error', `项目 "${target}" 不存在`); return }
      ctx.selectProject(project.name)
      ctx.addLog('success', `已选择: ${project.name}`)
    },
  },

  delete: {
    desc: () => '删除项目或文件: delete project <id> | delete output|yaml|output-sn|yaml-sn [ids]',
    fn: async (args, ctx) => {
      if (!window.electron) { ctx.addLog('error', '需要 Electron 环境'); return }
      if (args.length === 0) { ctx.addLog('error', '用法: delete project <id> | delete <output|yaml|output-sn|yaml-sn> [ids]'); return }
      const sub = args[0]
      try {
        if (sub === 'project') {
          const id = args[1]
          if (!id) { ctx.addLog('error', '用法: delete project <id>'); return }
          await window.electron.project.delete([id])
          ctx.addLog('success', `项目 #${id} 已删除`)
        } else if (sub === 'output') {
          const ids = resolveIds(args.slice(1))
          if (ids.length === 0) { ctx.addLog('error', '请指定项目ID'); return }
          await window.electron.delete.output(ids)
          ctx.addLog('success', `已删除输出文件 (${ids.join(',')})`)
        } else if (sub === 'output-sn') {
          const ids = resolveIds(args.slice(1))
          if (ids.length === 0) { ctx.addLog('error', '请指定项目ID'); return }
          await window.electron.delete.outputSn(ids)
          ctx.addLog('success', `已删除SN输出 (${ids.join(',')})`)
        } else if (sub === 'yaml') {
          const ids = resolveIds(args.slice(1))
          if (ids.length === 0) { ctx.addLog('error', '请指定项目ID'); return }
          await window.electron.delete.yaml(ids)
          ctx.addLog('success', `已删除YAML (${ids.join(',')})`)
        } else if (sub === 'yaml-sn') {
          const ids = resolveIds(args.slice(1))
          if (ids.length === 0) { ctx.addLog('error', '请指定项目ID'); return }
          await window.electron.delete.yamlSn(ids)
          ctx.addLog('success', `已删除YAML-SN (${ids.join(',')})`)
        } else if (sub === 'labels') {
          const ids = resolveIds(args.slice(1))
          if (ids.length === 0) { ctx.addLog('error', '请指定项目ID'); return }
          await window.electron.feature.labelDelete(ids)
          ctx.addLog('success', `已删除标签 (${ids.join(',')})`)
        } else if (sub === 'template') {
          const name = args[1]
          if (!name) { ctx.addLog('error', '用法: delete template <名称>'); return }
          await window.electron.project.deleteTemplate(name)
          ctx.addLog('success', `模板 "${name}" 已删除`)
        } else {
          ctx.addLog('error', `未知删除类型: ${sub}。可用: project, output, output-sn, yaml, yaml-sn, labels, template`)
        }
      } catch (err) {
        ctx.addLog('error', `删除失败: ${(err as Error).message}`)
      }
    },
  },
  rm: {
    desc: () => 'delete 别名',
    fn: (args, ctx) => commands.delete.fn(args, ctx),
  },

  info: {
    desc: () => '项目信息: info <名称或ID>',
    fn: async (args, ctx) => {
      if (!window.electron?.project) { ctx.addLog('error', '需要 Electron 环境'); return }
      const target = args[0]
      if (!target) { ctx.addLog('error', '用法: info <项目名或ID>'); return }
      try {
        const id = await resolveProjectId(target)
        if (id === null) { ctx.addLog('error', `项目 "${target}" 不存在`); return }
        const structure = await window.electron.project.getStructure(String(id))
        ctx.addLog('info', `项目: ${target}`)
        ctx.addLog('info', `  ID: ${id}`)
        if (structure) {
          ctx.addLog('info', `  结构: ${JSON.stringify(structure).slice(0, 200)}`)
        }
      } catch (err) {
        ctx.addLog('error', `获取信息失败: ${(err as Error).message}`)
      }
    },
  },

  // ── 模板管理 ──
  template: {
    desc: () => '模板管理: template list|save|delete',
    fn: async (args, ctx) => {
      if (!window.electron?.project) { ctx.addLog('error', '需要 Electron 环境'); return }
      if (args.length === 0) { ctx.addLog('error', '用法: template list|save <项目名> <模板名>|delete <模板名>'); return }
      const sub = args[0]
      try {
        if (sub === 'list') {
          const templates = await window.electron.project.listTemplates()
          ctx.addLog('info', `模板 (${templates.length}):`)
          templates.forEach((t: any) => ctx.addLog('info', `  - ${t.name ?? t.id}`))
        } else if (sub === 'save') {
          const projectName = args[1]
          const templateName = args[2]
          if (!projectName || !templateName) { ctx.addLog('error', '用法: template save <项目名> <模板名>'); return }
          await window.electron.project.saveAsTemplate(projectName, templateName, { name: templateName })
          ctx.addLog('success', `项目 "${projectName}" 已保存为模板 "${templateName}"`)
        } else if (sub === 'delete') {
          const name = args[1]
          if (!name) { ctx.addLog('error', '用法: template delete <模板名>'); return }
          await window.electron.project.deleteTemplate(name)
          ctx.addLog('success', `模板 "${name}" 已删除`)
        } else {
          ctx.addLog('error', `未知子命令: ${sub}。可用: list, save, delete`)
        }
      } catch (err) {
        ctx.addLog('error', `操作失败: ${(err as Error).message}`)
      }
    },
  },

  // ── 渲染 ──
  render: {
    desc: () => '渲染配置: render project|yaml|dry-run|undo [ids] [--format device_sn]',
    fn: async (args, ctx) => {
      if (!window.electron?.render) { ctx.addLog('error', '需要 Electron 环境'); return }
      const parsed = parseFormatOption(args)
      const sub = parsed.args[0] ?? 'project'
      const ids = resolveIds(parsed.args.slice(1))
      if (ids.length === 0) { ctx.addLog('error', '请指定项目ID，或先用 select 选择项目'); return }
      try {
        if (sub === 'project' || sub === 'projects') {
          if (parsed.format === 'device_sn') {
            await window.electron.render.projectSn(ids)
          } else {
            await window.electron.render.project(ids)
          }
          ctx.addLog('success', `渲染完成: ${ids.join(', ')}${parsed.format === 'device_sn' ? ' (SN模式)' : ''}`)
        } else if (sub === 'yaml') {
          if (parsed.format === 'device_sn') {
            await window.electron.render.yamlSn(ids)
          } else {
            await window.electron.render.yaml(ids)
          }
          ctx.addLog('success', `YAML渲染完成: ${ids.join(', ')}`)
        } else if (sub === 'dry-run') {
          const result = await window.electron.render.dryRun(ids, parsed.format)
          ctx.addLog('info', `预览结果: ${JSON.stringify(result).slice(0, 300)}`)
        } else if (sub === 'undo') {
          await window.electron.render.undo(ids)
          ctx.addLog('success', `已撤销渲染: ${ids.join(', ')}`)
        } else {
          ctx.addLog('error', `未知子命令: ${sub}。可用: project, yaml, dry-run, undo`)
        }
      } catch (err) {
        ctx.addLog('error', `渲染失败: ${(err as Error).message}`)
      }
    },
  },

  // ── 标签 ──
  label: {
    desc: () => '标签操作: label print|md|pdf|delete [ids]',
    fn: async (args, ctx) => {
      if (!window.electron?.feature) { ctx.addLog('error', '需要 Electron 环境'); return }
      if (args.length === 0) { ctx.addLog('error', '用法: label print|md|pdf|delete [ids]'); return }
      const sub = args[0].toLowerCase()
      const ids = resolveIds(args.slice(1))
      if (ids.length === 0 && sub !== 'delete') { ctx.addLog('error', '请指定项目ID，或先用 select 选择项目'); return }
      try {
        if (sub === 'print' || sub === 'word') {
          await window.electron.feature.labelPrint(ids)
          ctx.addLog('success', `标签打印已提交: ${ids.join(', ')}`)
        } else if (sub === 'md' || sub === 'markdown') {
          await window.electron.feature.labelMarkdown(ids)
          ctx.addLog('success', `Markdown标签已生成: ${ids.join(', ')}`)
        } else if (sub === 'pdf') {
          await window.electron.feature.labelPdf(ids)
          ctx.addLog('success', `PDF标签已生成: ${ids.join(', ')}`)
        } else if (sub === 'delete') {
          const delIds = ids.length > 0 ? ids : resolveIds([])
          await window.electron.feature.labelDelete(delIds)
          ctx.addLog('success', `标签已删除: ${delIds.join(', ')}`)
        } else {
          ctx.addLog('error', `未知子命令: ${sub}。可用: print, md, pdf, delete`)
        }
      } catch (err) {
        ctx.addLog('error', `操作失败: ${(err as Error).message}`)
      }
    },
  },

  // ── 校验 ──
  validate: {
    desc: () => '校验: validate template|excel [ids]',
    fn: async (args, ctx) => {
      if (!window.electron?.render) { ctx.addLog('error', '需要 Electron 环境'); return }
      if (args.length === 0) { ctx.addLog('error', '用法: validate template|excel <ids>'); return }
      const sub = args[0]
      const ids = resolveIds(args.slice(1))
      if (ids.length === 0) { ctx.addLog('error', '请指定项目ID'); return }
      try {
        if (sub === 'template') {
          const result = await window.electron.render.validateTemplate(ids)
          ctx.addLog('success', `模板校验完成: ${JSON.stringify(result).slice(0, 200)}`)
        } else if (sub === 'excel') {
          const result = await window.electron.render.validateExcel(ids)
          ctx.addLog('success', `Excel校验完成: ${JSON.stringify(result).slice(0, 200)}`)
        } else {
          ctx.addLog('error', `未知子命令: ${sub}。可用: template, excel`)
        }
      } catch (err) {
        ctx.addLog('error', `校验失败: ${(err as Error).message}`)
      }
    },
  },

  // ── 文件操作 ──
  read: {
    desc: () => '读取文件: read <项目名> <文件路径>',
    fn: async (args, ctx) => {
      if (!window.electron?.project) { ctx.addLog('error', '需要 Electron 环境'); return }
      if (args.length < 2) { ctx.addLog('error', '用法: read <项目名或ID> <文件相对路径>'); return }
      try {
        const id = await resolveProjectId(args[0])
        if (id === null) { ctx.addLog('error', `项目 "${args[0]}" 不存在`); return }
        const content = await window.electron.project.readFile(id, args[1])
        ctx.addLog('info', content.slice(0, 1000))
      } catch (err) {
        ctx.addLog('error', `读取失败: ${(err as Error).message}`)
      }
    },
  },
  cat: {
    desc: () => 'read 别名',
    fn: (args, ctx) => commands.read.fn(args, ctx),
  },

  // ── 主题 ──
  theme: {
    desc: () => '切换主题: theme [light|dark]',
    fn: (args, ctx) => {
      if (args.length === 0) {
        ctx.toggleDark()
        const next = useUIStore.getState().isDark ? 'dark' : 'light'
        ctx.addLog('success', `主题切换为: ${next}`)
        return
      }
      const value = args[0].toLowerCase()
      if (value === 'light' || value === 'dark') {
        ctx.setTheme(value)
        ctx.addLog('success', `主题设置为: ${value}`)
      } else {
        ctx.addLog('error', `未知主题: ${args[0]}`)
      }
    },
  },

  // ── 清屏/杂项 ──
  clear: {
    desc: () => '清屏',
    fn: (_, ctx) => ctx.clearTerminal(),
  },
  cls: {
    desc: () => '清屏 (别名)',
    fn: (_, ctx) => ctx.clearTerminal(),
  },
  echo: {
    desc: () => '输出文本',
    fn: (args, ctx) => ctx.addLog('info', args.join(' ')),
  },
}

function findCommand(rawName: string): { name: string; entry: CommandEntry } | null {
  if (!rawName) return null
  const name = rawName.toLowerCase()
  if (commands[name]) return { name, entry: commands[name] }
  return null
}

export function parseInput(input: string): { cmd: string; args: string[] } {
  const trimmed = input.trim()
  if (!trimmed) return { cmd: '', args: [] }
  const parts = trimmed.split(/\s+/)
  return { cmd: parts[0], args: parts.slice(1) }
}

export async function executeCommand(input: string, ctx: CommandContext): Promise<void> {
  const { cmd, args } = parseInput(input)
  if (!cmd) return
  const found = findCommand(cmd)
  if (!found) {
    ctx.addLog('error', `未知命令: ${cmd}。输入 help 查看可用命令。`)
    return
  }
  await Promise.resolve(found.entry.fn(args, ctx))
}

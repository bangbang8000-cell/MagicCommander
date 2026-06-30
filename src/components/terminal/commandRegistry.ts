import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

export interface CommandContext {
  addLog: (level: LogLevel, msg: string) => void
  toggleDark: () => void
  setTheme: (theme: 'light' | 'dark') => void
  clearTerminal: () => void
  selectProject: (name: string) => void
}

interface CommandEntry {
  desc: string
  fn: (args: string[], ctx: CommandContext) => Promise<void> | void
}

export const commands: { [name: string]: CommandEntry } = {
  help: {
    desc: '列出所有支持的命令',
    fn: (_, ctx) => {
      const lines = Object.entries(commands).map(([name, entry]) => `  ${name.padEnd(16)} ${entry.desc}`)
      ctx.addLog('info', '支持的命令:')
      lines.forEach((l) => ctx.addLog('info', l))
    },
  },
  '?': {
    desc: '列出所有支持的命令（别名）',
    fn: (args, ctx) => commands.help.fn(args, ctx),
  },
  version: {
    desc: '显示当前应用版本',
    fn: (_, ctx) => ctx.addLog('success', 'MagicCommander v2.1.0'),
  },
  ver: {
    desc: '显示当前应用版本（别名）',
    fn: (args, ctx) => commands.version.fn(args, ctx),
  },
  list: {
    desc: '列出项目（list projects 或 ls）',
    fn: async (args, ctx) => {
      if (args.length === 0 || args[0] === 'projects' || args[0] === '-a') {
        const stored = useProjectStore.getState().projects
        if (stored && stored.length > 0) {
          ctx.addLog('info', `项目列表（缓存，共 ${stored.length} 个）:`)
          stored.forEach((p) => ctx.addLog('info', `  #${p.id} ${p.name}`))
          return
        }
        if (!window.electron || !window.electron.project) {
          ctx.addLog('error', '请在 Electron 桌面应用中运行此功能')
          return
        }
        const raw = await window.electron.project.list()
        const projects = Array.isArray(raw) ? raw : []
        if (projects.length === 0) {
          ctx.addLog('warn', '暂无项目')
          return
        }
        ctx.addLog('info', `项目列表（共 ${projects.length} 个）:`)
        projects.forEach((p: any) => {
          ctx.addLog('info', `  #${p.id ?? '?'} ${String(p.name ?? '')}`)
        })
      } else {
        ctx.addLog('error', `未知参数: ${args.join(' ')}`)
      }
    },
  },
  ls: {
    desc: '列出项目（list projects 的别名）',
    fn: (_, ctx) => commands.list.fn(['projects'], ctx),
  },
  select: {
    desc: '选择项目，用法: select <项目名>',
    fn: async (args, ctx) => {
      if (args.length === 0) {
        ctx.addLog('error', '用法: select <项目名>')
        return
      }
      const target = args.join(' ')
      let project = useProjectStore.getState().projects.find((p) => p.name === target)
      if (!project && window.electron?.project) {
        const raw = await window.electron.project.list()
        const projects = Array.isArray(raw) ? raw : []
        const found: any = projects.find((p: any) => String(p.name ?? '') === target || String(p.id ?? '') === target)
        if (found) {
          project = { id: found.id ?? 0, name: String(found.name ?? ''), index: found.index ?? 0 }
        }
      }
      if (!project) {
        ctx.addLog('error', `未找到项目: ${target}`)
        return
      }
      ctx.selectProject(project.name)
      ctx.addLog('success', `已选择项目: ${project.name}`)
    },
  },
  render: {
    desc: '渲染项目，用法: render [project|yaml] [项目名或id]',
    fn: async (args, ctx) => {
      if (!window.electron || !window.electron.render) {
        ctx.addLog('error', '请在 Electron 桌面应用中运行此功能')
        return
      }
      const sub = args[0] ?? 'project'
      const target = args.slice(1).join(' ')
      let ids: string[] = []
      if (target) {
        ids = [target]
      } else {
        const selected = useProjectStore.getState().selectedProject
        if (selected) {
          ids = [String(selected.id)]
        }
      }
      if (ids.length === 0) {
        ctx.addLog('error', '未指定项目，请使用: render project <项目名或id>')
        return
      }
      try {
        if (sub === 'yaml') {
          await window.electron.render.yaml(ids)
          ctx.addLog('success', `YAML 渲染完成: ${ids.join(', ')}`)
        } else if (sub === 'project' || sub === 'projects') {
          await window.electron.render.project(ids)
          ctx.addLog('success', `项目渲染完成: ${ids.join(', ')}`)
        } else {
          ctx.addLog('error', `未知子命令: ${sub}`)
        }
      } catch (err) {
        ctx.addLog('error', `渲染失败: ${(err as Error).message}`)
      }
    },
  },
  label: {
    desc: '打印标签，用法: label <项目名或id>',
    fn: async (args, ctx) => {
      if (!window.electron || !window.electron.feature) {
        ctx.addLog('error', '请在 Electron 桌面应用中运行此功能')
        return
      }
      if (args.length === 0) {
        const selected = useProjectStore.getState().selectedProject
        if (!selected) {
          ctx.addLog('error', '未选中项目，用法: label <项目名或id>')
          return
        }
        args.push(String(selected.id))
      }
      try {
        await window.electron.feature.labelPrint(args)
        ctx.addLog('success', `标签打印任务已提交: ${args.join(', ')}`)
      } catch (err) {
        ctx.addLog('error', `标签打印失败: ${(err as Error).message}`)
      }
    },
  },
  theme: {
    desc: '切换/设置主题，用法: theme [light|dark]',
    fn: (args, ctx) => {
      if (args.length === 0) {
        ctx.toggleDark()
        const next = useUIStore.getState().isDark ? 'dark' : 'light'
        ctx.addLog('success', `主题已切换为: ${next}`)
        return
      }
      const value = args[0].toLowerCase()
      if (value === 'light' || value === 'dark') {
        ctx.setTheme(value)
        ctx.addLog('success', `主题已设置为: ${value}`)
      } else {
        ctx.addLog('error', `未知主题: ${args[0]}，可用: light / dark`)
      }
    },
  },
  clear: {
    desc: '清空终端历史',
    fn: (_, ctx) => ctx.clearTerminal(),
  },
  cls: {
    desc: '清空终端历史（别名）',
    fn: (_, ctx) => ctx.clearTerminal(),
  },
  echo: {
    desc: '回显文本，用法: echo <text>',
    fn: (args, ctx) => {
      ctx.addLog('info', args.join(' '))
    },
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

export async function executeCommand(
  input: string,
  ctx: CommandContext,
): Promise<void> {
  const { cmd, args } = parseInput(input)
  if (!cmd) return
  const found = findCommand(cmd)
  if (!found) {
    ctx.addLog('error', `未知命令: ${cmd}`)
    return
  }
  await Promise.resolve(found.entry.fn(args, ctx))
}

import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import i18n from '@/i18n'

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

export interface CommandContext {
  addLog: (level: LogLevel, msg: string) => void
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
  lines.forEach((line) => ctx.addLog('info', line))
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

export const commands: { [name: string]: CommandEntry } = {
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
  version: {
    desc: () => tt('terminal.commands.version.desc'),
    fn: (_, ctx) => ctx.addLog('success', 'MagicCommander v2.1.0'),
  },
  ver: {
    desc: () => tt('terminal.commands.ver.desc'),
    fn: (args, ctx) => commands.version.fn(args, ctx),
  },
  list: {
    desc: () => tt('terminal.commands.list.desc'),
    fn: async (args, ctx) => {
      if (args.length === 0 || args[0] === 'projects' || args[0] === '-a') {
        const stored = useProjectStore.getState().projects
        if (stored && stored.length > 0) {
          ctx.addLog('info', tt('terminal.commands.list.projectsFromCache', { count: stored.length }))
          stored.forEach((p) => ctx.addLog('info', `  #${p.id} ${p.name}`))
          return
        }
        if (!window.electron || !window.electron.project) {
          ctx.addLog('error', tt('terminal.electronRequired'))
          return
        }
        const raw = await window.electron.project.list()
        const projects = Array.isArray(raw) ? raw : []
        if (projects.length === 0) {
          ctx.addLog('warn', tt('terminal.commands.list.noProjects'))
          return
        }
        ctx.addLog('info', tt('terminal.commands.list.projectsFromServer', { count: projects.length }))
        projects.forEach((p: any) => {
          ctx.addLog('info', `  #${p.id ?? '?'} ${String(p.name ?? '')}`)
        })
      } else {
        ctx.addLog('error', tt('terminal.commands.list.unknownParam', { param: args.join(' ') }))
      }
    },
  },
  ls: {
    desc: () => tt('terminal.commands.ls.desc'),
    fn: (_, ctx) => commands.list.fn(['projects'], ctx),
  },
  select: {
    desc: () => tt('terminal.commands.select.desc'),
    fn: async (args, ctx) => {
      if (args.length === 0) {
        ctx.addLog('error', tt('terminal.commands.select.usage'))
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
        ctx.addLog('error', tt('terminal.commands.select.notFound', { name: target }))
        return
      }
      ctx.selectProject(project.name)
      ctx.addLog('success', tt('terminal.commands.select.selected', { name: project.name }))
    },
  },
  render: {
    desc: () => tt('terminal.commands.render.desc'),
    fn: async (args, ctx) => {
      if (!window.electron || !window.electron.render) {
        ctx.addLog('error', tt('terminal.electronRequired'))
        return
      }

      const parsed = parseFormatOption(args)
      const sub = parsed.args[0] ?? 'project'
      const target = parsed.args.slice(1).join(' ')
      let ids: string[] = []
      if (target) {
        ids = target.split(',').map((id) => id.trim()).filter(Boolean)
      } else {
        const selected = useProjectStore.getState().selectedProject
        if (selected) {
          ids = [String(selected.id)]
        }
      }
      if (ids.length === 0) {
        ctx.addLog('error', tt('terminal.commands.render.noProject'))
        return
      }
      try {
        if (sub === 'yaml') {
          if (parsed.format === 'device_sn') {
            await window.electron.render.yamlSn(ids)
          } else {
            await window.electron.render.yaml(ids)
          }
          ctx.addLog('success', tt('terminal.commands.render.yamlDone', { ids: ids.join(', ') }))
        } else if (sub === 'project' || sub === 'projects') {
          if (parsed.format === 'device_sn') {
            await window.electron.render.projectSn(ids)
          } else {
            await window.electron.render.project(ids)
          }
          ctx.addLog('success', tt('terminal.commands.render.projectDone', { ids: ids.join(', ') }))
        } else {
          ctx.addLog('error', tt('terminal.commands.render.unknownSub', { sub }))
        }
      } catch (err) {
        ctx.addLog('error', tt('terminal.commands.render.failed', { error: (err as Error).message }))
      }
    },
  },
  label: {
    desc: () => tt('terminal.commands.label.desc'),
    fn: async (args, ctx) => {
      if (!window.electron || !window.electron.feature) {
        ctx.addLog('error', tt('terminal.electronRequired'))
        return
      }
      if (args.length === 0) {
        const selected = useProjectStore.getState().selectedProject
        if (!selected) {
          ctx.addLog('error', tt('terminal.commands.label.noProject'))
          return
        }
        args.push(String(selected.id))
      }
      try {
        await window.electron.feature.labelPrint(args)
        ctx.addLog('success', tt('terminal.commands.label.submitted', { ids: args.join(', ') }))
      } catch (err) {
        ctx.addLog('error', tt('terminal.commands.label.failed', { error: (err as Error).message }))
      }
    },
  },
  theme: {
    desc: () => tt('terminal.commands.theme.desc'),
    fn: (args, ctx) => {
      if (args.length === 0) {
        ctx.toggleDark()
        const next = useUIStore.getState().isDark ? 'dark' : 'light'
        ctx.addLog('success', tt('terminal.commands.theme.toggled', { theme: next }))
        return
      }
      const value = args[0].toLowerCase()
      if (value === 'light' || value === 'dark') {
        ctx.setTheme(value)
        ctx.addLog('success', tt('terminal.commands.theme.set', { theme: value }))
      } else {
        ctx.addLog('error', tt('terminal.commands.theme.unknown', { theme: args[0] }))
      }
    },
  },
  clear: {
    desc: () => tt('terminal.commands.clear.desc'),
    fn: (_, ctx) => ctx.clearTerminal(),
  },
  cls: {
    desc: () => tt('terminal.commands.cls.desc'),
    fn: (_, ctx) => ctx.clearTerminal(),
  },
  echo: {
    desc: () => tt('terminal.commands.echo.desc'),
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
    ctx.addLog('error', tt('terminal.commands.unknown', { cmd }))
    return
  }
  await Promise.resolve(found.entry.fn(args, ctx))
}

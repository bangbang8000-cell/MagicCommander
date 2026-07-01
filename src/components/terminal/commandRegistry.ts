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
  desc: string
  fn: (args: string[], ctx: CommandContext) => Promise<void> | void
}

export const commands: { [name: string]: CommandEntry } = {
  help: {
    desc: i18n.t('terminal.commands.help.desc'),
    fn: (_, ctx) => {
      const lines = Object.entries(commands).map(([name, entry]) => `  ${name.padEnd(16)} ${entry.desc}`)
      ctx.addLog('info', i18n.t('terminal.commands.help.output'))
      lines.forEach((l) => ctx.addLog('info', l))
    },
  },
  '?': {
    desc: i18n.t('terminal.commands.question.desc'),
    fn: (args, ctx) => commands.help.fn(args, ctx),
  },
  version: {
    desc: i18n.t('terminal.commands.version.desc'),
    fn: (_, ctx) => ctx.addLog('success', 'MagicCommander v2.1.0'),
  },
  ver: {
    desc: i18n.t('terminal.commands.ver.desc'),
    fn: (args, ctx) => commands.version.fn(args, ctx),
  },
  list: {
    desc: i18n.t('terminal.commands.list.desc'),
    fn: async (args, ctx) => {
      if (args.length === 0 || args[0] === 'projects' || args[0] === '-a') {
        const stored = useProjectStore.getState().projects
        if (stored && stored.length > 0) {
          ctx.addLog('info', i18n.t('terminal.commands.list.projectsFromCache', { count: stored.length }))
          stored.forEach((p) => ctx.addLog('info', `  #${p.id} ${p.name}`))
          return
        }
        if (!window.electron || !window.electron.project) {
          ctx.addLog('error', i18n.t('terminal.electronRequired'))
          return
        }
        const raw = await window.electron.project.list()
        const projects = Array.isArray(raw) ? raw : []
        if (projects.length === 0) {
          ctx.addLog('warn', i18n.t('terminal.commands.list.noProjects'))
          return
        }
        ctx.addLog('info', i18n.t('terminal.commands.list.projectsFromServer', { count: projects.length }))
        projects.forEach((p: any) => {
          ctx.addLog('info', `  #${p.id ?? '?'} ${String(p.name ?? '')}`)
        })
      } else {
        ctx.addLog('error', i18n.t('terminal.commands.list.unknownParam', { param: args.join(' ') }))
      }
    },
  },
  ls: {
    desc: i18n.t('terminal.commands.ls.desc'),
    fn: (_, ctx) => commands.list.fn(['projects'], ctx),
  },
  select: {
    desc: i18n.t('terminal.commands.select.desc'),
    fn: async (args, ctx) => {
      if (args.length === 0) {
        ctx.addLog('error', i18n.t('terminal.commands.select.usage'))
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
        ctx.addLog('error', i18n.t('terminal.commands.select.notFound', { name: target }))
        return
      }
      ctx.selectProject(project.name)
      ctx.addLog('success', i18n.t('terminal.commands.select.selected', { name: project.name }))
    },
  },
  render: {
    desc: i18n.t('terminal.commands.render.desc'),
    fn: async (args, ctx) => {
      if (!window.electron || !window.electron.render) {
        ctx.addLog('error', i18n.t('terminal.electronRequired'))
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
        ctx.addLog('error', i18n.t('terminal.commands.render.noProject'))
        return
      }
      try {
        if (sub === 'yaml') {
          await window.electron.render.yaml(ids)
          ctx.addLog('success', i18n.t('terminal.commands.render.yamlDone', { ids: ids.join(', ') }))
        } else if (sub === 'project' || sub === 'projects') {
          await window.electron.render.project(ids)
          ctx.addLog('success', i18n.t('terminal.commands.render.projectDone', { ids: ids.join(', ') }))
        } else {
          ctx.addLog('error', i18n.t('terminal.commands.render.unknownSub', { sub }))
        }
      } catch (err) {
        ctx.addLog('error', i18n.t('terminal.commands.render.failed', { error: (err as Error).message }))
      }
    },
  },
  label: {
    desc: i18n.t('terminal.commands.label.desc'),
    fn: async (args, ctx) => {
      if (!window.electron || !window.electron.feature) {
        ctx.addLog('error', i18n.t('terminal.electronRequired'))
        return
      }
      if (args.length === 0) {
        const selected = useProjectStore.getState().selectedProject
        if (!selected) {
          ctx.addLog('error', i18n.t('terminal.commands.label.noProject'))
          return
        }
        args.push(String(selected.id))
      }
      try {
        await window.electron.feature.labelPrint(args)
        ctx.addLog('success', i18n.t('terminal.commands.label.submitted', { ids: args.join(', ') }))
      } catch (err) {
        ctx.addLog('error', i18n.t('terminal.commands.label.failed', { error: (err as Error).message }))
      }
    },
  },
  theme: {
    desc: i18n.t('terminal.commands.theme.desc'),
    fn: (args, ctx) => {
      if (args.length === 0) {
        ctx.toggleDark()
        const next = useUIStore.getState().isDark ? 'dark' : 'light'
        ctx.addLog('success', i18n.t('terminal.commands.theme.toggled', { theme: next }))
        return
      }
      const value = args[0].toLowerCase()
      if (value === 'light' || value === 'dark') {
        ctx.setTheme(value)
        ctx.addLog('success', i18n.t('terminal.commands.theme.set', { theme: value }))
      } else {
        ctx.addLog('error', i18n.t('terminal.commands.theme.unknown', { theme: args[0] }))
      }
    },
  },
  clear: {
    desc: i18n.t('terminal.commands.clear.desc'),
    fn: (_, ctx) => ctx.clearTerminal(),
  },
  cls: {
    desc: i18n.t('terminal.commands.cls.desc'),
    fn: (_, ctx) => ctx.clearTerminal(),
  },
  echo: {
    desc: i18n.t('terminal.commands.echo.desc'),
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
    ctx.addLog('error', i18n.t('terminal.commands.unknown', { cmd }))
    return
  }
  await Promise.resolve(found.entry.fn(args, ctx))
}

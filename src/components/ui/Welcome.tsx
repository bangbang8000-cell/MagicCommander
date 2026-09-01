import {
  Rocket,
  Sparkles,
  Zap,
  FolderPlus,
  FileSpreadsheet,
  Play,
  LayoutPanelTop,
  Keyboard,
  HelpCircle,
  Clock,
  LayoutTemplate,
} from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { Modal } from '@/components/ui/Modal'
import { HotkeyKeys } from '@/components/ui/Kbd'
import { showSuccess } from '@/components/ui/Toast'

export function Welcome() {
  const { t } = useTranslation('welcome')
  const isDark = useUIStore((s) => s.isDark)
  const hasSeenWelcome = useUIStore((s) => s.hasSeenWelcome)
  const welcomeOpen = useUIStore((s) => s.welcomeOpen)
  const setWelcomeOpen = useUIStore((s) => s.setWelcomeOpen)
  const dismissWelcome = useUIStore((s) => s.dismissWelcome)
  const setActiveActivity = useUIStore((s) => s.setActiveActivity)
  const projects = useProjectStore((s) => s.projects)
  const recentProjects = useProjectStore((s) => s.recentProjects)
  const selectProject = useProjectStore((s) => s.selectProject)
  const triggerCreateProject = useProjectStore((s) => s.triggerCreateProject)

  const open = !hasSeenWelcome || welcomeOpen

  const handleClose = () => {
    setWelcomeOpen(false)
  }

  const handleStart = () => {
    showSuccess(t('successStart'))
    handleClose()
  }

  const handleDismiss = () => {
    dismissWelcome()
    showSuccess(t('successDismiss'))
  }

  // 4.4 F4-4：欢迎页「从模板新建」入口
  const handleFromTemplate = () => {
    setActiveActivity('explorer')
    triggerCreateProject()
    handleClose()
  }

  // 4.4 F4-4：最近使用项目入口
  const handleOpenRecent = (name: string) => {
    const project = projects.find((p) => p.name === name)
    if (project) {
      selectProject(project)
      useProjectStore.getState().loadStructure(name)
    }
    setActiveActivity('explorer')
    handleClose()
  }

  const recent = recentProjects.slice(0, 5)

  const steps = [
    {
      icon: <FolderPlus size={18} />,
      title: t('steps.step1.title'),
      desc: t('steps.step1.description'),
    },
    {
      icon: <FileSpreadsheet size={18} />,
      title: t('steps.step2.title'),
      desc: t('steps.step2.description'),
    },
    {
      icon: <Play size={18} />,
      title: t('steps.step3.title'),
      desc: t('steps.step3.description'),
    },
    {
      icon: <LayoutPanelTop size={18} />,
      title: t('steps.step4.title'),
      desc: t('steps.step4.description'),
    },
  ]

  const hotkeys = [
    { label: t('shortcuts.toggleSidebar'), combo: 'ctrl+b' },
    { label: t('shortcuts.togglePanel'), combo: 'ctrl+j' },
    { label: t('shortcuts.openExplorer'), combo: 'ctrl+shift+e' },
    { label: t('shortcuts.openSearch'), combo: 'ctrl+shift+f' },
    { label: t('shortcuts.openWorkbench'), combo: 'ctrl+shift+w' },
    { label: t('shortcuts.openLabelGen'), combo: 'ctrl+shift+l' },
    { label: t('shortcuts.openRenderResult'), combo: 'ctrl+shift+o' },
    { label: t('shortcuts.saveFile'), combo: 'ctrl+s' },
    { label: t('shortcuts.refresh'), combo: 'f5' },
  ]

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles size={18} className="text-amber-500" />
          {t('title')}
        </span>
      }
      width="640px"
      footer={
        <>
          <button
            onClick={handleDismiss}
            className={clsx(
              'px-4 py-1.5 text-sm rounded border transition-colors',
              isDark
                ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50',
            )}
          >
            {t('skip')}
          </button>
          <button
            onClick={handleFromTemplate}
            className={clsx(
              'px-4 py-1.5 text-sm rounded border transition-colors inline-flex items-center gap-1',
              isDark
                ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50',
            )}
          >
            <LayoutTemplate size={14} /> {t('fromTemplate')}
          </button>
          <button
            onClick={handleStart}
            className="px-4 py-1.5 text-sm rounded bg-primary-600 text-white hover:bg-primary-700 inline-flex items-center gap-1"
          >
            <Rocket size={14} /> {t('getStarted')}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div
          className={clsx(
            'flex items-start gap-3 p-3 rounded-lg',
            isDark ? 'bg-gray-900/60 border border-gray-700' : 'bg-primary-50 border border-primary-100',
          )}
        >
          <div
            className={clsx(
              'shrink-0 w-9 h-9 rounded-lg inline-flex items-center justify-center',
              isDark ? 'bg-primary-900/60 text-primary-300' : 'bg-primary-100 text-primary-700',
            )}
          >
            <Zap size={18} />
          </div>
          <div>
            <h2 className={clsx('text-sm font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>
              {t('subtitle')}
            </h2>
            <p className={clsx('text-xs mt-1 leading-relaxed', isDark ? 'text-gray-400' : 'text-gray-600')}>
              {t('description')}
            </p>
          </div>
        </div>

        <div>
          <h3
            className={clsx(
              'text-xs font-semibold uppercase tracking-wider mb-2',
              isDark ? 'text-gray-400' : 'text-gray-500',
            )}
          >
            <span className="inline-flex items-center gap-1">
              <Sparkles size={12} /> {t('tips.title')}
            </span>
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className={clsx(
                  'flex items-start gap-3 p-2.5 rounded border',
                  isDark ? 'border-gray-700 hover:bg-gray-900/50' : 'border-gray-200 hover:bg-gray-50',
                )}
              >
                <div
                  className={clsx(
                    'shrink-0 w-7 h-7 rounded inline-flex items-center justify-center text-sm font-bold',
                    isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700',
                  )}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={clsx(
                      'flex items-center gap-1.5 text-sm font-medium',
                      isDark ? 'text-gray-100' : 'text-gray-900',
                    )}
                  >
                    <span className={isDark ? 'text-primary-400' : 'text-primary-600'}>{step.icon}</span>
                    {step.title}
                  </div>
                  <p className={clsx('text-xs mt-0.5 leading-relaxed', isDark ? 'text-gray-400' : 'text-gray-600')}>
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {recent.length > 0 && (
          <div>
            <h3
              className={clsx(
                'text-xs font-semibold uppercase tracking-wider mb-2',
                isDark ? 'text-gray-400' : 'text-gray-500',
              )}
            >
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> {t('recentTitle')}
              </span>
            </h3>
            <div
              className={clsx(
                'p-2 rounded border grid grid-cols-1 gap-y-1',
                isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50',
              )}
            >
              {recent.map((name) => (
                <button
                  key={name}
                  onClick={() => handleOpenRecent(name)}
                  className={clsx(
                    'flex items-center justify-between py-1 px-1.5 rounded text-xs text-left',
                    isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100',
                  )}
                >
                  <span className="truncate">{name}</span>
                  <span className={clsx('text-[10px] shrink-0', isDark ? 'text-gray-500' : 'text-gray-400')}>
                    {t('recentOpen')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3
            className={clsx(
              'text-xs font-semibold uppercase tracking-wider mb-2',
              isDark ? 'text-gray-400' : 'text-gray-500',
            )}
          >
            <span className="inline-flex items-center gap-1">
              <Keyboard size={12} /> {t('shortcuts.title')}
            </span>
          </h3>
          <div
            className={clsx(
              'p-2 rounded border grid grid-cols-2 gap-x-4 gap-y-1',
              isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50',
            )}
          >
            {hotkeys.map((item) => (
              <div
                key={item.combo}
                className={clsx(
                  'flex items-center justify-between py-1 px-1.5 rounded text-xs',
                  isDark ? 'text-gray-300' : 'text-gray-700',
                )}
              >
                <span>{item.label}</span>
                <HotkeyKeys combo={item.combo} />
              </div>
            ))}
          </div>
        </div>

        <div
          className={clsx(
            'flex items-center gap-2 p-2.5 rounded border text-xs',
            isDark ? 'border-gray-700 bg-gray-900/40 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600',
          )}
        >
          <HelpCircle size={14} className="shrink-0" />
          <span>{t('tips.reopenHint')}</span>
        </div>
      </div>
    </Modal>
  )
}

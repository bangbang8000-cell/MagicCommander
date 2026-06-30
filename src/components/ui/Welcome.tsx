import { Rocket, Sparkles, Zap, FolderPlus, FileSpreadsheet, Play, LayoutPanelTop, Keyboard, HelpCircle } from 'lucide-react'
import clsx from 'clsx'
import { useUIStore } from '@/stores/ui.store'
import { Modal } from '@/components/ui/Modal'
import { HotkeyKeys } from '@/components/ui/Kbd'
import { showSuccess } from '@/components/ui/Toast'

export function Welcome() {
  const isDark = useUIStore((s) => s.isDark)
  const hasSeenWelcome = useUIStore((s) => s.hasSeenWelcome)
  const welcomeOpen = useUIStore((s) => s.welcomeOpen)
  const setWelcomeOpen = useUIStore((s) => s.setWelcomeOpen)
  const dismissWelcome = useUIStore((s) => s.dismissWelcome)

  const open = !hasSeenWelcome || welcomeOpen

  const handleClose = () => {
    setWelcomeOpen(false)
  }

  const handleStart = () => {
    showSuccess('欢迎使用 MagicCommander，开始你的配置管理之旅！')
    handleClose()
  }

  const handleDismiss = () => {
    dismissWelcome()
    showSuccess('已记住你的选择，下次启动不再显示欢迎页')
  }

  const steps = [
    {
      icon: <FolderPlus size={18} />,
      title: '创建或选择项目',
      desc: '在左侧 Explorer 中选择已有的项目，或新建一个项目来开始工作',
    },
    {
      icon: <FileSpreadsheet size={18} />,
      title: '编辑参数表',
      desc: '在项目中编辑 para.xlsx 参数表，填写设备信息、模板变量等',
    },
    {
      icon: <Play size={18} />,
      title: '配置并渲染',
      desc: '在工作台中选择模板与渲染选项，点击渲染以生成设备配置',
    },
    {
      icon: <LayoutPanelTop size={18} />,
      title: '调整界面布局',
      desc: '使用 Ctrl+B 切换侧边栏，Ctrl+J 切换底部面板，自由组织工作空间',
    },
  ]

  const hotkeys = [
    { label: '切换侧边栏', combo: 'ctrl+b' },
    { label: '切换底部面板', combo: 'ctrl+j' },
    { label: '打开 Explorer', combo: 'ctrl+shift+e' },
    { label: '打开搜索', combo: 'ctrl+shift+f' },
    { label: '打开工作台', combo: 'ctrl+shift+p' },
    { label: '打开标签生成', combo: 'ctrl+shift+l' },
    { label: '打开渲染结果', combo: 'ctrl+shift+r' },
    { label: '保存当前文件', combo: 'ctrl+s' },
    { label: '刷新界面', combo: 'f5' },
  ]

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles size={18} className="text-amber-500" />
          欢迎使用 MagicCommander
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
            不再提示
          </button>
          <button
            onClick={handleStart}
            className="px-4 py-1.5 text-sm rounded bg-primary-600 text-white hover:bg-primary-700 inline-flex items-center gap-1"
          >
            <Rocket size={14} /> 开始使用
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
              一站式参数管理与配置生成
            </h2>
            <p className={clsx('text-xs mt-1 leading-relaxed', isDark ? 'text-gray-400' : 'text-gray-600')}>
              MagicCommander 为网络工程师提供参数表管理、模板渲染与标签生成的完整工作流，帮助你高效、准确地完成批量设备配置工作。
            </p>
          </div>
        </div>

        <div>
          <h3 className={clsx('text-xs font-semibold uppercase tracking-wider mb-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
            <span className="inline-flex items-center gap-1">
              <Sparkles size={12} /> 快速上手
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
                  <div className={clsx('flex items-center gap-1.5 text-sm font-medium', isDark ? 'text-gray-100' : 'text-gray-900')}>
                    <span className={isDark ? 'text-primary-400' : 'text-primary-600'}>{step.icon}</span>
                    {step.title}
                  </div>
                  <p className={clsx('text-xs mt-0.5 leading-relaxed', isDark ? 'text-gray-400' : 'text-gray-600')}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className={clsx('text-xs font-semibold uppercase tracking-wider mb-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
            <span className="inline-flex items-center gap-1">
              <Keyboard size={12} /> 常用快捷键
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
                className={clsx('flex items-center justify-between py-1 px-1.5 rounded text-xs', isDark ? 'text-gray-300' : 'text-gray-700')}
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
          <span>随时点击右上角的帮助按钮可以重新打开本页面。</span>
        </div>
      </div>
    </Modal>
  )
}

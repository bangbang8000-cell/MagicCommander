/**
 * 5.4.11-F54-11-3：MC 首次启动引导 Modal（对齐 AL OnboardingModal）
 * 3 步快速引导（创建项目 → 导入参数与渲染 → 输出交付），看过一次后不再弹出。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { FolderPlus, TableProperties, PackageCheck, Rocket } from 'lucide-react'
import clsx from 'clsx'
import { isOnboarded, markOnboarded } from '@/utils/onboardingGate'

const STEP_ICONS = [FolderPlus, TableProperties, PackageCheck]

export function OnboardingModal() {
  const { t } = useTranslation('common')
  // 首启检测在 useState 惰性初始化中完成，避免 effect 内 setState
  const [open, setOpen] = useState<boolean>(() => !isOnboarded())
  const [step, setStep] = useState(0)

  const finish = () => {
    markOnboarded()
    setOpen(false)
  }

  const stepTitle = (i: number) =>
    i === 0
      ? t('onboarding.step1Title', '创建项目')
      : i === 1
        ? t('onboarding.step2Title', '导入参数与渲染')
        : t('onboarding.step3Title', '输出与交付')

  const stepDesc = (i: number) =>
    i === 0
      ? t('onboarding.step1Desc', '从左侧「+」新建项目，或基于示例模板快速开始')
      : i === 1
        ? t('onboarding.step2Desc', '导入 Excel 参数，选择模板并批量生成设备配置')
        : t('onboarding.step3Desc', '查看输出与 YAML 产物，导出配置与标签')

  return (
    <Modal
      open={open}
      onClose={finish}
      title={t('onboarding.title', '欢迎使用 MagicCommander')}
      width="460px"
      closeOnEsc
      footer={
        <div className="flex w-full items-center justify-between">
          <button
            onClick={finish}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            {t('onboarding.skip', '跳过')}
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-3 py-1.5 text-xs rounded-[var(--radius-md)] border border-edge-subtle text-text-primary hover:bg-app-hover transition-colors"
              >
                {t('onboarding.prev', '上一步')}
              </button>
            )}
            {step < 2 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-4 py-1.5 text-xs rounded-[var(--radius-md)] bg-primary text-white hover:bg-primary-hover transition-colors"
              >
                {t('onboarding.next', '下一步')}
              </button>
            ) : (
              <button
                onClick={finish}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-[var(--radius-md)] bg-primary text-white hover:bg-primary-hover transition-colors"
              >
                <Rocket size={12} />
                {t('onboarding.start', '开始使用')}
              </button>
            )}
          </div>
        </div>
      }
    >
      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            aria-label={stepTitle(i)}
            aria-current={step === i ? 'step' : undefined}
            className={clsx('h-1.5 rounded-full transition-all', step === i ? 'w-6 bg-primary' : 'w-3 bg-edge-strong')}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="py-2 text-center">
        {(() => {
          const Icon = STEP_ICONS[step]
          return (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Icon size={28} className="text-primary" />
              </div>
              <h3 className="mb-2 text-base font-semibold text-text-primary">{stepTitle(step)}</h3>
              <p className="text-sm leading-relaxed text-text-secondary">{stepDesc(step)}</p>
            </>
          )
        })()}
      </div>
    </Modal>
  )
}

import type { ValidationResult } from '@/types/render'
import type { ProjectInfoDetail } from '@/types/ipc'

/**
 * 工作台三步步骤状态推导（5.4.4 F3 增强）。
 *
 * 与 AL v1.6 WorkbenchStepBar 语义对齐：每步给出
 *   pending（待开始）/ ready（已就绪）/ running（进行中）/ needs_update（需更新）
 * 四态，供子视图常驻步骤徽章条消费。
 *
 * i18n（5.4.17）：本模块为纯函数，只返回稳定状态码（hintKey）与可选插值参数，
 * 界面文案由消费组件通过 `t(`workbenchStep.${hintKey}`, hintParams)` 翻译
 * （common 命名空间，key 见 common.json 的 workbenchStep 子对象）。
 */

export type StepState = 'pending' | 'ready' | 'running' | 'needs_update'

/** 状态提示 key：对应 common.json 中 workbenchStep 子对象的键 */
export type StepHintKey =
  | 'pending'
  | 'ready'
  | 'running'
  | 'needsUpdate'
  | 'missingMaterials'
  | 'hasErrors'
  | 'readyWithWarnings'
  | 'renderingProgress'
  | 'rendered'
  | 'outputDone'

export interface StepStateInfo {
  state: StepState
  /** 状态提示 key（消费组件用 t(`workbenchStep.${hintKey}`, hintParams) 翻译） */
  hintKey: StepHintKey
  /** 动态插值参数（如渲染进度） */
  hintParams?: Record<string, unknown>
}

/** 步骤 ① 配置与就绪：取决于项目结构完整性 + 校验结果 */
export function deriveStepConfig(
  projectInfo: ProjectInfoDetail | null,
  isValidationRunning: boolean,
  validationResults: ValidationResult[] | null,
): StepStateInfo {
  if (isValidationRunning) {
    return { state: 'running', hintKey: 'running' }
  }
  const structure = projectInfo?.structure
  if (!structure) {
    return { state: 'pending', hintKey: 'pending' }
  }
  const essentialReady = Boolean(structure.excel && structure.templates && structure.para)
  if (!essentialReady) {
    return { state: 'needs_update', hintKey: 'missingMaterials' }
  }
  const hasFail = (validationResults ?? []).some((r) => r.status === 'fail')
  if (hasFail) {
    return { state: 'needs_update', hintKey: 'hasErrors' }
  }
  const hasWarn = (validationResults ?? []).some((r) => r.status === 'warn')
  if (hasWarn) {
    return { state: 'ready', hintKey: 'readyWithWarnings' }
  }
  return { state: 'ready', hintKey: 'ready' }
}

/** 步骤 ② 渲染材料与操作：取决于是否正在渲染 + 是否已有输出 */
export function deriveStepRender(isRendering: boolean, progress: number, hasOutput: boolean): StepStateInfo {
  if (isRendering) {
    return { state: 'running', hintKey: 'renderingProgress', hintParams: { progress } }
  }
  if (hasOutput) {
    return { state: 'ready', hintKey: 'rendered' }
  }
  return { state: 'pending', hintKey: 'pending' }
}

/** 步骤 ③ 校对与输出：取决于校验结果 / 批量进度 / 是否已产出 */
export function deriveStepResult(
  isValidationRunning: boolean,
  validationResults: ValidationResult[] | null,
  hasOutput: boolean,
  hasYaml: boolean,
): StepStateInfo {
  if (isValidationRunning) {
    return { state: 'running', hintKey: 'running' }
  }
  const results = validationResults ?? []
  if (results.some((r) => r.status === 'fail')) {
    return { state: 'needs_update', hintKey: 'hasErrors' }
  }
  if (hasOutput || hasYaml) {
    return { state: 'ready', hintKey: 'outputDone' }
  }
  return { state: 'pending', hintKey: 'pending' }
}

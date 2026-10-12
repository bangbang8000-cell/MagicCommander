import type { ValidationResult } from '@/types/render'
import type { ProjectInfoDetail } from '@/types/ipc'

/**
 * 工作台三步步骤状态推导（5.4.4 F3 增强）。
 *
 * 与 AL v1.6 WorkbenchStepBar 语义对齐：每步给出
 *   pending（待开始）/ ready（已就绪）/ running（进行中）/ needs_update（需更新）
 * 四态，供子视图常驻步骤徽章条消费。
 */

export type StepState = 'pending' | 'ready' | 'running' | 'needs_update'

export interface StepStateInfo {
  state: StepState
  /** 简要说明（已就绪 / 待开始 / 进行中 / 需更新） */
  hint: string
}

const STATUS_TEXT: Record<StepState, string> = {
  pending: '待开始',
  ready: '已就绪',
  running: '进行中',
  needs_update: '需更新',
}

/** 步骤 ① 配置与就绪：取决于项目结构完整性 + 校验结果 */
export function deriveStepConfig(
  projectInfo: ProjectInfoDetail | null,
  isValidationRunning: boolean,
  validationResults: ValidationResult[] | null,
): StepStateInfo {
  if (isValidationRunning) {
    return { state: 'running', hint: STATUS_TEXT.running }
  }
  const structure = projectInfo?.structure
  if (!structure) {
    return { state: 'pending', hint: STATUS_TEXT.pending }
  }
  const essentialReady = Boolean(structure.excel && structure.templates && structure.para)
  if (!essentialReady) {
    return { state: 'needs_update', hint: '缺少必需材料' }
  }
  const hasFail = (validationResults ?? []).some((r) => r.status === 'fail')
  if (hasFail) {
    return { state: 'needs_update', hint: '存在错误' }
  }
  const hasWarn = (validationResults ?? []).some((r) => r.status === 'warn')
  if (hasWarn) {
    return { state: 'ready', hint: '已就绪（有警告）' }
  }
  return { state: 'ready', hint: STATUS_TEXT.ready }
}

/** 步骤 ② 渲染材料与操作：取决于是否正在渲染 + 是否已有输出 */
export function deriveStepRender(isRendering: boolean, progress: number, hasOutput: boolean): StepStateInfo {
  if (isRendering) {
    return { state: 'running', hint: `渲染中 ${progress}%` }
  }
  if (hasOutput) {
    return { state: 'ready', hint: '已渲染' }
  }
  return { state: 'pending', hint: STATUS_TEXT.pending }
}

/** 步骤 ③ 校对与输出：取决于校验结果 / 批量进度 / 是否已产出 */
export function deriveStepResult(
  isValidationRunning: boolean,
  validationResults: ValidationResult[] | null,
  hasOutput: boolean,
  hasYaml: boolean,
): StepStateInfo {
  if (isValidationRunning) {
    return { state: 'running', hint: STATUS_TEXT.running }
  }
  const results = validationResults ?? []
  if (results.some((r) => r.status === 'fail')) {
    return { state: 'needs_update', hint: '存在错误' }
  }
  if (hasOutput || hasYaml) {
    return { state: 'ready', hint: '已输出' }
  }
  return { state: 'pending', hint: STATUS_TEXT.pending }
}

import { describe, expect, it } from 'vitest'
import { deriveStepConfig, deriveStepRender, deriveStepResult } from './workbenchSteps'
import type { ProjectInfoDetail } from '@/types/ipc'
import type { ValidationResult } from '@/types/render'

const projectInfo = (overrides?: Partial<NonNullable<ProjectInfoDetail['structure']>>): ProjectInfoDetail =>
  ({
    name: 'p',
    path: '/ws/p',
    structure: {
      excel: true,
      templates: true,
      para: true,
      output: false,
      yaml: false,
      ...overrides,
    },
  }) as ProjectInfoDetail

const vr = (status: ValidationResult['status']): ValidationResult =>
  ({ project: 'p', status, message: 'x' }) as ValidationResult

describe('deriveStepConfig', () => {
  it('无项目信息 → 待开始', () => {
    expect(deriveStepConfig(null, false, null).state).toBe('pending')
  })

  it('校验进行中 → 进行中', () => {
    expect(deriveStepConfig(projectInfo(), true, null).state).toBe('running')
  })

  it('缺少必需材料 → 需更新', () => {
    expect(deriveStepConfig(projectInfo({ excel: false }), false, null).state).toBe('needs_update')
  })

  it('校验存在错误 → 需更新', () => {
    expect(deriveStepConfig(projectInfo(), false, [vr('fail')]).state).toBe('needs_update')
  })

  it('校验存在警告 → 已就绪（有警告）', () => {
    const s = deriveStepConfig(projectInfo(), false, [vr('warn')])
    expect(s.state).toBe('ready')
    expect(s.hint).toContain('警告')
  })

  it('材料齐全且校验通过 → 已就绪', () => {
    expect(deriveStepConfig(projectInfo(), false, [vr('pass')]).state).toBe('ready')
  })
})

describe('deriveStepRender', () => {
  it('渲染中 → 进行中（带进度）', () => {
    const s = deriveStepRender(true, 42, false)
    expect(s.state).toBe('running')
    expect(s.hint).toContain('42')
  })

  it('已渲染 → 已就绪', () => {
    expect(deriveStepRender(false, 0, true).state).toBe('ready')
  })

  it('未渲染 → 待开始', () => {
    expect(deriveStepRender(false, 0, false).state).toBe('pending')
  })
})

describe('deriveStepResult', () => {
  it('校验进行中 → 进行中', () => {
    expect(deriveStepResult(true, null, false, false).state).toBe('running')
  })

  it('校验存在错误 → 需更新', () => {
    expect(deriveStepResult(false, [vr('fail')], false, false).state).toBe('needs_update')
  })

  it('已有输出 → 已就绪', () => {
    expect(deriveStepResult(false, null, true, false).state).toBe('ready')
    expect(deriveStepResult(false, null, false, true).state).toBe('ready')
  })

  it('无输出 → 待开始', () => {
    expect(deriveStepResult(false, null, false, false).state).toBe('pending')
  })
})

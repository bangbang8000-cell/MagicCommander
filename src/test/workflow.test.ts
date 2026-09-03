/**
 * 5.0.3-503-a：多步任务编排（workflow）前端解析与步骤状态应用
 *
 * 覆盖：
 * - parseWorkflowStatus：解析 PLAN/STEP/APPROVE_PLAN/APPROVE_STEP/VERIFY/DONE 标记并剥离
 * - applyWorkflowStepStatuses：按当前步骤应用 done/running/pending
 * - 无标记内容返回 null
 */
import { describe, expect, it } from 'vitest'
import { parseWorkflowStatus, applyWorkflowStepStatuses } from '@/stores/chat.store'

describe('parseWorkflowStatus（多步任务编排标记解析）', () => {
  it('无工作流标记返回 null', () => {
    expect(parseWorkflowStatus('普通回复内容')).toBeNull()
    expect(parseWorkflowStatus('')).toBeNull()
    expect(parseWorkflowStatus('---CONFIRM:delete_project---')).toBeNull()
  })

  it('解析计划标记并剥离显示内容', () => {
    const content = '---WORKFLOW_PLAN---\n📋 执行计划:\n1. 创建项目\n---WORKFLOW_APPROVE_PLAN---\n请确认'
    const st = parseWorkflowStatus(content)
    expect(st).not.toBeNull()
    expect(st!.plan).toBe(true)
    expect(st!.approvePlan).toBe(true)
    expect(st!.done).toBe(false)
    // 标记行被剥离，计划文本与正文保留
    expect(st!.displayContent).not.toContain('WORKFLOW_PLAN')
    expect(st!.displayContent).toContain('执行计划')
    expect(st!.displayContent).toContain('请确认')
  })

  it('解析步骤与校验/完成标记', () => {
    const content = '---WORKFLOW_STEP:2---\n执行中\n---WORKFLOW_VERIFY---\n---WORKFLOW_DONE---\n完成'
    const st = parseWorkflowStatus(content)
    expect(st!.stepIndex).toBe(2)
    expect(st!.verify).toBe(true)
    expect(st!.done).toBe(true)
    expect(st!.displayContent).not.toContain('WORKFLOW_')
    expect(st!.displayContent).toContain('执行中')
  })

  it('解析步骤级审批标记', () => {
    const content = '---WORKFLOW_APPROVE_STEP:3---\n请确认步骤3'
    const st = parseWorkflowStatus(content)
    expect(st!.approveStep).toBe(3)
    expect(st!.stepIndex).toBe(3)
    expect(st!.displayContent).toContain('请确认步骤3')
  })

  it('审批待确认时 stepIndex 取待审批步骤', () => {
    // 先执行步骤1，再暂停步骤2审批 → 当前步骤=2
    const content = '---WORKFLOW_STEP:1---\ndone\n---WORKFLOW_APPROVE_STEP:2---\nconfirm'
    const st = parseWorkflowStatus(content)
    expect(st!.stepIndex).toBe(2)
    expect(st!.approveStep).toBe(2)
  })
})

describe('applyWorkflowStepStatuses（步骤进度状态应用）', () => {
  it('按当前步骤应用 done/running/pending', () => {
    const steps = [
      { step: 1, status: 'done' },
      { step: 2, status: 'done' },
      { step: 3, status: 'done' },
    ]
    const st = parseWorkflowStatus('---WORKFLOW_STEP:2---')
    const out = applyWorkflowStepStatuses(steps, st)
    expect(out[0].status).toBe('done') // 1 < 2
    expect(out[1].status).toBe('running') // == 2
    expect(out[2].status).toBe('pending') // 3 > 2
  })

  it('无工作流状态时保持原步骤', () => {
    const steps = [{ step: 1, status: 'done' }]
    expect(applyWorkflowStepStatuses(steps, null)).toEqual(steps)
  })
})

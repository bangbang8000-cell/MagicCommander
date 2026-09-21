/**
 * 覆盖率棘轮补测：Modal useConfirm 确认对话框分支
 *
 * useConfirm 返回 { confirm, ConfirmDialog }：
 * - state.open && state.options 为假 → 渲染 null（未打开分支）
 * - confirm(...) 打开对话框（真分支）
 * - 取消按钮 close(false) / 确认按钮 close(true) → state.resolve?.(result) 分支
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@/i18n'
import { useConfirm } from '@/components/ui/Modal'

describe('useConfirm 确认对话框分支（覆盖率棘轮）', () => {
  it('初始未打开渲染 null；confirm 打开后 取消 → resolve(false)、确认 → resolve(true)', async () => {
    let hook!: ReturnType<typeof useConfirm>
    function Harness() {
      hook = useConfirm()
      return <hook.ConfirmDialog />
    }

    render(<Harness />)
    // 未打开：false 分支，不渲染对话框
    expect(screen.queryByRole('dialog')).toBeNull()

    let cancelResult: boolean | undefined
    let okResult: boolean | undefined
    let cancelPromise: Promise<boolean>
    let okPromise: Promise<boolean>

    // 第一次：取消路径
    await act(async () => {
      cancelPromise = hook.confirm({ title: '删除确认', message: '确定删除吗？' })
      cancelPromise.then((v) => {
        cancelResult = v
      })
    })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '取消' }))
    })
    expect(cancelResult).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()

    // 第二次：确认路径
    await act(async () => {
      okPromise = hook.confirm({ title: '保存确认', message: '保存修改？' })
      okPromise.then((v) => {
        okResult = v
      })
    })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认' }))
    })
    expect(okResult).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

/**
 * 覆盖率棘轮补测：Welcome 主题（isDark）分支
 *
 * Welcome 内部大量 `isDark ? dark : light` 三元分支，既有测试仅覆盖亮色一侧。
 * 这里在亮色 + 暗色两种 isDark 状态下各渲染一次，覆盖全部主题分支。
 * 渲染依赖：真实 i18n（'welcome' 命名空间）+ window.electron 桩由 src/test/setup.ts 提供。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/i18n'
import { Welcome } from '@/components/ui/Welcome'
import { useUIStore } from '@/stores/ui.store'

function forceOpenWithTheme(isDark: boolean) {
  // open = !hasSeenWelcome || welcomeOpen：强制 welcomeOpen=true 以打开对话框
  useUIStore.setState({ hasSeenWelcome: true, welcomeOpen: true, isDark } as never)
}

describe('Welcome 主题分支（覆盖率棘轮）', () => {
  beforeEach(() => {
    useUIStore.setState({ hasSeenWelcome: true, welcomeOpen: false, isDark: false } as never)
  })

  it('亮色：isDark=false 走 light 分支（步骤区 + 快捷键区渲染）', () => {
    forceOpenWithTheme(false)
    render(<Welcome />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // 底部三按钮：跳过 / 从模板新建 / 开始使用
    expect(screen.getByText('从模板新建')).toBeInTheDocument()
    expect(screen.getByText('开始使用')).toBeInTheDocument()
  })

  it('暗色：isDark=true 走 dark 分支（同一对话框渲染，主题类切换）', () => {
    forceOpenWithTheme(true)
    render(<Welcome />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('从模板新建')).toBeInTheDocument()
  })
})

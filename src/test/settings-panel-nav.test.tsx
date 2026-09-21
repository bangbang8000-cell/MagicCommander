/**
 * MC-U2：设置面板「搜索 + 分类」导航基本组件测试
 *
 * 覆盖：
 * - 默认渲染 5 个分类顶部分段 Tab（通用/AI/平台/高级/关于）
 * - 搜索框按关键词过滤分段 Tab（命中保留、未命中隐藏）
 * - 点击 Tab 切换下方内容区（general ↔ about）
 *
 * 渲染依赖：真实 i18n 资源（zh-CN 默认）+ window.electron 由 src/test/setup.ts 提供桩。
 */
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@/i18n'
import { SettingsPanel } from '@/components/sidebar/SettingsPanel'

describe('SettingsPanel MC-U2 搜索 + 分类导航', () => {
  it('默认渲染 5 个分类按钮（通用/AI/平台/高级/关于）', () => {
    render(<SettingsPanel />)
    for (const name of ['通用', 'AI', '平台', '高级', '关于']) {
      expect(screen.getByText(name, { exact: true })).toBeInTheDocument()
    }
  })

  it('分类导航为顶部分段 Tab 容器（flex-wrap 圆角分段条）', () => {
    render(<SettingsPanel />)
    const generalBtn = screen.getByRole('button', { name: /通用/ })
    const container = generalBtn.parentElement
    expect(container?.className).toMatch(/flex-wrap/)
    expect(container?.className).toMatch(/rounded-lg/)
  })

  it('搜索框存在且 placeholder 走 i18n', () => {
    render(<SettingsPanel />)
    expect(screen.getByPlaceholderText('搜索设置...')).toBeInTheDocument()
  })

  it('输入关键词过滤分类列表：仅保留命中分类', () => {
    render(<SettingsPanel />)
    const box = screen.getByPlaceholderText('搜索设置...')
    // “关于” 仅命中 about 分类
    fireEvent.change(box, { target: { value: '关于' } })

    expect(screen.getByText('关于', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('通用', { exact: true })).toBeNull()
    expect(screen.queryByText('平台', { exact: true })).toBeNull()
    expect(screen.queryByText('高级', { exact: true })).toBeNull()

    // 清空搜索后恢复 5 个分类
    fireEvent.change(box, { target: { value: '' } })
    expect(screen.getByText('通用', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('关于', { exact: true })).toBeInTheDocument()
  })

  it('按设置项 label 过滤：搜索“版本”仅保留关于分类', () => {
    render(<SettingsPanel />)
    const box = screen.getByPlaceholderText('搜索设置...')
    fireEvent.change(box, { target: { value: '版本' } })
    // about.searchKeys 含 about.version → 命中
    expect(screen.getByText('关于', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('通用', { exact: true })).toBeNull()
  })

  it('点击分类切换右侧内容区', () => {
    render(<SettingsPanel />)
    // 默认 general：含“资产互灌”区块
    expect(screen.getByText(/资产互灌/)).toBeInTheDocument()

    // 切到关于
    fireEvent.click(screen.getByText('关于', { exact: true }))
    expect(screen.getByText('MagicCommander', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText(/资产互灌/)).toBeNull()

    // 切回通用
    fireEvent.click(screen.getByText('通用', { exact: true }))
    expect(screen.getByText(/资产互灌/)).toBeInTheDocument()
  })

  it('无任何命中时展示空状态文案', () => {
    render(<SettingsPanel />)
    const box = screen.getByPlaceholderText('搜索设置...')
    fireEvent.change(box, { target: { value: 'zzz_no_match_zzz' } })
    expect(screen.getByText('无匹配的设置')).toBeInTheDocument()
  })
})

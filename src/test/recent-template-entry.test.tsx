/**
 * 4.4 F4-4（测试计划 E-4）：模板入口 / 项目 store 持久化
 *
 * 覆盖：
 * - 欢迎页「从模板新建」入口（点击 → 打开项目面板 + 触发新建对话框）
 * - 项目 store：trackRecent 去重/上限、toggleFavorite、selectProject 记录最近（持久化 partialize）
 *
 * 注：「最近项目」UI 入口（欢迎页最近列表/侧边栏 recent 分组/文件菜单/命令面板）
 * 已按产品决定全部移除；store 的 recentProjects 字段仅保留持久化，不再有 UI 消费。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Welcome } from '@/components/ui/Welcome'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import '@/i18n'

describe('E-4 欢迎页「从模板新建」入口', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [
        { id: 1, name: 'p1', index: 0 },
        { id: 2, name: 'p2', index: 1 },
      ],
      recentProjects: ['p1', 'p2'],
      favoriteProjects: ['p1'],
      selectedProject: null,
      selectedProjectId: null,
      selectedProjectName: null,
    })
    useUIStore.setState({ hasSeenWelcome: false, welcomeOpen: true, activeActivity: 'search' })
  })

  it('欢迎页渲染「从模板新建」入口', () => {
    render(<Welcome />)
    expect(screen.getByText('从模板新建')).toBeInTheDocument()
  })

  it('点击「从模板新建」→ 打开项目面板并触发新建（模板可选）对话框', () => {
    render(<Welcome />)
    fireEvent.click(screen.getByText('从模板新建'))
    const ui = useUIStore.getState()
    const proj = useProjectStore.getState()
    expect(ui.activeActivity).toBe('explorer')
    expect(ui.welcomeOpen).toBe(false)
    expect(proj.pendingCreateDialog).toBe(true)
  })
})

describe('E-4 项目 store：最近 / 收藏持久化行为', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [
        { id: 1, name: 'p1', index: 0 },
        { id: 2, name: 'p2', index: 1 },
        { id: 3, name: 'p3', index: 2 },
        { id: 4, name: 'p4', index: 3 },
        { id: 5, name: 'p5', index: 4 },
        { id: 6, name: 'p6', index: 5 },
      ],
      recentProjects: [],
      favoriteProjects: [],
      selectedProject: null,
      selectedProjectId: null,
      selectedProjectName: null,
    })
  })

  it('trackRecent 去重并限制最近 5 项（持久化字段）', () => {
    const store = useProjectStore.getState()
    for (const name of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) {
      store.trackRecent(name)
    }
    store.trackRecent('p2') // 再次访问去重并置顶
    const recent = useProjectStore.getState().recentProjects
    expect(recent).toHaveLength(5)
    expect(recent[0]).toBe('p2')
    expect(new Set(recent).size).toBe(5)
  })

  it('toggleFavorite 收藏/取消收藏（星标）', () => {
    const store = useProjectStore.getState()
    store.toggleFavorite('p1')
    expect(useProjectStore.getState().favoriteProjects).toContain('p1')
    store.toggleFavorite('p1')
    expect(useProjectStore.getState().favoriteProjects).not.toContain('p1')
  })

  it('selectProject 自动记录最近使用（持久化字段）', () => {
    const store = useProjectStore.getState()
    store.selectProject({ id: 3, name: 'p3', index: 2 })
    expect(useProjectStore.getState().recentProjects[0]).toBe('p3')
    expect(useProjectStore.getState().selectedProjectName).toBe('p3')
  })

  it('partialize 仅持久化 selectedProjectName / favoriteProjects / recentProjects', () => {
    const partial = useProjectStore.persist.getOptions().partialize!(useProjectStore.getState() as never)
    expect(Object.keys(partial).sort()).toEqual(['favoriteProjects', 'recentProjects', 'selectedProjectName'])
  })
})

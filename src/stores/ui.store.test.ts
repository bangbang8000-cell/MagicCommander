import { beforeEach, describe, expect, it } from 'vitest'
import { useUIStore } from './ui.store'

describe('ui.store', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeActivity: 'explorer',
      panelVisible: true,
      sidebarVisible: true,
      activeProjectId: null,
      isDark: false,
      theme: 'light',
      syncScroll: false,
    })
  })

  it('toggleDark should flip isDark', () => {
    useUIStore.getState().toggleDark()
    expect(useUIStore.getState().isDark).toBe(true)
    useUIStore.getState().toggleDark()
    expect(useUIStore.getState().isDark).toBe(false)
  })

  it('setActiveActivity should update active activity', () => {
    useUIStore.getState().setActiveActivity('workbench')
    expect(useUIStore.getState().activeActivity).toBe('workbench')
  })

  it('clamps layout sizes', () => {
    useUIStore.getState().setSidebarPx(100)
    useUIStore.getState().setBottomPx(50)
    useUIStore.getState().setExplorerProjectListHeight(80)
    useUIStore.getState().setTemplateListHeight(80)
    expect(useUIStore.getState().sidebarPx).toBeGreaterThanOrEqual(400)
    expect(useUIStore.getState().bottomPx).toBeGreaterThanOrEqual(180)
    expect(useUIStore.getState().explorerProjectListHeight).toBeGreaterThanOrEqual(160)
    expect(useUIStore.getState().templateListHeight).toBeGreaterThanOrEqual(160)
  })
})

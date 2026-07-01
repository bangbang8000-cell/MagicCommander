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
})

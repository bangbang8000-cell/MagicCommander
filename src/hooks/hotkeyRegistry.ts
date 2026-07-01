// ============================================================
// 全局快捷键注册表
// ============================================================

import type { HotkeyDefinition } from './useHotkey'
import i18n from '@/i18n'

export const HOTKEY_REGISTRY: HotkeyDefinition[] = [
  // 文件操作
  { combo: 'ctrl+s', label: i18n.t('common:hotkeys.saveCurrentFile'), category: i18n.t('common:hotkeyCategories.file') },
  { combo: 'ctrl+w', label: i18n.t('common:hotkeys.closeCurrentTab'), category: i18n.t('common:hotkeyCategories.file') },
  { combo: 'ctrl+shift+t', label: i18n.t('common:hotkeys.reopenClosedTab'), category: i18n.t('common:hotkeyCategories.file') },
  { combo: 'ctrl+tab', label: i18n.t('common:hotkeys.switchToNextTab'), category: i18n.t('common:hotkeyCategories.file') },
  { combo: 'ctrl+shift+tab', label: i18n.t('common:hotkeys.switchToPrevTab'), category: i18n.t('common:hotkeyCategories.file') },

  // 视图操作
  { combo: 'ctrl+b', label: i18n.t('common:hotkeys.toggleSidebar'), category: i18n.t('common:hotkeyCategories.view') },
  { combo: 'ctrl+j', label: i18n.t('common:hotkeys.toggleBottomPanel'), category: i18n.t('common:hotkeyCategories.view') },
  { combo: 'ctrl+\\', label: i18n.t('common:hotkeys.toggleSplitScreen'), category: i18n.t('common:hotkeyCategories.view') },
  { combo: 'ctrl+k ctrl+s', label: i18n.t('common:hotkeys.openShortcutList'), category: i18n.t('common:hotkeyCategories.view') },
  { combo: 'f5', label: i18n.t('common:hotkeys.refreshPage'), category: i18n.t('common:hotkeyCategories.view') },

  // 面板切换
  { combo: 'ctrl+shift+e', label: i18n.t('common:hotkeys.projectExplorer'), category: i18n.t('common:hotkeyCategories.panel') },
  { combo: 'ctrl+shift+f', label: i18n.t('common:hotkeys.search'), category: i18n.t('common:hotkeyCategories.panel') },
  { combo: 'ctrl+shift+p', label: i18n.t('common:hotkeys.projectConfig'), category: i18n.t('common:hotkeyCategories.panel') },
  { combo: 'ctrl+shift+l', label: i18n.t('common:hotkeys.labelPrint'), category: i18n.t('common:hotkeyCategories.panel') },
  { combo: 'ctrl+shift+r', label: i18n.t('common:hotkeys.renderOperations'), category: i18n.t('common:hotkeyCategories.panel') },
  { combo: 'ctrl+shift+o', label: i18n.t('common:hotkeys.outputResults'), category: i18n.t('common:hotkeyCategories.panel') },
]

export const CATEGORY_ORDER = [
  i18n.t('common:hotkeyCategories.file'),
  i18n.t('common:hotkeyCategories.view'),
  i18n.t('common:hotkeyCategories.panel'),
]

export function getHotkeysByCategory(): Record<string, HotkeyDefinition[]> {
  const map: Record<string, HotkeyDefinition[]> = {}
  for (const def of HOTKEY_REGISTRY) {
    if (!map[def.category]) map[def.category] = []
    map[def.category].push(def)
  }
  return map
}
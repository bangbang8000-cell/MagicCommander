// ============================================================
// 全局快捷键注册表（4.4 F4-1 双端统一快捷键体系）
// ============================================================
// 共享快捷键规范（双端一致，MC / AL 同名同键）：
//   Ctrl+Z / Ctrl+Shift+Z   撤销 / 重做
//   Ctrl+K                   命令面板
//   Ctrl+B                   切换侧边栏
//   Ctrl+`                   终端 / 日志面板
//   Ctrl+N                   新建项目
//   Ctrl+Enter               渲染当前项目
//   Ctrl+E                   导出 / 输出
//   Ctrl+Shift+P             项目面板
//   Ctrl+,                   设置
//   F1                       快捷键 Cheatsheet
// 说明：产品无意义的键可不注册（例如 AL 无终端时可不注册 Ctrl+`）。
// 聚焦输入框时系统键跳过（useHotkey enableInInput 默认 false）。

import type { HotkeyDefinition } from './useHotkey'
import i18n from '@/i18n'

export interface SharedHotkeySpecItem {
  combo: string
  labelKey: string
  categoryKey: string
}

/** 双端共享快捷键规范（E-1 断言基准；AL 端按同一规范实现） */
export const SHARED_HOTKEY_SPEC: SharedHotkeySpecItem[] = [
  { combo: 'ctrl+z', labelKey: 'common:hotkeys.undo', categoryKey: 'common:hotkeyCategories.edit' },
  { combo: 'ctrl+shift+z', labelKey: 'common:hotkeys.redo', categoryKey: 'common:hotkeyCategories.edit' },
  { combo: 'ctrl+k', labelKey: 'common:hotkeys.commandPalette', categoryKey: 'common:hotkeyCategories.view' },
  { combo: 'ctrl+b', labelKey: 'common:hotkeys.toggleSidebar', categoryKey: 'common:hotkeyCategories.view' },
  { combo: 'ctrl+`', labelKey: 'common:hotkeys.toggleTerminal', categoryKey: 'common:hotkeyCategories.panel' },
  { combo: 'ctrl+n', labelKey: 'common:hotkeys.newProject', categoryKey: 'common:hotkeyCategories.file' },
  { combo: 'ctrl+enter', labelKey: 'common:hotkeys.renderCurrentProject', categoryKey: 'common:hotkeyCategories.view' },
  { combo: 'ctrl+e', labelKey: 'common:hotkeys.exportOutput', categoryKey: 'common:hotkeyCategories.view' },
  { combo: 'ctrl+shift+p', labelKey: 'common:hotkeys.projectPanel', categoryKey: 'common:hotkeyCategories.panel' },
  { combo: 'ctrl+,', labelKey: 'common:hotkeys.settings', categoryKey: 'common:hotkeyCategories.panel' },
  { combo: 'f1', labelKey: 'common:hotkeys.openShortcutList', categoryKey: 'common:hotkeyCategories.view' },
]

const t = (key: string) => i18n.t(key)

export const HOTKEY_REGISTRY: HotkeyDefinition[] = [
  // ===== 共享标准键（10 组） =====
  ...SHARED_HOTKEY_SPEC.map((item) => ({
    combo: item.combo,
    label: t(item.labelKey),
    category: t(item.categoryKey),
  })),
  // ===== MC 附加键（保持既有习惯，不冲突标准键） =====
  // 文件操作
  { combo: 'ctrl+s', label: t('common:hotkeys.saveCurrentFile'), category: t('common:hotkeyCategories.file') },
  { combo: 'ctrl+w', label: t('common:hotkeys.closeCurrentTab'), category: t('common:hotkeyCategories.file') },
  { combo: 'ctrl+shift+t', label: t('common:hotkeys.reopenClosedTab'), category: t('common:hotkeyCategories.file') },
  { combo: 'ctrl+tab', label: t('common:hotkeys.switchToNextTab'), category: t('common:hotkeyCategories.file') },
  { combo: 'ctrl+shift+tab', label: t('common:hotkeys.switchToPrevTab'), category: t('common:hotkeyCategories.file') },
  // 编辑操作（撤销/重做走共享标准键；ctrl+y 为兼容附加）
  { combo: 'ctrl+y', label: t('common:hotkeys.redo'), category: t('common:hotkeyCategories.edit') },
  { combo: 'ctrl+c', label: t('common:hotkeys.copySelection'), category: t('common:hotkeyCategories.edit') },
  { combo: 'ctrl+v', label: t('common:hotkeys.paste'), category: t('common:hotkeyCategories.edit') },
  // 视图操作
  { combo: 'ctrl+j', label: t('common:hotkeys.toggleBottomPanel'), category: t('common:hotkeyCategories.view') },
  { combo: 'ctrl+\\', label: t('common:hotkeys.toggleSplitScreen'), category: t('common:hotkeyCategories.view') },
  { combo: 'f5', label: t('common:hotkeys.refreshPage'), category: t('common:hotkeyCategories.view') },
  // 面板切换
  { combo: 'ctrl+shift+f', label: t('common:hotkeys.search'), category: t('common:hotkeyCategories.panel') },
  { combo: 'ctrl+shift+e', label: t('common:hotkeys.projectExplorer'), category: t('common:hotkeyCategories.panel') },
  { combo: 'ctrl+shift+o', label: t('common:hotkeys.outputResults'), category: t('common:hotkeyCategories.panel') },
  { combo: 'ctrl+shift+w', label: t('common:hotkeys.workbench'), category: t('common:hotkeyCategories.panel') },
  { combo: 'ctrl+shift+h', label: t('common:hotkeys.aiChat'), category: t('common:hotkeyCategories.panel') },
]

export const CATEGORY_ORDER = [
  t('common:hotkeyCategories.file'),
  t('common:hotkeyCategories.edit'),
  t('common:hotkeyCategories.view'),
  t('common:hotkeyCategories.panel'),
]

export function getHotkeysByCategory(): Record<string, HotkeyDefinition[]> {
  const map: Record<string, HotkeyDefinition[]> = {}
  for (const def of HOTKEY_REGISTRY) {
    if (!map[def.category]) map[def.category] = []
    map[def.category].push(def)
  }
  return map
}

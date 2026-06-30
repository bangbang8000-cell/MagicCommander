// ============================================================
// 全局快捷键注册表
// ============================================================

import type { HotkeyDefinition } from './useHotkey'

export const HOTKEY_REGISTRY: HotkeyDefinition[] = [
  // 文件操作
  { combo: 'ctrl+s', label: '保存当前文件', category: '文件' },
  { combo: 'ctrl+w', label: '关闭当前标签页', category: '文件' },
  { combo: 'ctrl+shift+t', label: '恢复最近关闭的标签页', category: '文件' },
  { combo: 'ctrl+tab', label: '切换到下一标签页', category: '文件' },
  { combo: 'ctrl+shift+tab', label: '切换到上一标签页', category: '文件' },

  // 视图操作
  { combo: 'ctrl+b', label: '切换侧边栏', category: '视图' },
  { combo: 'ctrl+j', label: '切换底部面板', category: '视图' },
  { combo: 'ctrl+\\', label: '切换左右分屏', category: '视图' },
  { combo: 'ctrl+k ctrl+s', label: '打开快捷键列表', category: '视图' },
  { combo: 'f5', label: '刷新页面', category: '视图' },

  // 面板切换
  { combo: 'ctrl+shift+e', label: '项目浏览器', category: '面板' },
  { combo: 'ctrl+shift+f', label: '搜索', category: '面板' },
  { combo: 'ctrl+shift+p', label: '项目配置', category: '面板' },
  { combo: 'ctrl+shift+l', label: '标签打印', category: '面板' },
  { combo: 'ctrl+shift+r', label: '渲染操作', category: '面板' },
  { combo: 'ctrl+shift+o', label: '输出结果', category: '面板' },
]

export const CATEGORY_ORDER = ['文件', '视图', '面板']

export function getHotkeysByCategory(): Record<string, HotkeyDefinition[]> {
  const map: Record<string, HotkeyDefinition[]> = {}
  for (const def of HOTKEY_REGISTRY) {
    if (!map[def.category]) map[def.category] = []
    map[def.category].push(def)
  }
  return map
}

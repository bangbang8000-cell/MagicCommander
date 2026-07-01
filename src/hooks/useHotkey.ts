// ============================================================
// useHotkey - 全局快捷键绑定 Hook
// 使用方式: useHotkey('ctrl+s', handleSave, { enableInInput: false })
// ============================================================

import { useEffect, useCallback, useRef } from 'react'

export type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'meta'
export type KeyCombo = {
  key: string
  modifiers?: ModifierKey[]
  enableInInput?: boolean // 默认 false，不在输入框中触发
}

const MODIFIER_MAP: Record<ModifierKey, (e: KeyboardEvent) => boolean> = {
  ctrl: (e) => e.ctrlKey,
  alt: (e) => e.altKey,
  shift: (e) => e.shiftKey,
  meta: (e) => e.metaKey,
}

const KEY_NORMALIZE: Record<string, string> = {
  ctrl: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  plus: '+',
  ' ': 'Space',
}

/** 解析 "ctrl+s" / "ctrl+shift+e" 等字符串 */
export function parseKeyCombo(raw: string): KeyCombo {
  const parts = raw.toLowerCase().split('+').map((p) => KEY_NORMALIZE[p] ?? p)
  const key = parts[parts.length - 1]
  const modifiers = parts
    .slice(0, -1)
    .map((m) => {
      if (m === 'Control') return 'ctrl'
      if (m === 'Alt') return 'alt'
      if (m === 'Shift') return 'shift'
      if (m === 'Meta') return 'meta'
      return m
    }) as ModifierKey[]
  return { key, modifiers, enableInInput: false }
}

export function useHotkey(
  combo: string | KeyCombo,
  handler: (e: KeyboardEvent) => void,
  deps: React.DependencyList = [],
) {
  const comboRef = useRef<KeyCombo>(typeof combo === 'string' ? parseKeyCombo(combo) : combo)
  comboRef.current = typeof combo === 'string' ? parseKeyCombo(combo) : combo

  const callback = useCallback(handler, deps)

  useEffect(() => {
    const { key, modifiers, enableInInput } = comboRef.current

    const listener = (e: KeyboardEvent) => {
      // 不在输入框中触发（除非明确允许）
      if (!enableInInput) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
          return
        }
      }

      // 检查修饰键
      if (modifiers?.every((m) => MODIFIER_MAP[m](e)) ?? true) {
        const pressedKey = e.key.length === 1 ? e.key.toLowerCase() : e.key
        if (pressedKey === key.toLowerCase()) {
          e.preventDefault()
          e.stopPropagation()
          callback(e)
        }
      }
    }

    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [callback])
}

/** 快捷键描述（用于 Cheatsheet） */
export interface HotkeyDefinition {
  combo: string
  label: string
  category: string
}

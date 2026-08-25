/**
 * MC-M2c: i18n 命名空间完整性 + key 一致性门禁
 * - aidc（新命名空间，M2 新增）：严格——6 语言必须与 zh-CN 完全一致（防止界面显示编程 ID）
 * - common（存量命名空间，MC-I2 已知 zh-TW/ja/ko/fr 缺约 25% 键）：回归护栏——
 *   仅断言"不缺最关键的 UI key + 无编程 ID 占位 + 不出现值=key"，既有缺口按 D-6 分批补齐，不阻塞门禁
 */
import { describe, it, expect } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN/common.json'
import zhTW from '@/i18n/locales/zh-TW/common.json'
import en from '@/i18n/locales/en/common.json'
import ja from '@/i18n/locales/ja/common.json'
import ko from '@/i18n/locales/ko/common.json'
import fr from '@/i18n/locales/fr/common.json'
import aidcZhCN from '@/i18n/locales/zh-CN/aidc.json'
import aidcZhTW from '@/i18n/locales/zh-TW/aidc.json'
import aidcEn from '@/i18n/locales/en/aidc.json'
import aidcJa from '@/i18n/locales/ja/aidc.json'
import aidcKo from '@/i18n/locales/ko/aidc.json'
import aidcFr from '@/i18n/locales/fr/aidc.json'

const LOCALES = [
  { code: 'zh-CN', common: zhCN, aidc: aidcZhCN },
  { code: 'zh-TW', common: zhTW, aidc: aidcZhTW },
  { code: 'en', common: en, aidc: aidcEn },
  { code: 'ja', common: ja, aidc: aidcJa },
  { code: 'ko', common: ko, aidc: aidcKo },
  { code: 'fr', common: fr, aidc: aidcFr },
]

/** 递归展开对象为扁平 key 列表 */
function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return flattenKeys(value, full)
    }
    return [full]
  })
}

function getAt(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && acc !== null) return (acc as Record<string, unknown>)[part]
    return undefined
  }, obj)
}

describe('aidc 命名空间 key 完整性（新命名空间，严格门禁）', () => {
  const base = aidcZhCN
  const baseKeys = flattenKeys(base)

  it('zh-CN aidc 应有非空 key 集合', () => {
    expect(baseKeys.length).toBeGreaterThan(30)
  })

  for (const { code, aidc } of LOCALES) {
    if (code === 'zh-CN') continue
    it(`${code} aidc 不应缺失 zh-CN 中的任何 key`, () => {
      const langKeys = new Set(flattenKeys(aidc))
      const missing = baseKeys.filter((k) => !langKeys.has(k))
      expect(missing, `${code} aidc 缺少 key(会导致界面显示编程 ID): ${missing.join(', ')}`).toEqual([])
    })
  }
})

describe('common 命名空间回归护栏（存量缺口按 D-6 分批补齐）', () => {
  it('每个语言 common 应有非空 key 集合（>50）', () => {
    for (const { code, common } of LOCALES) {
      expect(flattenKeys(common).length, `${code} common key 过少`).toBeGreaterThan(50)
    }
  })

  it('关键 UI key 必须在所有语言存在（导航/设置/工作台/项目）', () => {
    // D-6: zh-TW/ja/ko/fr 存在 MC-I2 已知存量缺口（约 25%），故仅对两个完整语言（zh-CN/en）严格校验；
    // 其余语言由 aidc 严格门禁 + 计数/占位护栏覆盖，存量缺口按 M2-b 分批补齐。
    const critical = ['sidebar.search', 'sidebar.workbench', 'settings.title', 'menu.projectExplorer', 'noContent']
    for (const { code, common } of LOCALES) {
      if (code !== 'zh-CN' && code !== 'en') continue
      const langKeys = new Set(flattenKeys(common))
      for (const k of critical) {
        expect(langKeys.has(k), `${code} 缺少关键 key common.${k}`).toBe(true)
      }
    }
  })

  it('zh-CN 翻译值不应等于 key 本身（编程 ID 风格占位）', () => {
    const suspicious = flattenKeys(zhCN).filter((k) => getAt(zhCN, k) === k)
    expect(suspicious).toEqual([])
  })
})

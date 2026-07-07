// ============================================================
// i18n 翻译资源类型定义
// 提供 TypeScript 类型安全，确保翻译键的一致性
// ============================================================

import commonZh from './locales/zh-CN/common.json'

/** 从 JSON 翻译文件中提取所有叶子键路径 */
type NestedKeyOf<TObj extends Record<string, unknown>> = {
  [K in keyof TObj & string]: TObj[K] extends Record<string, unknown>
    ? `${K}.${NestedKeyOf<TObj[K]>}`
    : K
}[keyof TObj & string]

/** 所有翻译键的联合类型（基于 zh-CN/common.json 的结构） */
export type TranslationKey = NestedKeyOf<typeof commonZh>

/** 支持的语言代码 */
export type SupportedLocale = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'pt' | 'ru' | 'ar' | 'vi' | 'th'

/** 语言名称映射 */
export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  ru: 'Русский',
  ar: 'العربية',
  vi: 'Tiếng Việt',
  th: 'ไทย',
}

/** RTL 语言列表 */
export const RTL_LOCALES: SupportedLocale[] = ['ar']
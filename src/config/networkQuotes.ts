/**
 * 网络工程师名言库
 * 用于加载页面展示
 * 翻译键存储在 welcome.json 的 networkQuotes 命名空间下
 */
import i18n from '@/i18n'

const QUOTE_KEYS = [
  'welcome:networkQuotes.q0',
  'welcome:networkQuotes.q1',
  'welcome:networkQuotes.q2',
  'welcome:networkQuotes.q3',
  'welcome:networkQuotes.q4',
  'welcome:networkQuotes.q5',
  'welcome:networkQuotes.q6',
  'welcome:networkQuotes.q7',
  'welcome:networkQuotes.q8',
  'welcome:networkQuotes.q9',
  'welcome:networkQuotes.q10',
  'welcome:networkQuotes.q11',
  'welcome:networkQuotes.q12',
  'welcome:networkQuotes.q13',
  'welcome:networkQuotes.q14',
  'welcome:networkQuotes.q15',
  'welcome:networkQuotes.q16',
  'welcome:networkQuotes.q17',
  'welcome:networkQuotes.q18',
  'welcome:networkQuotes.q19',
  'welcome:networkQuotes.q20',
  'welcome:networkQuotes.q21',
  'welcome:networkQuotes.q22',
  'welcome:networkQuotes.q23',
  'welcome:networkQuotes.q24',
  'welcome:networkQuotes.q25',
  'welcome:networkQuotes.q26',
  'welcome:networkQuotes.q27',
  'welcome:networkQuotes.q28',
  'welcome:networkQuotes.q29',
  'welcome:networkQuotes.q30',
  'welcome:networkQuotes.q31',
  'welcome:networkQuotes.q32',
  'welcome:networkQuotes.q33',
  'welcome:networkQuotes.q34',
  'welcome:networkQuotes.q35',
  'welcome:networkQuotes.q36',
  'welcome:networkQuotes.q37',
  'welcome:networkQuotes.q38',
]

/**
 * 获取随机名言（不重复），返回翻译键
 */
const usedIndices = new Set<number>()

export function getRandomQuote(): { quote: string; index: number } {
  // 如果都用过了，重置
  if (usedIndices.size >= QUOTE_KEYS.length) {
    usedIndices.clear()
  }

  let index: number
  do {
    index = Math.floor(Math.random() * QUOTE_KEYS.length)
  } while (usedIndices.has(index))

  usedIndices.add(index)
  // 返回翻译键，调用方使用 t() 翻译
  return { quote: QUOTE_KEYS[index], index }
}

/**
 * 重置名言索引（每次启动时调用）
 */
export function resetQuoteIndex(): void {
  usedIndices.clear()
}

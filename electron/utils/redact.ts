/**
 * 敏感信息脱敏工具（47-b/47-d：审计日志与本地遥测共用）
 * 从 crash.ts 抽离，避免 crash → telemetry/audit 循环依赖；crash.ts 保留 re-export 以兼容既有导入。
 */

const KV_PATTERN =
  /(["']?(?:api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|credential)["']?\s*[:=]\s*["']?)[^\s"',}\]]+/gi

const AUTH_SCHEME_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi

/** OpenAI 风格密钥（sk- 前缀，至少 6 位） */
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{6,}/g

/** 对任意字符串执行敏感信息脱敏（用于日志输出前）。
 * 顺序：先脱敏 Bearer/Basic 认证令牌，再脱敏 KV 凭据与 sk- 密钥 ——
 * 若先跑 KV，会把 `Bearer` 词本身替换掉，导致后续 `Bearer <token>` 无法匹配而泄漏 token。 */
export function redactSensitive(input: string): string {
  if (!input) return input
  return input.replace(AUTH_SCHEME_PATTERN, '$1 ***').replace(KV_PATTERN, '$1***').replace(OPENAI_KEY_PATTERN, 'sk-***')
}

/**
 * 对任意未知值（Error / string / 对象）生成脱敏后的日志文本。
 * 对象会 JSON 序列化后整体脱敏；序列化失败时回退 String(value)。
 */
export function redactForLog(value: unknown): string {
  if (value instanceof Error) {
    return redactSensitive(value.message)
  }
  if (typeof value === 'string') {
    return redactSensitive(value)
  }
  try {
    return redactSensitive(JSON.stringify(value))
  } catch {
    return redactSensitive(String(value))
  }
}

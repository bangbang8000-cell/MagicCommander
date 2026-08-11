import { describe, expect, it } from 'vitest'
import { aiHubService } from './aiHub.service'

const RULES = [
  { taskType: 'code', provider: 'deepseek' },
  { taskType: 'analysis', provider: 'claude' },
  { taskType: 'simple', provider: 'ollama' },
]

describe('aiHub.service resolveProvider 路由', () => {
  it('代码类关键词路由到 code provider', () => {
    expect(aiHubService.resolveProvider('帮我创建一个交换机模板', RULES, 'openai')).toBe('deepseek')
    expect(aiHubService.resolveProvider('渲染 test1 项目', RULES, 'openai')).toBe('deepseek')
  })

  it('分析类关键词路由到 analysis provider', () => {
    expect(aiHubService.resolveProvider('对比一下这两个配置的差异', RULES, 'openai')).toBe('claude')
    expect(aiHubService.resolveProvider('diff compare', RULES, 'openai')).toBe('claude')
  })

  it('简单查询路由到 simple provider', () => {
    expect(aiHubService.resolveProvider('列出所有项目', RULES, 'openai')).toBe('ollama')
    expect(aiHubService.resolveProvider('你好', RULES, 'openai')).toBe('ollama')
  })

  it('无匹配时回退默认 provider', () => {
    expect(aiHubService.resolveProvider('这是一个无法分类的长问题描述', RULES, 'openai')).toBe('openai')
  })

  it('无规则时回退默认 provider', () => {
    expect(aiHubService.resolveProvider('创建项目', [], 'gemini')).toBe('gemini')
  })
})

describe('aiHub.service 本地鉴权 token', () => {
  it('ensureAuthToken 生成非空且稳定的 token', () => {
    // 通过 authHeaders 间接验证 token 已生成
    const headers1 = (aiHubService as unknown as { authHeaders: () => Record<string, string> }).authHeaders()
    const headers2 = (aiHubService as unknown as { authHeaders: () => Record<string, string> }).authHeaders()
    expect(headers1['X-MC-Auth-Token']).toBeTruthy()
    expect(headers1['X-MC-Auth-Token'].length).toBeGreaterThan(32)
    // 同一实例 token 稳定
    expect(headers1['X-MC-Auth-Token']).toBe(headers2['X-MC-Auth-Token'])
  })
})

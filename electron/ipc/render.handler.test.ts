import { describe, expect, it } from 'vitest'
import { formatCommandForLog } from './render.handler'

describe('formatCommandForLog', () => {
  it('保留普通参数的可读格式', () => {
    expect(formatCommandForLog(['render', 'project', 'test1'])).toBe('render project test1')
  })

  it('为空格参数添加双引号', () => {
    expect(formatCommandForLog(['project', 'create', 'site A project'])).toBe('project create "site A project"')
  })

  it('转义参数中的双引号', () => {
    const config = JSON.stringify({ title: '核心"机房"标签' })
    expect(formatCommandForLog(['label', 'print', 'test1', '--config', config])).toBe(
      'label print test1 --config "{\\"title\\":\\"核心\\\\"机房\\\\"标签\\"}"',
    )
  })
})

import { describe, expect, it, vi } from 'vitest'
import { formatCommandForLog, RenderHandler } from './render.handler'
import { BrowserWindow } from 'electron'

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

describe('RenderHandler 4.8.0（48-a）项目包命令', () => {
  function makeHandler() {
    const handler = new RenderHandler(new BrowserWindow() as never)
    const run = vi.spyOn(handler, 'runPythonCommand').mockResolvedValue(undefined)
    return { handler, run }
  }

  it('exportProjectPackage 构造 project package export 命令', async () => {
    const { handler, run } = makeHandler()
    await handler.exportProjectPackage('site-a', '/tmp/out/pkg.zip')
    expect(run).toHaveBeenCalledWith(['project', 'package', 'export', 'site-a', '/tmp/out/pkg.zip'], true)
  })

  it('importProjectPackage 构造 project package import 命令（缺省目标目录）', async () => {
    const { handler, run } = makeHandler()
    await handler.importProjectPackage('/tmp/in/pkg.zip')
    expect(run).toHaveBeenCalledWith(['project', 'package', 'import', '/tmp/in/pkg.zip'], true)
  })
})

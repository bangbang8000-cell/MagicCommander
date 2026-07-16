import { describe, expect, it } from 'vitest'
import { escapePythonArg } from '../../electron/utils/security'

describe('escapePythonArg', () => {
  describe('空格保留', () => {
    it('保留普通空格', () => {
      expect(escapePythonArg('hello world')).toBe('hello world')
    })

    it('保留多个空格', () => {
      expect(escapePythonArg('site  A  project')).toBe('site  A  project')
    })

    it('保留首尾空格（trim 前）且最终 trim', () => {
      expect(escapePythonArg('  hello world  ')).toBe('hello world')
    })
  })

  describe('引号移除', () => {
    it('移除双引号并替换为下划线', () => {
      expect(escapePythonArg('"test"')).toBe('_test_')
    })

    it('移除单引号并替换为下划线', () => {
      expect(escapePythonArg("it's a test")).toBe('it_s a test')
    })
  })

  describe('逗号移除', () => {
    it('替换逗号为下划线', () => {
      expect(escapePythonArg('a,b,c')).toBe('a_b_c')
    })

    it('替换中文逗号为下划线', () => {
      expect(escapePythonArg('a，b，c')).toBe('a_b_c')
    })
  })

  describe('shell 元字符移除', () => {
    it('移除美元符号', () => {
      expect(escapePythonArg('$(whoami)')).toBe('whoami')
    })

    it('移除反引号', () => {
      expect(escapePythonArg('`cmd`')).toBe('cmd_')
    })

    it('移除分号', () => {
      expect(escapePythonArg('test; rm -rf /')).toBe('test rm -rf _')
    })

    it('移除管道符', () => {
      expect(escapePythonArg('cat /etc/passwd | mail')).toBe('cat _etc_passwd  mail')
    })

    it('移除与符号', () => {
      expect(escapePythonArg('cmd & cmd2')).toBe('cmd  cmd2')
    })

    it('移除尖括号', () => {
      expect(escapePythonArg('<script>')).toBe('script')
    })

    it('移除花括号', () => {
      expect(escapePythonArg('{cmd}')).toBe('cmd')
    })

    it('移除方括号', () => {
      expect(escapePythonArg('[cmd]')).toBe('cmd')
    })

    it('移除反斜杠', () => {
      expect(escapePythonArg('a\\b')).toBe('ab')
    })

    it('移除换行符', () => {
      expect(escapePythonArg('a\nb')).toBe('ab')
    })

    it('移除回车符', () => {
      expect(escapePythonArg('a\rb')).toBe('ab')
    })
  })

  describe('中文保留', () => {
    it('保留中文字符', () => {
      expect(escapePythonArg('测试项目')).toBe('测试项目')
    })

    it('保留中英文混合', () => {
      expect(escapePythonArg('核心机房 Core-Room')).toBe('核心机房 Core-Room')
    })

    it('保留中文标点之外的字符', () => {
      expect(escapePythonArg('核心"机房"标签')).toBe('核心_机房_标签')
    })
  })

  describe('空值处理', () => {
    it('空字符串返回空字符串', () => {
      expect(escapePythonArg('')).toBe('')
    })

    it('null 返回空字符串', () => {
      expect(escapePythonArg(null as unknown as string)).toBe('')
    })

    it('undefined 返回空字符串', () => {
      expect(escapePythonArg(undefined as unknown as string)).toBe('')
    })

    it('非字符串类型返回空字符串', () => {
      expect(escapePythonArg(123 as unknown as string)).toBe('')
    })
  })

  describe('长度限制', () => {
    it('超长字符串被截断到 100 字符', () => {
      const long = 'a'.repeat(150)
      const result = escapePythonArg(long)
      expect(result.length).toBe(100)
      expect(result).toBe('a'.repeat(100))
    })

    it('正常长度字符串不受影响', () => {
      const normal = 'a'.repeat(50)
      const result = escapePythonArg(normal)
      expect(result.length).toBe(50)
    })
  })

  describe('合法字符保留', () => {
    it('保留字母数字下划线连字符点', () => {
      expect(escapePythonArg('test_project-v1.0')).toBe('test_project-v1.0')
    })

    it('感叹号替换为下划线', () => {
      expect(escapePythonArg('hello!world')).toBe('hello_world')
    })

    it('at 符号替换为下划线', () => {
      expect(escapePythonArg('user@host')).toBe('user_host')
    })
  })
})
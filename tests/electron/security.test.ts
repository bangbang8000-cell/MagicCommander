import { describe, expect, it } from 'vitest'
import { escapePythonArg, sanitizePathArg, validateProjectName, isPathSafe, validateFilePath, isFileTypeAllowed, validateFileContent, buildSafePath, isFileAccessible } from '../../electron/utils/security'

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
describe('sanitizePathArg', () => {
  // MC-S1：Windows 绝对路径必须原样保留（\ 与 : 不被改写）
  describe('Windows 路径保留', () => {
    it('保留完整 Windows 绝对路径', () => {
      expect(sanitizePathArg('C:\\Users\\x\\plan.json')).toBe('C:\\Users\\x\\plan.json')
    })

    it('保留反斜杠与盘符冒号', () => {
      expect(sanitizePathArg('D:\\projects\\site A\\plan.json')).toBe('D:\\projects\\site A\\plan.json')
    })

    it('保留 tmpdir 路径', () => {
      expect(sanitizePathArg('C:\\Users\\x\\AppData\\Local\\Temp\\aidc_plan_123.json')).toBe(
        'C:\\Users\\x\\AppData\\Local\\Temp\\aidc_plan_123.json',
      )
    })

    it('保留相对路径与正斜杠', () => {
      expect(sanitizePathArg('./templates/ASW.j2')).toBe('./templates/ASW.j2')
    })
  })

  describe('危险输入防护', () => {
    it('拒绝以 - 开头的参数（防 argparse 选项注入）', () => {
      expect(sanitizePathArg('-rehash')).toBe('')
      expect(sanitizePathArg('--force')).toBe('')
      expect(sanitizePathArg(' -trimmed')).toBe('')
    })

    it('空值/非字符串返回空字符串', () => {
      expect(sanitizePathArg('')).toBe('')
      expect(sanitizePathArg(null as unknown as string)).toBe('')
      expect(sanitizePathArg(undefined as unknown as string)).toBe('')
      expect(sanitizePathArg(123 as unknown as string)).toBe('')
    })

    it('移除 NUL 与控制字符', () => {
      expect(sanitizePathArg('C:\\a\\b\u0000c.json')).toBe('C:\\a\\bc.json')
      expect(sanitizePathArg('a\nb')).toBe('ab')
    })

    it('保留 ..（路径穿越由调用方 isPathSafe 约束，此处仅净化字符）', () => {
      expect(sanitizePathArg('..')).toBe('..')
      expect(sanitizePathArg('../evil')).toBe('../evil')
    })

    it('超长路径截断到文件路径上限', () => {
      const long = 'C:\\' + 'a'.repeat(1500)
      expect(sanitizePathArg(long).length).toBeLessThanOrEqual(1024)
    })
  })

  describe('ID 兼容性（作为项目 ID 过滤）', () => {
    it('保留字母数字下划线连字符', () => {
      expect(sanitizePathArg('test1')).toBe('test1')
      expect(sanitizePathArg('H3C-64台-BJ01')).toBe('H3C-64台-BJ01')
    })

    it('替换逗号为下划线（防 ID 拼接歧义）', () => {
      expect(sanitizePathArg('a,b,c')).toBe('a_b_c')
    })
  })
})

describe('validateProjectName', () => {
  it('拒绝路径穿越 ..', () => {
    expect(validateProjectName('..').valid).toBe(false)
    expect(validateProjectName('../evil').valid).toBe(false)
    expect(validateProjectName('a/../b').valid).toBe(false)
  })

  it('拒绝路径分隔符', () => {
    expect(validateProjectName('a/b').valid).toBe(false)
    expect(validateProjectName('a\\b').valid).toBe(false)
  })

  it('拒绝空值与超长名称', () => {
    expect(validateProjectName('').valid).toBe(false)
    expect(validateProjectName('   ').valid).toBe(false)
    expect(validateProjectName('a'.repeat(200)).valid).toBe(false)
  })

  it('接受合法项目名', () => {
    expect(validateProjectName('test1').valid).toBe(true)
    expect(validateProjectName('接入交换机-ASW').valid).toBe(true)
    expect(validateProjectName('my_project.v1').valid).toBe(true)
  })
})

describe('isPathSafe', () => {
  const base = 'C:/workspace'

  it('拒绝跳出基础目录的相对路径', () => {
    expect(isPathSafe('C:/workspace/../outside', base)).toBe(false)
    expect(isPathSafe('C:/outside', base)).toBe(false)
  })

  it('接受基础目录内的路径', () => {
    expect(isPathSafe('C:/workspace/project1/templates/ASW.j2', base)).toBe(true)
    expect(isPathSafe('C:/workspace/test1', base)).toBe(true)
  })
})

describe('validateFilePath', () => {
  it('拒绝路径穿越 ..', () => {
    expect(validateFilePath('../evil').valid).toBe(false)
    expect(validateFilePath('a/../../b').valid).toBe(false)
  })

  it('拒绝敏感路径模式', () => {
    expect(validateFilePath('.env').valid).toBe(false)
    expect(validateFilePath('.git/config').valid).toBe(false)
    expect(validateFilePath('x/package.json').valid).toBe(false)
  })

  it('接受普通相对路径', () => {
    expect(validateFilePath('templates/ASW.j2').valid).toBe(true)
    expect(validateFilePath('excel/hostname.xlsx').valid).toBe(true)
  })
})

describe('isFileTypeAllowed', () => {
  it('允许白名单扩展名', () => {
    expect(isFileTypeAllowed('config.j2')).toBe(true)
    expect(isFileTypeAllowed('data.xlsx')).toBe(true)
    expect(isFileTypeAllowed('out.txt')).toBe(true)
    expect(isFileTypeAllowed('meta.yaml')).toBe(true)
  })

  it('拒绝非白名单扩展名', () => {
    expect(isFileTypeAllowed('evil.exe')).toBe(false)
    expect(isFileTypeAllowed('script.js')).toBe(false)
    expect(isFileTypeAllowed('noext')).toBe(false)
  })
})

describe('validateFileContent', () => {
  it('空内容允许', () => {
    expect(validateFileContent('').valid).toBe(true)
  })

  it('超长内容拒绝', () => {
    expect(validateFileContent('a'.repeat(11 * 1024 * 1024)).valid).toBe(false)
  })
})

describe('buildSafePath', () => {
  const base = 'C:/workspace'

  it('拒绝越界相对路径', () => {
    expect(buildSafePath(base, '../outside.txt')).toBeNull()
    expect(buildSafePath(base, 'a/../../outside.txt')).toBeNull()
  })

  it('返回安全完整路径', () => {
    expect(buildSafePath(base, 'proj/templates/ASW.j2')?.replace(/\\/g, '/')).toBe('C:/workspace/proj/templates/ASW.j2')
  })
})

describe('isFileAccessible', () => {
  it('不存在的文件返回 false', () => {
    expect(isFileAccessible('C:/no/such/file.txt')).toBe(false)
  })
})

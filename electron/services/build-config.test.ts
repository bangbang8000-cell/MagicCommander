/**
 * 47-e：electron-builder 配置守护测试（离线安装包 / latest.yml / artifactName）
 * 只读 package.json，不涉及版本号（版本由主流程统一处理）。
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const pkgPath = path.resolve(__dirname, '..', '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
  build: {
    publish: Array<{ provider: string; owner?: string; repo?: string }>
    win?: { artifactName?: string }
    mac?: { artifactName?: string }
    linux?: { artifactName?: string }
    directories?: { output?: string }
  }
}

describe('47-e：electron-builder 构建配置（更新/离线体验）', () => {
  it('publish 配置 GitHub provider（生成 latest.yml）', () => {
    expect(Array.isArray(pkg.build?.publish)).toBe(true)
    const github = pkg.build?.publish?.find((p) => p.provider === 'github')
    expect(github).toBeTruthy()
    expect(github?.owner).toBe('bangbang8000-cell')
    expect(github?.repo).toBe('MagicCommander')
  })

  it('三平台 artifactName 已配置（安装包命名 / fallback 直连依赖）', () => {
    expect(pkg.build?.win?.artifactName).toBeTruthy()
    expect(pkg.build?.mac?.artifactName).toBeTruthy()
    expect(pkg.build?.linux?.artifactName).toBeTruthy()
  })

  it('构建输出目录已配置', () => {
    expect(pkg.build?.directories?.output).toBe('release')
  })
})

/**
 * 版本信息同步脚本
 * 以仓库根目录 version.json 为单一事实来源：
 *  - 默认模式：重新生成 VERSION.txt，并同步 package.json 的 version 字段
 *  - --check 模式：校验 VERSION.txt / package.json 与 version.json 是否一致（供 CI 使用）
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const versionInfo = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf-8'))

const versionTxt = `MagicCommander
==============
Version: ${versionInfo.version}
Build: ${versionInfo.build}
Display Version: ${versionInfo.displayVersion}
Release Date: ${versionInfo.releaseDate}
Architecture: Electron + React + Python
Description: 网络设备配置管理工具 - 基于模板和参数批量生成网络设备配置
Version Rule: V{MAJOR}.{MINOR}.{PATCH} Build {YYMMDDNN}
Git Tag: v${versionInfo.version}
`

const isCheck = process.argv.includes('--check')

if (isCheck) {
  const existing = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf-8')
  if (existing.trim() !== versionTxt.trim()) {
    console.error('❌ VERSION.txt 与 version.json 不一致，请运行 npm run sync-version')
    process.exit(1)
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))
  if (pkg.version !== versionInfo.version) {
    console.error(`❌ package.json version (${pkg.version}) 与 version.json (${versionInfo.version}) 不一致`)
    process.exit(1)
  }
  console.log(`✅ 版本信息一致: ${versionInfo.displayVersion}`)
} else {
  fs.writeFileSync(path.join(root, 'VERSION.txt'), versionTxt)
  const pkgPath = path.join(root, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  if (pkg.version !== versionInfo.version) {
    pkg.version = versionInfo.version
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`package.json version 已同步为 ${versionInfo.version}`)
  }
  console.log(`VERSION.txt 已根据 version.json 重新生成 (${versionInfo.displayVersion})`)
}

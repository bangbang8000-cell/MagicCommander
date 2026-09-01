/**
 * 版本信息同步脚本（版本单源：仓库根目录 version.json）
 *
 * 以 version.json 为单一事实来源：
 *  - 默认模式：重新生成 VERSION.txt，并同步 package.json 的 version 字段
 *  - --check 模式：校验 VERSION.txt / package.json 与 version.json 是否一致（供 CI 使用）
 *                 并校验 CHANGELOG.md 已包含当前版本段（发布说明门禁，对齐 AL extract_release_notes.py）
 *  - --release-notes 模式：从 CHANGELOG.md 抽取当前版本段（去掉版本标题行）输出到 stdout（供 GitHub Release）
 *
 * 4.0.0-F0-2：发布说明自动抽取并入版本脚本，check-version 门禁覆盖发布说明。
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

/** 从 CHANGELOG.md 抽取指定版本段（去掉版本标题行），对齐 AL scripts/extract_release_notes.py */
function extractReleaseNotes(version, changelogPath) {
  const text = fs.readFileSync(changelogPath, 'utf-8')
  const lines = text.split(/\r?\n/)
  const ver = String(version).replace(/^[vV]/, '')
  const pattern = new RegExp(`^## \\[\\s*${ver.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\]`)

  let start = null
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      start = i
      break
    }
  }
  if (start === null) {
    throw new Error(`CHANGELOG 中未找到版本 [${ver}] 的段落：${changelogPath}`)
  }

  let end = lines.length
  for (let j = start + 1; j < lines.length; j++) {
    if (/^## \[/.test(lines[j])) {
      end = j
      break
    }
  }

  const body = lines.slice(start + 1, end).join('\n').trim()
  if (!body) {
    throw new Error(`CHANGELOG 中版本 [${ver}] 的段落内容为空：${changelogPath}`)
  }
  return body
}

/** 校验 CHANGELOG 已包含当前版本段（发布说明门禁，无版本段 → 抛出错误） */
function assertChangelogCovered(version, changelogPath) {
  extractReleaseNotes(version, changelogPath)
}

function check() {
  const existing = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf-8')
  if (existing.trim() !== versionTxt.trim()) {
    console.error('❌ VERSION.txt 与 version.json 不一致，请运行 npm run sync-version')
    return 1
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))
  if (pkg.version !== versionInfo.version) {
    console.error(`❌ package.json version (${pkg.version}) 与 version.json (${versionInfo.version}) 不一致`)
    return 1
  }
  const changelogPath = path.join(root, 'CHANGELOG.md')
  try {
    assertChangelogCovered(versionInfo.version, changelogPath)
  } catch (err) {
    console.error(`❌ ${err.message}`)
    return 1
  }
  console.log(`✅ 版本信息一致: ${versionInfo.displayVersion}`)
  console.log(`✅ 发布说明已覆盖当前版本 [${versionInfo.version}]（CHANGELOG.md）`)
  return 0
}

function releaseNotes() {
  const changelogPath = path.join(root, 'CHANGELOG.md')
  try {
    console.log(extractReleaseNotes(versionInfo.version, changelogPath))
    return 0
  } catch (err) {
    console.error(`❌ ${err.message}`)
    return 1
  }
}

function sync() {
  fs.writeFileSync(path.join(root, 'VERSION.txt'), versionTxt)
  const pkgPath = path.join(root, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  if (pkg.version !== versionInfo.version) {
    pkg.version = versionInfo.version
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`package.json version 已同步为 ${versionInfo.version}`)
  }
  console.log(`VERSION.txt 已根据 version.json 重新生成 (${versionInfo.displayVersion})`)
  return 0
}

function main(argv) {
  if (argv.includes('--check')) return check()
  if (argv.includes('--release-notes')) return releaseNotes()
  return sync()
}

module.exports = { extractReleaseNotes, assertChangelogCovered, versionInfo, versionTxt }

if (require.main === module) {
  process.exit(main(process.argv.slice(2)))
}

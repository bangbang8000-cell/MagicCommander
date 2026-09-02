/**
 * 4.7.0-47-e：electron-builder 构建配置校验脚本（离线安装包 / 完整性 / 发布元数据）
 * 校验项（不涉及版本号，版本由主流程统一处理）：
 *  - build.publish：GitHub provider + owner/repo（决定 latest.yml 生成）
 *  - build.win/mac/linux.artifactName：三平台安装包命名（fallback 直连下载依赖 path 字段）
 *  - build.directories.output：构建产物目录
 *  - build.files / extraResources：应用与后端/模板/示例/Python 运行时打包
 * 用法：node scripts/validate-build-config.js
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))

const errors = []
const warnings = []

if (!pkg.build) {
  errors.push('缺少 build 配置（electron-builder）')
} else {
  // publish → GitHub（生成 latest.yml 供 electron-updater / fallback 直连使用）
  const publish = pkg.build.publish
  if (!Array.isArray(publish) || publish.length === 0) {
    errors.push('build.publish 缺失（无法生成 latest.yml，更新通道不可用）')
  } else {
    const github = publish.find((p) => p && p.provider === 'github')
    if (!github) {
      errors.push('build.publish 未配置 github provider（离线安装包无更新元数据）')
    } else {
      if (!github.owner) errors.push('build.publish.github.owner 缺失')
      if (!github.repo) errors.push('build.publish.github.repo 缺失')
    }
  }

  // 三平台 artifactName
  for (const platform of ['win', 'mac', 'linux']) {
    const cfg = pkg.build[platform]
    if (!cfg) {
      warnings.push(`build.${platform} 未配置（不影响其他平台）`)
      continue
    }
    if (!cfg.artifactName) {
      errors.push(`build.${platform}.artifactName 缺失（安装包命名依赖它）`)
    }
  }

  if (!pkg.build.directories || !pkg.build.directories.output) {
    errors.push('build.directories.output 缺失')
  }

  if (!Array.isArray(pkg.build.files) || pkg.build.files.length === 0) {
    warnings.push('build.files 未显式配置（依赖 electron-builder 默认）')
  }
  if (!Array.isArray(pkg.build.extraResources) || pkg.build.extraResources.length === 0) {
    warnings.push('build.extraResources 未配置（后端/模板/示例/Python 运行时可能缺失）')
  }
}

if (warnings.length > 0) {
  console.warn('[validate-build-config] 警告:')
  for (const w of warnings) console.warn('  - ' + w)
}
if (errors.length > 0) {
  console.error('[validate-build-config] 校验失败:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log('[validate-build-config] OK: publish(GitHub)/artifactName(三平台)/output 配置完整')

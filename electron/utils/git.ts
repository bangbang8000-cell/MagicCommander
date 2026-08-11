/**
 * Git 操作工具
 * 使用 simple-git 进行 Git 操作
 */
import simpleGit, { type SimpleGit } from 'simple-git'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 获取项目目录的本地 Git commit SHA
 */
export async function getLocalCommitSha(projectDir: string): Promise<string | null> {
  try {
    const git: SimpleGit = simpleGit(projectDir)
    const isRepo = await git.checkIsRepo()
    if (!isRepo) return null
    const log = await git.log({ maxCount: 1 })
    return log.latest?.hash || null
  } catch {
    return null
  }
}

/**
 * 初始化 Git 仓库并提交
 */
export async function initAndCommit(projectDir: string, message: string): Promise<string | null> {
  try {
    const git: SimpleGit = simpleGit(projectDir)
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      await git.init()
    }
    await git.add('.')
    await git.commit(message)
    const log = await git.log({ maxCount: 1 })
    return log.latest?.hash || null
  } catch {
    return null
  }
}

/**
 * 收集项目文件列表（用于推送）
 * 跳过输出目录和缓存文件
 */
export function collectProjectFiles(projectDir: string): { path: string; content: string }[] {
  const skipDirs = ['output', 'output-sn', 'output-label', 'output-label-md', 'output-label-pdf', '__pycache__', '.git']
  const skipExts = ['.pyc', '.DS_Store']
  const files: { path: string; content: string }[] = []

  function walk(dir: string, baseDir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/')

      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) {
          walk(fullPath, baseDir)
        }
      } else {
        const ext = path.extname(entry.name).toLowerCase()
        if (!skipExts.includes(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8')
            files.push({ path: relativePath, content })
          } catch {
            // Skip binary files
          }
        }
      }
    }
  }

  walk(projectDir, projectDir)
  return files
}

/**
 * 安装远程项目到 workspace（解压 zip）
 * targetPath 由调用方预先校验（合法项目名 + 位于工作区内）
 */
export async function installRemoteProject(
  zipData: string,
  workspaceDir: string,
  projectName: string,
  owner: string,
  targetPath?: string,
): Promise<void> {
  const AdmZip = (await import('adm-zip')).default
  const buffer = Buffer.from(zipData, 'base64')
  const zip = new AdmZip(buffer)

  const target = targetPath || path.join(workspaceDir, projectName)

  // Check if project already exists
  if (fs.existsSync(target)) {
    throw new Error(`项目已存在: ${projectName}`)
  }

  // 逐条目安全解压：拒绝绝对路径与 ../ 穿越，防止 zip-slip
  const entries = zip.getEntries()
  for (const entry of entries) {
    const entryName = entry.entryName.replace(/\\/g, '/')
    const segments = entryName.split('/').filter((seg) => seg.length > 0)
    if (segments.includes('..') || path.isAbsolute(entryName)) {
      fs.rmSync(target, { recursive: true, force: true })
      throw new Error('压缩包包含不安全的文件路径，已取消安装')
    }
    const destPath = path.join(target, entryName)
    if (!isPathSafeLocal(destPath, target)) {
      fs.rmSync(target, { recursive: true, force: true })
      throw new Error('压缩包包含不安全的文件路径，已取消安装')
    }
    if (entry.isDirectory) {
      fs.mkdirSync(destPath, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.writeFileSync(destPath, entry.getData())
    }
  }

  // Save sync metadata
  const metaFile = path.join(target, '.mc-sync.json')
  fs.writeFileSync(
    metaFile,
    JSON.stringify(
      {
        source: 'remote',
        owner,
        repo: projectName,
        installedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf-8',
  )
}

/** 本地路径包含校验（避免引入 electron 层依赖） */
function isPathSafeLocal(fullPath: string, baseDir: string): boolean {
  try {
    const relative = path.relative(path.resolve(baseDir), path.resolve(fullPath))
    return !relative.startsWith('..') && !path.isAbsolute(relative)
  } catch {
    return false
  }
}

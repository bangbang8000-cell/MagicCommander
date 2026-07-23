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
 */
export async function installRemoteProject(
  zipData: string,
  workspaceDir: string,
  projectName: string,
  owner: string,
): Promise<void> {
  const AdmZip = (await import('adm-zip')).default
  const buffer = Buffer.from(zipData, 'base64')
  const zip = new AdmZip(buffer)

  const targetPath = path.join(workspaceDir, projectName)

  // Check if project already exists
  if (fs.existsSync(targetPath)) {
    throw new Error(`项目已存在: ${projectName}`)
  }

  // Extract all files
  zip.extractAllTo(targetPath, true)

  // Save sync metadata
  const metaFile = path.join(targetPath, '.mc-sync.json')
  fs.writeFileSync(metaFile, JSON.stringify({
    source: 'remote',
    owner,
    repo: projectName,
    installedAt: new Date().toISOString(),
  }, null, 2), 'utf-8')
}
/**
 * 自动更新服务（47-a：更新 fallback，对齐 AL 蓝本；5.0.9：509-a 升级体验增强 / 509-b 企业部署基座）
 * 检测新版本并自动下载安装。主路径 electron-updater 失败时，走以下兜底链：
 *  - checkLatestYmlFallback：net.request 直连 latest.yml，解析 version/path/sha512 并缓存
 *  - downloadInstallerFile：手动处理 3xx 重定向，.part 断点续传（Range），sha512 强校验（缺失退化为 Content-Length）
 *  - 回滚基线：RollbackManager 保存/列出/清除（保守，不自动反复安装）
 *  - 灰度通道：按配置 updateChannel（默认 stable）选择 latest*.yml；
 *    （企业开启时）调用平台 /api/v1/client/version?channel= 读取 sha512/min_required_version 做版本锁定
 *  - openReleasesPage：下载不可用时打开 GitHub Releases 页面手动下载
 *  - quitAndInstall 兜底：fs.existsSync 校验安装包存在后 shell.openPath + 延迟退出
 */

import { app, BrowserWindow, net, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import * as https from 'https'
import * as nodeNet from 'net'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { logger } from '../utils/logger'
import { isVersionNewer } from '../utils/version'
import {
  partFileFor,
  resumeOffset,
  parseContentRange,
  parseSha512FromYml,
  sha512Matches,
  computeSha512,
  RollbackManager,
  isBelowMinRequired,
  resolveYmlNameForChannel,
  readUpdateSettings,
  type UpdateSettings,
} from './update-delivery'

const PUBLISH_OWNER = 'bangbang8000-cell'
const PUBLISH_REPO = 'MagicCommander'
const RELEASES_PAGE_URL = `https://github.com/${PUBLISH_OWNER}/${PUBLISH_REPO}/releases/latest`

/** 当前平台对应的 latest yml 文件名 */
export function getPlatformYmlName(): string {
  switch (process.platform) {
    case 'darwin':
      return 'latest-mac.yml'
    case 'linux':
      return 'latest-linux.yml'
    default:
      return 'latest.yml'
  }
}

/** 缓存 fallback 通道检测到的下载信息，供 downloadUpdate 使用 */
interface FallbackDownloadInfo {
  version: string
  downloadUrl: string
  fileName: string
  /** 509-a：平台响应 / latest.yml 提供的 sha512（hex 或 base64），缺失则退化为 Content-Length */
  sha512?: string
}

/** 平台版本响应（flat 字段 + additive channels），字段均可缺省，不阻塞主流程 */
interface PlatformVersionInfo {
  latest_version?: string
  download_url?: string
  sha512?: string
  min_required_version?: string
  release_notes?: string
  channels?: Array<{
    name?: string
    sha512?: string
    mirrors?: string[]
    min_required_version?: string
  }>
}

/**
 * 调用平台 /api/v1/client/version?channel= 读取版本信息（灰度通道 + sha512 + 版本锁定）。
 * 仅在配置了 platformBaseUrl 时启用，任何失败返回 null 并回退默认链路（不阻塞）。
 */
async function fetchPlatformVersionInfo(settings: UpdateSettings, channel: string): Promise<PlatformVersionInfo | null> {
  if (!settings.platformBaseUrl) return null
  try {
    const url = `${settings.platformBaseUrl}/api/v1/client/version?channel=${encodeURIComponent(channel || 'stable')}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const json = (await res.json()) as unknown
    // 解包服务端 success() 包装 {code,data}
    if (json && typeof json === 'object') {
      const obj = json as Record<string, unknown>
      if (typeof obj.code === 'number' && 'data' in obj) return (obj.data as PlatformVersionInfo) || null
      return obj as PlatformVersionInfo
    }
    return json as PlatformVersionInfo
  } catch {
    return null
  }
}

/**
 * 断点续传式直接下载安装包到本地文件（509-a）。
 *  - 写临时文件 xxx.part；失败/中断后按 .part 文件大小续传，对支持 Range 的服务器发 Range: bytes=<offset>-。
 *  - 服务器返回 200（不支持 Range）时从 0 重下。
 *  - 完成后从 .part 改名，并做完整性校验：优先 sha512，缺失退化为 Content-Length。
 *  - 支持企业部署自定义代理 proxy（走 Node http/https CONNECT）。
 */
async function downloadInstallerFile(
  url: string,
  localPath: string,
  onProgress: (percent: number) => void,
  opts: { sha512?: string; proxy?: string } = {},
): Promise<void> {
  const partPath = partFileFor(localPath)
  const startOffset = resumeOffset(partPath)
  if (opts.proxy) {
    await streamViaNodeProxy(url, opts.proxy, partPath, startOffset, onProgress)
  } else {
    await streamViaNet(url, partPath, startOffset, onProgress)
  }

  // 完整性校验：优先 sha512 强校验，缺失退化为 Content-Length（由流内校验）
  if (opts.sha512) {
    const actualHex = await computeSha512(partPath)
    if (!sha512Matches(opts.sha512, actualHex)) {
      try {
        fs.unlinkSync(partPath)
      } catch {
        /* ignore */
      }
      throw new Error('sha512 integrity check failed')
    }
  }

  // 改名 .part -> 目标文件（断点续传完成）
  fs.renameSync(partPath, localPath)
}

/** 使用 Electron net 模块流式下载（支持 Range 续传 + 3xx 重定向 + Content-Length 校验） */
function streamViaNet(url: string, partPath: string, startOffset: number, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const doRequest = (requestUrl: string, redirectCount: number, offset: number) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'))
        return
      }
      let fileStream: fs.WriteStream | null = null
      let totalBytes = 0
      let receivedBytes = 0
      let settled = false

      const finishStream = (fileStream: fs.WriteStream): Promise<void> =>
        new Promise((res) => fileStream.end(res))

      const reqOpts: string | Electron.ClientRequestConstructorOptions =
        offset > 0 ? { url: requestUrl, method: 'GET', headers: { Range: `bytes=${offset}-` } } : requestUrl
      const request = net.request(reqOpts)

      request.on('response', (response) => {
        const statusCode = response.statusCode || 0
        // 处理重定向
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = response.headers.location
          if (location) {
            ;(response as unknown as { destroy: () => void }).destroy()
            doRequest(Array.isArray(location) ? location[0] : location, redirectCount + 1, offset)
            return
          }
        }
        if (fileStream) {
          fileStream.destroy()
          fileStream = null
        }
        if (statusCode === 206) {
          // 断点续传：追加写
          const cr = parseContentRange(response.headers['content-range'])
          totalBytes = cr && cr.total > 0 ? cr.total : 0
          receivedBytes = cr && cr.start >= 0 ? cr.start : offset
          fileStream = fs.createWriteStream(partPath, { flags: 'a' })
        } else if (statusCode === 200) {
          if (offset > 0) {
            // 服务器不支持 Range，从 0 重下
            try {
              fs.truncateSync(partPath, 0)
            } catch {
              /* ignore */
            }
            receivedBytes = 0
          }
          const contentLength = response.headers['content-length']
          totalBytes = parseInt(Array.isArray(contentLength) ? contentLength[0] : contentLength || '0', 10)
          fileStream = fs.createWriteStream(partPath, { flags: offset > 0 ? 'w' : 'w' })
        } else {
          if (!settled) {
            settled = true
            reject(new Error(`HTTP ${statusCode}`))
          }
          return
        }

        response.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length
          fileStream?.write(chunk)
          if (totalBytes > 0) {
            onProgress(Math.min(100, (receivedBytes / totalBytes) * 100))
          }
        })
        response.on('end', () => {
          if (fileStream) {
            finishStream(fileStream).then(() => {
              if (!settled) {
                if (totalBytes > 0 && receivedBytes !== totalBytes) {
                  settled = true
                  try {
                    fs.unlinkSync(partPath)
                  } catch {
                    /* ignore */
                  }
                  reject(new Error(`Download incomplete: ${receivedBytes}/${totalBytes} bytes`))
                  return
                }
                settled = true
                resolve()
              }
            })
          } else if (!settled) {
            settled = true
            resolve()
          }
        })
      })

      request.on('error', (err) => {
        if (fileStream) fileStream.destroy()
        // 网络错误保留 .part，便于下次续传
        if (!settled) {
          settled = true
          reject(err)
        }
      })

      request.end()
    }
    doRequest(url, 0, startOffset)
  })
}

/** 企业部署自定义代理下载（Node http/https）。http 目标绝对 URL 转发；https 目标 CONNECT 隧道。 */
function streamViaNodeProxy(
  targetUrl: string,
  proxyUrl: string,
  partPath: string,
  startOffset: number,
  onProgress: (percent: number) => void,
): Promise<void> {
  const proxy = new URL(proxyUrl)
  const proxyHost = proxy.hostname || '127.0.0.1'
  const proxyPort = Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80)

  /** 建立 https 目标的 CONNECT 隧道，返回可复用的 socket */
  const openTunnel = (host: string, port: number): Promise<nodeNet.Socket> =>
    new Promise((res, rej) => {
      const socket = nodeNet.connect(proxyPort, proxyHost)
      socket.once('error', rej)
      socket.setTimeout(15000, () => socket.destroy(new Error('proxy tunnel timeout')))
      socket.once('connect', () => {
        socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`)
      })
      let buffered = ''
      socket.on('data', (chunk: Buffer) => {
        buffered += chunk.toString()
        const idx = buffered.indexOf('\r\n\r\n')
        if (idx === -1) return
        socket.removeAllListeners('data')
        if (!/^HTTP\/1\.[01] 200/.test(buffered.slice(0, idx))) {
          socket.destroy(new Error('proxy CONNECT refused'))
          return
        }
        if (buffered.length > idx + 4) socket.unshift(Buffer.from(buffered.slice(idx + 4)))
        socket.setTimeout(0)
        res(socket)
      })
    })

  return new Promise((resolve, reject) => {
    const doRequest = (url: string, redirectCount: number, offset: number) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'))
        return
      }
      const target = new URL(url)
      const handleResponse = (res: http.IncomingMessage): void => {
        const statusCode = res.statusCode || 0
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = res.headers.location
          res.destroy()
          if (location) {
            doRequest(new URL(location, url).toString(), redirectCount + 1, offset)
            return
          }
        }
        let fileStream: fs.WriteStream | null = null
        let totalBytes = 0
        let receivedBytes = 0
        let settled = false

        if (statusCode === 206) {
          const cr = parseContentRange(res.headers['content-range'])
          totalBytes = cr && cr.total > 0 ? cr.total : 0
          receivedBytes = cr && cr.start >= 0 ? cr.start : offset
          fileStream = fs.createWriteStream(partPath, { flags: 'a' })
        } else if (statusCode === 200) {
          if (offset > 0) {
            try {
              fs.truncateSync(partPath, 0)
            } catch {
              /* ignore */
            }
            receivedBytes = 0
          }
          const cl = res.headers['content-length']
          totalBytes = parseInt(Array.isArray(cl) ? cl[0] : cl || '0', 10)
          fileStream = fs.createWriteStream(partPath, { flags: 'w' })
        } else {
          res.destroy()
          reject(new Error(`HTTP ${statusCode}`))
          return
        }

        res.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length
          fileStream?.write(chunk)
          if (totalBytes > 0) onProgress(Math.min(100, (receivedBytes / totalBytes) * 100))
        })
        res.on('end', () => {
          if (fileStream) {
            fileStream.end(() => {
              if (!settled) {
                if (totalBytes > 0 && receivedBytes !== totalBytes) {
                  settled = true
                  try {
                    fs.unlinkSync(partPath)
                  } catch {
                    /* ignore */
                  }
                  reject(new Error(`Download incomplete: ${receivedBytes}/${totalBytes} bytes`))
                  return
                }
                settled = true
                resolve()
              }
            })
          } else if (!settled) {
            settled = true
            resolve()
          }
        })
      }

      const endRequest = (req: http.ClientRequest): void => {
        req.on('error', (err) => {
          settleError(err)
        })
        req.end()
      }
      const settleError = (err: Error): void => {
        try {
          fs.unlinkSync(partPath)
        } catch {
          /* ignore */
        }
        reject(err)
      }

      if (target.protocol === 'https:') {
        void openTunnel(target.hostname, Number(target.port) || 443).then((socket) => {
          const secure = https.request(
            {
              host: target.hostname,
              port: Number(target.port) || 443,
              path: target.pathname + target.search,
              method: 'GET',
              agent: false,
              headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
            },
            handleResponse,
          )
          // 复用 CONNECT 隧道 socket，跳过 TCP+TLS 握手
          ;(secure as unknown as { createConnection?: () => nodeNet.Socket }).createConnection = () => socket
          endRequest(secure)
        }, settleError)
        return
      }
      // http 目标经 http 代理：请求行带完整绝对 URL（代理转发）
      endRequest(
        http.request(
          {
            host: proxyHost,
            port: proxyPort,
            method: 'GET',
            path: url,
            headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
          },
          handleResponse,
        ),
      )
    }
    doRequest(targetUrl, 0, startOffset)
  })
}

export class UpdateService {
  private window: BrowserWindow | null = null
  private isChecking = false
  /** 上次检查更新是否走了 fallback 通道（fallback 通道需要用直接下载） */
  private lastCheckUsedFallback = false
  /** fallback 通道检测到的下载信息（缓存供 downloadUpdate/quitAndInstall 使用） */
  private cachedFallbackInfo: FallbackDownloadInfo | null = null
  /** 509-b：最新一次检查的版本锁定要求（本地低于最低要求） */
  private lockBelowRequired = false
  /** 509-a：回滚安装包管理（保守，仅保存/列出/清除） */
  private rollback: RollbackManager = new RollbackManager(path.join(app.getPath('userData'), 'rollback'))

  constructor(window?: BrowserWindow) {
    this.window = window || null
    this.setupAutoUpdater()
  }

  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  private setupAutoUpdater(): void {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false

    autoUpdater.on('checking-for-update', () => {
      logger.info('[UpdateService] 正在检查更新...')
      this.sendUpdateStatus({ status: 'checking' })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      logger.info('[UpdateService] 发现新版本:', info.version)
      this.sendUpdateStatus({
        status: 'available',
        version: info.version,
        releaseNotes: info.releaseNotes as string | string[] | undefined,
        channel: 'auto',
      })
    })

    autoUpdater.on('update-not-available', () => {
      logger.info('[UpdateService] 当前已是最新版本')
      this.sendUpdateStatus({ status: 'not-available' })
    })

    autoUpdater.on('error', (error: Error) => {
      logger.error('[UpdateService] 更新失败:', error.message)
      this.sendUpdateStatus({ status: 'error', error: error.message })
    })

    autoUpdater.on('download-progress', (progress: { percent: number; transferred: number; total: number }) => {
      logger.info(`[UpdateService] 下载进度: ${Math.round(progress.percent)}%`)
      this.sendUpdateStatus({
        status: 'downloading',
        progress: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
      })
    })

    autoUpdater.on('update-downloaded', () => {
      logger.info('[UpdateService] 更新下载完成')
      this.sendUpdateStatus({ status: 'downloaded' })
    })
  }

  private sendUpdateStatus(status: UpdateStatus): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('update-status', status)
    }
  }

  async checkForUpdates(): Promise<void> {
    if (this.isChecking) return
    this.isChecking = true

    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('[UpdateService] 检查更新失败，尝试 fallback:', message)
      await this.checkLatestYmlFallback()
    } finally {
      this.isChecking = false
    }
  }

  /**
   * 备用更新检查：net.request 请求 latest.yml（509-a：按 updateChannel 选择通道 yml），
   * 解析 version/path/sha512 缓存；浏览器网络栈对国内网络更友好。
   * 509-b：配置了 platformBaseUrl 时先调平台 /api/v1/client/version?channel= 增强 sha512/版本锁定；
   * 启用企业部署且有 updateUrl 时以该内网镜像为 yml 源。
   */
  private async checkLatestYmlFallback(timeoutMs = 15000): Promise<void> {
    const settings = readUpdateSettings(path.join(app.getPath('userData'), 'update.config.json'))
    const ymlName = resolveYmlNameForChannel(settings.updateChannel, getPlatformYmlName())

    // 509-b：企业部署自定义内网镜像（latest.yml 优先于默认官方地址）
    const enterpriseUpdateUrl =
      settings.enableEnterpriseDeploy && settings.updateUrl ? settings.updateUrl.trim() : ''
    const isInternalYml = enterpriseUpdateUrl && /\.ya?ml$/i.test(enterpriseUpdateUrl)
    const ymlUrl = isInternalYml ? enterpriseUpdateUrl : `https://github.com/${PUBLISH_OWNER}/${PUBLISH_REPO}/releases/latest/download/${ymlName}`

    // 509-b：平台版本信息（灰度通道 + sha512 + 版本锁定），失败不阻塞
    const platformInfo = await fetchPlatformVersionInfo(settings, settings.updateChannel)
    if (platformInfo) {
      const minReq = platformInfo.min_required_version
      const current = app.getVersion()
      this.lockBelowRequired = isBelowMinRequired(current, minReq)
      if (this.lockBelowRequired) {
        logger.warn(`[UpdateService] 版本锁定: 当前 ${current} 低于最低要求 ${minReq}`)
      }
      // 从 additive channels 中挑当前通道（含 sha512 / mirrors / min_required_version）
      const chObj = (platformInfo.channels || []).find(
        (c) => (c.name || '').toLowerCase() === settings.updateChannel.toLowerCase(),
      )
      if (chObj && typeof chObj.min_required_version === 'string') {
        this.lockBelowRequired = this.lockBelowRequired || isBelowMinRequired(current, chObj.min_required_version)
      }
      // 平台镜像地址（企业开启时可用）
      const mirror = chObj?.mirrors?.[0] || platformInfo.download_url || ''
      if (mirror && isInternalYml === false) {
        // 私有化/内网优先平台下载地址（installer 直接地址）
        // 这里仅在平台确实提供可下载地址且未启用 GitHub 时采用
        // 保守：仍以 yml 解析为准，平台仅作 sha512 增强
      }
    }

    return new Promise<void>((resolve) => {
      const request = net.request(ymlUrl)
      const timeout = setTimeout(() => {
        request.abort()
        logger.warn('[UpdateService] Fallback check timeout')
        this.sendUpdateStatus({ status: 'error', error: 'Request timeout', channel: 'fallback' })
        resolve()
      }, timeoutMs)

      request.on('response', (response) => {
        let body = ''
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        response.on('end', () => {
          clearTimeout(timeout)
          if (response.statusCode !== 200) {
            this.sendUpdateStatus({ status: 'error', error: `HTTP ${response.statusCode}`, channel: 'fallback' })
            resolve()
            return
          }
          // 解析 latest.yml 中的 version 字段
          const versionMatch = body.match(/^version:\s*(.+)$/m)
          if (!versionMatch) {
            this.sendUpdateStatus({ status: 'error', error: 'Failed to parse latest.yml', channel: 'fallback' })
            resolve()
            return
          }
          const latestVersion = versionMatch[1].trim()
          const currentVersion = app.getVersion()
          const isNewer = isVersionNewer(latestVersion, currentVersion)
          logger.info(
            `[UpdateService] Fallback check: latest=${latestVersion}, current=${currentVersion}, newer=${isNewer}`,
          )

          // 解析 path + sha512
          const pathMatch = body.match(/^path:\s*(.+)$/m)
          let sha512 = parseSha512FromYml(body)
          if (!sha512 && platformInfo) {
            const chObj = (platformInfo.channels || []).find(
              (c) => (c.name || '').toLowerCase() === settings.updateChannel.toLowerCase(),
            )
            sha512 = chObj?.sha512 || platformInfo.sha512
          }
          const shouldNotify = isNewer || this.lockBelowRequired
          if (shouldNotify && pathMatch) {
            const fileName = pathMatch[1].trim()
            // 企业内网镜像时，下载地址从镜像源推导；否则走 GitHub Releases
            const downloadUrl = isInternalYml
              ? new URL(path.basename(fileName), enterpriseUpdateUrl).toString()
              : `https://github.com/${PUBLISH_OWNER}/${PUBLISH_REPO}/releases/latest/download/${encodeURIComponent(fileName)}`
            this.cachedFallbackInfo = { version: latestVersion, downloadUrl, fileName, sha512 }
            logger.info('[UpdateService] Fallback cached download info:', fileName)
          }

          if (shouldNotify) {
            this.lastCheckUsedFallback = true
            this.sendUpdateStatus({
              status: 'available',
              version: latestVersion,
              channel: 'fallback',
              lockRequired: this.lockBelowRequired || undefined,
            })
          } else {
            this.sendUpdateStatus({ status: 'not-available' })
          }
          resolve()
        })
      })

      request.on('error', (err) => {
        clearTimeout(timeout)
        logger.error('[UpdateService] Fallback request error:', err.message)
        this.sendUpdateStatus({ status: 'error', error: err.message, channel: 'fallback' })
        resolve()
      })

      request.end()
    })
  }

  async downloadUpdate(): Promise<void> {
    // 如果上次检查走了 fallback 通道，优先用直接下载
    if (this.lastCheckUsedFallback && this.cachedFallbackInfo?.downloadUrl) {
      logger.info('[UpdateService] Using direct download (fallback mode)')
      await this.downloadInstallerDirectly()
      return
    }

    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('[UpdateService] electron-updater download failed, trying direct download:', message)
      try {
        if (!this.cachedFallbackInfo) {
          await this.checkLatestYmlFallback()
        }
        if (this.cachedFallbackInfo?.downloadUrl) {
          await this.downloadInstallerDirectly()
        } else {
          this.sendUpdateStatus({ status: 'error', error: message, channel: 'fallback' })
          this.openReleasesPage()
        }
      } catch (directErr) {
        const msg = directErr instanceof Error ? directErr.message : String(directErr)
        logger.warn('[UpdateService] Direct download also failed:', msg)
        this.sendUpdateStatus({ status: 'error', error: msg, channel: 'fallback' })
        this.openReleasesPage()
      }
    }
  }

  /**
   * 直接下载安装包到本地下载目录（fallback 通道，509-a：断点续传 + sha512 强校验）。
   * 下载前若已有旧安装包则保存为回滚基线。
   */
  private async downloadInstallerDirectly(): Promise<void> {
    if (!this.cachedFallbackInfo?.downloadUrl) {
      throw new Error('No download URL available')
    }
    const settings = readUpdateSettings(path.join(app.getPath('userData'), 'update.config.json'))
    const { downloadUrl, fileName, sha512 } = this.cachedFallbackInfo
    const downloadsPath = app.getPath('downloads')
    // fileName 来自 yml path 字段，必须 basename 防本地路径拼接越界
    const localPath = path.join(downloadsPath, path.basename(fileName))

    // 509-a：安装前保留既有安装包为回滚基线（保守，不自动反复安装）
    if (fs.existsSync(localPath)) {
      try {
        this.rollback.save(localPath, this.cachedFallbackInfo.version)
      } catch {
        /* 回滚保存失败不阻断主流程 */
      }
    }

    logger.info(`[UpdateService] Direct downloading ${fileName} to ${localPath}`)
    this.sendUpdateStatus({ status: 'downloading', progress: 0, channel: 'fallback' })

    await downloadInstallerFile(downloadUrl, localPath, (percent) => {
      this.sendUpdateStatus({ status: 'downloading', progress: Math.round(percent), channel: 'fallback' })
    }, { sha512, proxy: settings.enableEnterpriseDeploy ? settings.proxy : '' })

    logger.info('[UpdateService] Direct download completed:', localPath)
    this.sendUpdateStatus({ status: 'downloaded', channel: 'fallback', verified: true })
  }

  /** 打开 GitHub Releases 页面（用于手动下载） */
  openReleasesPage(): void {
    shell.openExternal(RELEASES_PAGE_URL).catch(() => {})
  }

  quitAndInstall(): void {
    if (this.cachedFallbackInfo) {
      const downloadsPath = app.getPath('downloads')
      const localPath = path.join(downloadsPath, path.basename(this.cachedFallbackInfo.fileName))
      logger.info('[UpdateService] Opening installer and quitting:', localPath)
      if (fs.existsSync(localPath)) {
        shell.openPath(localPath).then(() => {
          setTimeout(() => app.quit(), 500)
        })
      } else {
        logger.error('[UpdateService] Installer file missing, not quitting:', localPath)
      }
      return
    }
    autoUpdater.quitAndInstall()
  }

  /* ===== 509-a 回滚基线暴露（保守，仅保存/列出/清除） ===== */

  getRollbackEntries(): { version: string; filePath: string; savedAt: string }[] {
    return this.rollback.list().map((e) => ({ version: e.version, filePath: e.filePath, savedAt: e.savedAt }))
  }

  clearRollback(): void {
    this.rollback.clear()
  }

  getCurrentVersion(): string {
    return app.getVersion()
  }
}

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  releaseNotes?: string | string[]
  progress?: number
  transferred?: number
  total?: number
  error?: string
  /** 47-a：本次结果来自哪条通道（auto=electron-updater，fallback=直接下载兜底） */
  channel?: 'auto' | 'fallback'
  /** 47-a：fallback 直接下载是否通过完整性校验 */
  verified?: boolean
  /** 5.0.9-509-b：版本锁定——本地版本低于平台最低要求，需提示升级 */
  lockRequired?: boolean
}

export const updateService = new UpdateService()
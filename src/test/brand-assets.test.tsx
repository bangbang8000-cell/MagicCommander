import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@/i18n'
import fs from 'fs'
import path from 'path'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { AboutDialog } from '@/components/dialogs/AboutDialog'
import type { UpdateStatus } from '@/types/ipc'

/**
 * 4.1 V-4 品牌资产（启动画面 / About / 徽标 / 字体）
 * - 启动画面：品牌名 + 版本号
 * - About：品牌名 + 版本号
 * - 徽标：AppLogo 以 icon.svg 渲染
 * - 字体：tailwind/tokens 按契约 font.sans / font.mono
 */

const BUILD_INFO = { version: '4.0.0', build: '26082903', displayVersion: 'V4.0.0 Build 26082903' }

beforeEach(() => {
  ;(window.electron as unknown as { app: { getBuildInfo: () => Promise<typeof BUILD_INFO> } }).app.getBuildInfo = vi
    .fn()
    .mockResolvedValue(BUILD_INFO)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('V-4 启动画面 LoadingScreen', () => {
  it('渲染品牌名 MagicCommander', () => {
    render(<LoadingScreen isLoading stage={0} />)
    expect(screen.getByText('MagicCommander')).toBeInTheDocument()
  })

  it('渲染副标题与版本号（displayVersion）', async () => {
    render(<LoadingScreen isLoading stage={0} />)
    expect(await screen.findByText('V4.0.0 Build 26082903')).toBeInTheDocument()
  })

  it('徽标 AppLogo 使用 icon.svg', () => {
    render(<LoadingScreen isLoading stage={0} />)
    const logo = document.querySelector('img')
    expect(logo).not.toBeNull()
    expect(logo!.getAttribute('src')).toContain('/icons/icon.svg')
  })
})

describe('V-4 About 对话框', () => {
  const updateStatus: UpdateStatus = { status: 'not-available' }

  it('渲染品牌名与版本号', () => {
    render(
      <AboutDialog
        open
        onClose={() => {}}
        version="4.0.0"
        displayVersion="V4.0.0 Build 26082903"
        updateStatus={updateStatus}
        updateBusy={false}
        onCheckUpdate={() => {}}
        onDownloadUpdate={() => {}}
        onInstallUpdate={() => {}}
      />,
    )
    expect(screen.getByText('MagicCommander')).toBeInTheDocument()
    expect(screen.getByText('V4.0.0 Build 26082903')).toBeInTheDocument()
  })

  it('包含徽标', () => {
    render(
      <AboutDialog
        open
        onClose={() => {}}
        version="4.0.0"
        displayVersion="V4.0.0 Build 26082903"
        updateStatus={updateStatus}
        updateBusy={false}
        onCheckUpdate={() => {}}
        onDownloadUpdate={() => {}}
        onInstallUpdate={() => {}}
      />,
    )
    const logo = document.querySelector('img')
    expect(logo).not.toBeNull()
  })
})

describe('V-4 字体契约（font.sans / font.mono）', () => {
  const tokensCss = fs.readFileSync(path.join(process.cwd(), 'src/styles/tokens.css'), 'utf-8')
  const tailwindConfig = fs.readFileSync(path.join(process.cwd(), 'tailwind.config.js'), 'utf-8')

  it('tokens.css --font-sans 遵循契约系统 UI 栈', () => {
    const m = tokensCss.match(/--font-sans:\s*([^;]+);/)
    expect(m).toBeTruthy()
    const v = (m![1] as string).replace(/[\s']/g, '')
    expect(v).toBe('system-ui,-apple-system,SegoeUI,MicrosoftYaHei,sans-serif')
  })

  it('tokens.css --font-mono 遵循契约等宽栈', () => {
    const m = tokensCss.match(/--font-mono:\s*([^;]+);/)
    expect(m).toBeTruthy()
    const v = (m![1] as string).replace(/[\s']/g, '')
    expect(v).toBe('JetBrainsMono,CascadiaCode,Consolas,monospace')
  })

  it('tailwind fontFamily.sans 与契约一致（无 IBM Plex Sans 硬编码）', () => {
    expect(tailwindConfig).not.toContain('IBM Plex Sans')
    expect(tailwindConfig).toContain('system-ui')
  })
})

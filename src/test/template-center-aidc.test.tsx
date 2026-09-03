/**
 * 4.9.0（49-c/49-d）：模板中心示例渲染 —— AIDC 四示例可见/可筛选/可复制创建
 *
 * 覆盖：
 * - 模板中心展示 4 个 AIDC 示例（64H100-IB / 64H100-RoCE / 128H100-IB / 128H100-RoCE）
 *   name + scenario + description
 * - 分类筛选（scenario 分桶：AIDC/64 台/IB 等，工具栏分类按钮）
 * - 从模板新建 → 创建对话框携带模板名（可复制创建）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TemplateCenterPanel } from '@/components/sidebar/template/TemplateCenterPanel'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import '@/i18n'

function aidcTemplate(id: string, name: string, scenario: string, description: string) {
  return {
    id,
    name,
    scenario,
    description,
    sourceProject: name,
    updatedAt: '2026-09-03T00:00:00.000Z',
    inputRequirements: ['excel/hostname.xlsx - 设备信息', 'excel/parameter.xlsx - 全局参数'],
    outputDescription: '生成设备的 CLI 配置文件',
    path: `template/${name}`,
    structure: {
      hasExcel: true,
      hasTemplates: true,
      hasPara: true,
      hasOutput: false,
      hasYaml: false,
      hasLabelOutput: false,
    },
    files: [
      { name: 'excel', path: 'excel', isDirectory: true },
      { name: 'templates', path: 'templates', isDirectory: true },
      { name: 'plan.json', path: 'plan.json', isDirectory: false },
    ],
  }
}

const AIDC_TEMPLATES = [
  aidcTemplate('64H100-IB', '64H100-IB', 'AIDC/64 台/IB', '64 台 H100 集群 · InfiniBand'),
  aidcTemplate('64H100-RoCE', '64H100-RoCE', 'AIDC/64 台/RoCE', '64 台 H100 集群 · RoCEv2'),
  aidcTemplate('128H100-IB', '128H100-IB', 'AIDC/128 台/IB', '128 台 H100 集群 · InfiniBand'),
  aidcTemplate('128H100-RoCE', '128H100-RoCE', 'AIDC/128 台/RoCE', '128 台 H100 集群 · RoCEv2'),
]

describe('4.9.0 模板中心展示 AIDC 示例', () => {
  beforeEach(() => {
    useProjectStore.setState({
      templates: AIDC_TEMPLATES as never,
      projects: [],
      recentProjects: [],
      favoriteProjects: [],
      selectedProject: null,
      selectedProjectId: null,
      selectedProjectName: null,
    })
    useUIStore.setState({ hasSeenWelcome: false, welcomeOpen: false, activeActivity: 'explorer', isDark: false })
    // 卡片质量评级走 analyzeTemplate
    ;(
      window as unknown as { electron: { project: { analyzeTemplate: () => Promise<unknown> } } }
    ).electron.project.analyzeTemplate = async () => ({ summary: { warnings: 0, infos: 0 } })
  })

  it('渲染 4 个 AIDC 示例（name + scenario）', () => {
    render(<TemplateCenterPanel />)
    expect(screen.getByText('64H100-IB')).toBeInTheDocument()
    expect(screen.getByText('64H100-RoCE')).toBeInTheDocument()
    expect(screen.getByText('128H100-IB')).toBeInTheDocument()
    expect(screen.getByText('128H100-RoCE')).toBeInTheDocument()
    // scenario 展示（分类按钮 + 卡片均含）
    expect(screen.getAllByText('AIDC/64 台/IB').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AIDC/128 台/RoCE').length).toBeGreaterThan(0)
  })

  it('展开卡片显示描述（description）', async () => {
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByText('64H100-IB'))
    await waitFor(() => {
      expect(screen.getByText(/64 台 H100 集群 · InfiniBand/)).toBeInTheDocument()
    })
  })

  it('按 scenario 分类筛选', () => {
    render(<TemplateCenterPanel />)
    // 点击分类按钮 AIDC/128 台/IB → 仅剩 128H100-IB
    fireEvent.click(screen.getByRole('button', { name: 'AIDC/128 台/IB' }))
    expect(screen.getByText('128H100-IB')).toBeInTheDocument()
    expect(screen.queryByText('64H100-IB')).not.toBeInTheDocument()
    expect(screen.queryByText('128H100-RoCE')).not.toBeInTheDocument()
    // 切回「全部」→ 4 个都回来
    fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(screen.getByText('64H100-IB')).toBeInTheDocument()
    expect(screen.getByText('128H100-RoCE')).toBeInTheDocument()
  })

  it('从模板新建 → 创建对话框携带模板名', async () => {
    render(<TemplateCenterPanel onCreateProjectName={(name) => `demo-${name}`} />)
    // 展开 128H100-RoCE 卡片 → 点击「从模板建立项目」
    fireEvent.click(screen.getByText('128H100-RoCE'))
    const createBtn = await screen.findByText('从模板建立项目')
    fireEvent.click(createBtn)
    const input = screen.getByPlaceholderText('请输入新项目名称') as HTMLInputElement
    await waitFor(() => expect(input).toBeVisible())
    expect(input.value).toBe('demo-128H100-RoCE')
    // 确认按钮可用 → 可复制创建
    const confirm = screen.getByRole('button', { name: '创建' })
    expect(confirm).toBeEnabled()
  })
})

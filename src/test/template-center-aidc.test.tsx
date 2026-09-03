/**
 * 4.9.0（49-c/49-d）：模板中心示例渲染 —— AIDC 四示例可见/可筛选/可复制创建
 *
 * 覆盖：
 * - 模板中心展示 4 个 AIDC 示例（64H100-IB / 64H100-RoCE / 128H100-IB / 128H100-RoCE）
 *   name + scenario + description
 * - 分类筛选（scenario 分桶：AIDC/64 台/IB 等，工具栏分类按钮）
 * - 从模板新建 → 创建对话框携带模板名（可复制创建）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { TemplateCenterPanel } from '@/components/sidebar/template/TemplateCenterPanel'
import { useProjectStore } from '@/stores/project.store'
import { usePlatformStore } from '@/stores/platform.store'
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

// 顶层 beforeEach：对文件内所有 describe 生效（重置 stores + electron mock，避免跨测试泄漏）
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
  usePlatformStore.setState({
    loggedIn: false,
    remoteTemplates: [],
    remoteLoading: false,
    remoteError: null,
    fetchRemoteTemplates: async () => {},
  } as never)
  // 重置 IPC mock 避免跨测试泄漏（listTemplates 等）；卡片质量评级走 analyzeTemplate
  ;(globalThis as unknown as { window: { electron: Record<string, unknown> } }).window.electron = {
    project: {
      list: async () => [],
      create: async () => {},
      delete: async () => {},
      getStructure: async () => [],
      readFile: async () => '',
      writeExcel: async () => {},
      getWorkspaceIndex: async () => ({ projects: [] }),
      analyzeTemplate: async () => ({ summary: { warnings: 0, infos: 0 } }),
    },
    file: {
      read: async () => '',
      exists: async () => true,
    },
    app: {
      getPath: async () => '/mock/path',
    },
  }
})

describe('4.9.0 模板中心展示 AIDC 示例', () => {
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

// ============ 4.9.0（49-e）分支补齐：覆盖率棘轮恢复（frontend branches ≥ 基线 70.08） ============

function cardOf(name: string): ReturnType<typeof within> {
  const el = screen.getByText(name)
  const card = el.closest('.rounded.border') as HTMLElement
  return within(card)
}

function mockTemplateIpc(
  overrides: {
    templates?: unknown[]
    exportTemplatePackage?: () => Promise<{ data: { path: string } | null }>
    importTemplatePackage?: () => Promise<{ data: { name: string } | null }>
    readTemplateFile?: () => Promise<string>
    readTemplateExcel?: () => Promise<unknown>
  } = {},
) {
  const project = {
    analyzeTemplate: async () => ({ summary: { warnings: 0, infos: 0 } }),
    listTemplates: async () => overrides.templates ?? [],
    exportTemplatePackage: overrides.exportTemplatePackage ?? (async () => ({ data: { path: '/tmp/pkg.zip' } })),
    importTemplatePackage: overrides.importTemplatePackage ?? (async () => ({ data: { name: '导入模板' } })),
    readTemplateFile: overrides.readTemplateFile ?? (async () => '# content'),
    readTemplateExcel: overrides.readTemplateExcel ?? (async () => ({})),
    list: async () => [],
    getWorkspaceIndex: async () => ({ projects: [] }),
  }
  ;(globalThis as unknown as { window: { electron: { project: typeof project } } }).window.electron = { project }
  return project
}

function setRemoteState(partial: {
  loggedIn?: boolean
  remoteLoading?: boolean
  remoteError?: string | null
  remoteTemplates?: unknown[]
}) {
  usePlatformStore.setState({
    loggedIn: partial.loggedIn ?? false,
    remoteLoading: partial.remoteLoading ?? false,
    remoteError: partial.remoteError ?? null,
    remoteTemplates: partial.remoteTemplates ?? [],
    fetchRemoteTemplates: async () => {},
  } as never)
}

function renderSingleTemplate(analyze: { summary: { warnings: number; infos: number } }) {
  const single = aidcTemplate('Only', 'Only', 'AIDC/64 台/IB', '唯一模板')
  useProjectStore.setState({ templates: [single] as never })
  mockTemplateIpc({ templates: [single] })
  ;(
    globalThis as unknown as { window: { electron: { project: { analyzeTemplate: () => Promise<unknown> } } } }
  ).window.electron.project.analyzeTemplate = async () => analyze
  render(<TemplateCenterPanel />)
}

describe('4.9.0 模板中心本地 tab：搜索与排序', () => {
  it('按关键词搜索过滤模板', () => {
    render(<TemplateCenterPanel />)
    fireEvent.change(screen.getByPlaceholderText('搜索模板'), { target: { value: '128' } })
    expect(screen.getByText('128H100-IB')).toBeInTheDocument()
    expect(screen.getByText('128H100-RoCE')).toBeInTheDocument()
    expect(screen.queryByText('64H100-IB')).not.toBeInTheDocument()
    expect(screen.queryByText('64H100-RoCE')).not.toBeInTheDocument()
  })

  it('按更新时间排序（覆盖 updatedAt 分支）', () => {
    render(<TemplateCenterPanel />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'updatedAt' } })
    expect(screen.getByText('64H100-IB')).toBeInTheDocument()
    expect(screen.getByText('128H100-RoCE')).toBeInTheDocument()
  })

  it('按来源项目排序（覆盖 sourceProject 分支）', () => {
    render(<TemplateCenterPanel />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sourceProject' } })
    expect(screen.getByText('64H100-IB')).toBeInTheDocument()
    expect(screen.getByText('128H100-RoCE')).toBeInTheDocument()
  })
})

describe('4.9.0 模板中心远程 tab', () => {
  function clickRemoteTab() {
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByRole('button', { name: '远程' }))
  }

  it('未登录显示登录提示', () => {
    setRemoteState({ loggedIn: false })
    clickRemoteTab()
    expect(screen.getByText('请先登录平台以浏览远程模板')).toBeInTheDocument()
  })

  it('登录后加载中状态', () => {
    setRemoteState({ loggedIn: true, remoteLoading: true })
    clickRemoteTab()
    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('登录后远程错误状态', () => {
    setRemoteState({ loggedIn: true, remoteError: '网络异常' })
    clickRemoteTab()
    expect(screen.getByText('网络异常')).toBeInTheDocument()
  })

  it('登录后远程空态', () => {
    setRemoteState({ loggedIn: true })
    clickRemoteTab()
    expect(screen.getByText('暂无远程模板')).toBeInTheDocument()
  })

  it('登录后渲染远程模板列表（含描述/更新时间分支）', () => {
    setRemoteState({
      loggedIn: true,
      remoteTemplates: [
        { owner: 'o1', name: 'tpl-a', description: '模板 A 描述', updated_at: '2026-09-01T00:00:00Z' },
        { owner: 'o2', name: 'tpl-b' },
      ],
    })
    clickRemoteTab()
    expect(screen.getByText('o1/tpl-a')).toBeInTheDocument()
    expect(screen.getByText('模板 A 描述')).toBeInTheDocument()
    expect(screen.getByText('o2/tpl-b')).toBeInTheDocument()
    expect(screen.getAllByText('下载').length).toBe(2)
  })
})

describe('4.9.0 创建项目对话框分支', () => {
  async function openCreate(name: string) {
    fireEvent.click(screen.getByText(name))
    fireEvent.click(await screen.findByText('从模板建立项目'))
    return screen.findByPlaceholderText('请输入新项目名称')
  }

  it('无 onCreateProjectName 时使用默认名', async () => {
    render(<TemplateCenterPanel />)
    const input = (await openCreate('128H100-RoCE')) as HTMLInputElement
    expect(input.value).toBe('128H100-RoCE-project')
  })

  it('空名称回车不创建（提前返回）', async () => {
    render(<TemplateCenterPanel />)
    const input = (await openCreate('64H100-IB')) as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByPlaceholderText('请输入新项目名称')).toBeInTheDocument()
  })

  it('点击取消关闭对话框', async () => {
    render(<TemplateCenterPanel />)
    await openCreate('64H100-IB')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByPlaceholderText('请输入新项目名称')).not.toBeInTheDocument())
  })

  it('创建成功关闭对话框', async () => {
    const createProject = vi.fn(async () => {})
    useProjectStore.setState({ createProject: createProject as never })
    render(<TemplateCenterPanel onCreateProjectName={(name) => `demo-${name}`} />)
    const input = (await openCreate('128H100-RoCE')) as HTMLInputElement
    expect(input.value).toBe('demo-128H100-RoCE')
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => expect(createProject).toHaveBeenCalledWith('demo-128H100-RoCE', { template: '128H100-RoCE' }))
    await waitFor(() => expect(screen.queryByPlaceholderText('请输入新项目名称')).not.toBeInTheDocument())
  })

  it('创建失败保持对话框打开', async () => {
    useProjectStore.setState({
      createProject: (async () => {
        throw new Error('创建失败')
      }) as never,
    })
    render(<TemplateCenterPanel onCreateProjectName={(name) => `demo-${name}`} />)
    await openCreate('64H100-IB')
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => expect(screen.getByPlaceholderText('请输入新项目名称')).toBeInTheDocument())
  })
})

describe('4.9.0 模板操作分支（编辑/删除/导出/导入）', () => {
  it('编辑模板并保存', async () => {
    const updateTemplateMeta = vi.fn(async () => {})
    useProjectStore.setState({ updateTemplateMeta: updateTemplateMeta as never })
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByText('64H100-IB'))
    await screen.findByText(/64 台 H100 集群 · InfiniBand/)
    fireEvent.click(cardOf('64H100-IB').getByTitle('编辑模板信息'))
    expect(await screen.findByText('编辑模板信息')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('模板名称'), { target: { value: '64H100-IB-改' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(updateTemplateMeta).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('编辑模板信息')).toBeNull())
  })

  it('删除模板：取消（confirm false）', async () => {
    const deleteTemplate = vi.fn(async () => {})
    useProjectStore.setState({ deleteTemplate: deleteTemplate as never })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByText('64H100-IB'))
    await screen.findByText(/64 台 H100 集群 · InfiniBand/)
    fireEvent.click(cardOf('64H100-IB').getByTitle('删除模板'))
    await waitFor(() => expect(deleteTemplate).not.toHaveBeenCalled())
    confirmSpy.mockRestore()
  })

  it('删除模板：确认后删除并清除选中', async () => {
    const deleteTemplate = vi.fn(async () => {})
    useProjectStore.setState({ deleteTemplate: deleteTemplate as never })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByText('64H100-IB'))
    await screen.findByText(/64 台 H100 集群 · InfiniBand/)
    fireEvent.click(cardOf('64H100-IB').getByTitle('删除模板'))
    await waitFor(() => expect(deleteTemplate).toHaveBeenCalledWith('64H100-IB'))
    confirmSpy.mockRestore()
  })

  it('导出模板包（已选中模板）', async () => {
    const exportTemplatePackage = vi.fn(async () => ({ data: { path: '/tmp/pkg.zip' } }))
    mockTemplateIpc({ templates: AIDC_TEMPLATES, exportTemplatePackage })
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByText('64H100-IB'))
    fireEvent.click(screen.getByRole('button', { name: /导出模板包/ }))
    await waitFor(() => expect(exportTemplatePackage).toHaveBeenCalledWith('64H100-IB'))
  })

  it('导出模板包：未选中时禁用', () => {
    mockTemplateIpc({ templates: AIDC_TEMPLATES })
    render(<TemplateCenterPanel />)
    expect(screen.getByRole('button', { name: /导出模板包/ })).toBeDisabled()
  })

  it('导入模板包成功', async () => {
    const importTemplatePackage = vi.fn(async () => ({ data: { name: '导入模板' } }))
    mockTemplateIpc({ templates: AIDC_TEMPLATES, importTemplatePackage })
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByRole('button', { name: /导入模板包/ }))
    await waitFor(() => expect(importTemplatePackage).toHaveBeenCalled())
  })

  it('导入模板包无数据（不刷新）', async () => {
    const importTemplatePackage = vi.fn(async () => ({ data: null }))
    mockTemplateIpc({ templates: AIDC_TEMPLATES, importTemplatePackage })
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByRole('button', { name: /导入模板包/ }))
    await waitFor(() => expect(importTemplatePackage).toHaveBeenCalled())
  })
})

describe('4.9.0 模板卡片分支（选中/质量/文件树/文件打开/发布）', () => {
  it('卡片可展开/收起', async () => {
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByText('64H100-IB'))
    await screen.findByText(/64 台 H100 集群 · InfiniBand/)
    fireEvent.click(screen.getByText('64H100-IB'))
    await waitFor(() => expect(screen.queryByText(/64 台 H100 集群 · InfiniBand/)).not.toBeInTheDocument())
  })

  it('质量评级 B（75 分）', async () => {
    renderSingleTemplate({ summary: { warnings: 1, infos: 0 } })
    expect(await screen.findByTitle('质量: 75')).toBeInTheDocument()
  })

  it('质量评级 C（65 分）', async () => {
    renderSingleTemplate({ summary: { warnings: 1, infos: 1 } })
    expect(await screen.findByTitle('质量: 65')).toBeInTheDocument()
  })

  it('质量评级 D（50 分）', async () => {
    renderSingleTemplate({ summary: { warnings: 2, infos: 0 } })
    expect(await screen.findByTitle('质量: 50')).toBeInTheDocument()
  })

  it('文件树目录展开与 Excel 文件读取', async () => {
    const nested = aidcTemplate('Nested', 'Nested', 'AIDC/64 台/IB', '嵌套模板')
    nested.files = [
      {
        name: 'excel',
        path: 'excel',
        isDirectory: true,
        children: [{ name: 'hostname.xlsx', path: 'excel/hostname.xlsx', isDirectory: false }],
      },
      { name: 'plan.json', path: 'plan.json', isDirectory: false },
    ] as never
    const readTemplateExcel = vi.fn(async () => ({ sheet: 'data' }))
    useProjectStore.setState({ templates: [nested] as never })
    mockTemplateIpc({ templates: [nested], readTemplateExcel })
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByText('Nested'))
    await screen.findByText(/嵌套模板/)
    fireEvent.click(screen.getByText('excel'))
    expect(screen.getByText('hostname.xlsx')).toBeInTheDocument()
    fireEvent.click(screen.getByText('hostname.xlsx'))
    await waitFor(() => expect(readTemplateExcel).toHaveBeenCalledWith('Nested', 'excel/hostname.xlsx'))
  })

  it('文件点击：命中源项目直接打开', async () => {
    const src = aidcTemplate('Src', 'Src', 'AIDC/64 台/IB', '源项目模板')
    const selectProject = vi.fn()
    useProjectStore.setState({
      templates: [src] as never,
      projects: [{ id: 1, name: 'Src', index: 0 }] as never,
      selectProject: selectProject as never,
    })
    mockTemplateIpc({ templates: [src] })
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByText('Src'))
    await screen.findByText(/源项目模板/)
    fireEvent.click(screen.getByText('plan.json'))
    await waitFor(() => expect(selectProject).toHaveBeenCalled())
  })

  it('登录后可打开发布对话框并取消', async () => {
    setRemoteState({ loggedIn: true })
    render(<TemplateCenterPanel />)
    fireEvent.click(screen.getByText('64H100-IB'))
    await screen.findByText(/64 台 H100 集群 · InfiniBand/)
    fireEvent.click(cardOf('64H100-IB').getByTitle('发布到市场'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

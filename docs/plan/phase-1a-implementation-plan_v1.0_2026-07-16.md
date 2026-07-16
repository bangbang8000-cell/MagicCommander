# Phase 1-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Electron + React + Zustand 架构上实现 Phase 1-A 的项目中心、模板中心、工作流面板、可拖动布局和工作区结构化索引。

**Architecture:** 先补齐 Electron 主进程的数据与 IPC 能力，再在渲染进程增加 typed store/service/component。保持旧 `example` 和 `saveAsExample` 兼容，不一次性破坏 Python 后端对 `MC_Para.xlsx` 的依赖。UI 改造采用小组件拆分，避免继续扩大 `ExplorerPanel.tsx` 和 `WorkbenchPanel.tsx`。

**Tech Stack:** Electron IPC、Node fs/path、React 18、TypeScript、Zustand persist、Vitest、Tailwind CSS、现有 Python backend CLI。

---

## 1. 实施边界

本计划基于 `docs/plan/phase-1a-project-center-workflow_v1.0_2026-07-16.md`，覆盖第一轮纳入范围：

- `example/` 到 `template/` 的兼容迁移。
- `workspace/mc-workspace.json` 结构化索引。
- Sidebar、BottomPanel、中栏内部区域拖动尺寸与持久化。
- 项目中心子组件拆分、状态徽标、多选与工作台同步。
- 模板中心展示、搜索、排序、详情、编辑、删除、从模板创建项目、项目另存为模板。
- 工作流面板卡片化，统一范围、准备状态、执行动作与结果入口。

不做：全新 Dashboard、真实 AI、数据库、模板市场、模板版本管理、彻底替换 `MC_Para.xlsx`、跨项目文件树全量展开。

---

## 2. 文件结构与职责

### 2.1 新增文件

- `electron/services/template.service.ts`
  - 管理模板目录、模板元信息、模板结构摘要、模板删除和项目复制为模板。
- `electron/services/workspace-index.service.ts`
  - 管理 `workspace/mc-workspace.json` 的读取、写入、扫描恢复和项目状态计算。
- `electron/ipc/template.handler.test.ts`
  - 测试模板元信息默认值、保存、读取、目录兼容和安全命名。
- `electron/ipc/workspace-index.service.test.ts`
  - 测试索引文件不存在时的扫描恢复、写入和项目状态计算。
- `src/services/templateService.ts`
  - 渲染进程模板 API 封装。
- `src/services/workspaceIndexService.ts`
  - 渲染进程工作区索引 API 封装。
- `src/components/layout/ResizableAppLayout.tsx`
  - App 主布局容器，负责 Sidebar/Editor/BottomPanel 尺寸拖动。
- `src/components/common/ResizeHandle.tsx`
  - 通用拖动条组件。
- `src/components/sidebar/project/ProjectListToolbar.tsx`
- `src/components/sidebar/project/ProjectListItem.tsx`
- `src/components/sidebar/project/ProjectBatchBar.tsx`
- `src/components/sidebar/project/ProjectStatusBadge.tsx`
- `src/components/sidebar/template/TemplateCenterPanel.tsx`
- `src/components/sidebar/template/TemplateListToolbar.tsx`
- `src/components/sidebar/template/TemplateCard.tsx`
- `src/components/sidebar/template/TemplateDetail.tsx`
- `src/components/sidebar/template/TemplateEditDialog.tsx`
- `src/components/sidebar/workbench/WorkbenchScopeCard.tsx`
- `src/components/sidebar/workbench/WorkbenchReadinessCard.tsx`
- `src/components/sidebar/workbench/WorkbenchActionGrid.tsx`
- `src/components/sidebar/workbench/WorkbenchResultCard.tsx`
- `src/components/sidebar/workbench/workbenchScope.ts`
  - 统一计算单项目/批量项目执行范围。

### 2.2 修改文件

- `electron/config.ts`
  - 新增 `getTemplateDir()`，保留 `getExampleDir()` 兼容入口，初始化时创建 template 目录并兼容 bundled example/template。
- `electron/ipc/handlers.ts`
  - 注册模板和工作区索引 IPC；旧 `listExamples/saveAsExample` 内部转调新模板能力。
- `electron/preload.ts`
  - 暴露模板和工作区索引 API。
- `package.json`
  - `extraResources` 新增 `template`，暂时保留 `example`。
- `src/types/project.ts`
  - 增加 `ProjectStatus`、`WorkspaceIndex`、`TemplateMeta`、`TemplateInfo` 等共享类型。
- `src/types/ipc.ts`
  - 增加模板和工作区索引 IPC 类型。
- `src/stores/ui.store.ts`
  - 扩展布局尺寸字段与 setter。
- `src/stores/project.store.ts`
  - 增加模板相关 action、项目状态字段归一化、`selectedProjectIds` 同步入口。
- `src/App.tsx`
  - 使用 `ResizableAppLayout` 接管主布局。
- `src/components/layout/ActivityBar.tsx`
  - 如当前没有模板入口，则增加 template activity 或在 workbench/explorer 内切换模板中心；优先不改主导航结构，模板中心默认挂载在 explorer 内部 tabs。
- `src/components/sidebar/ExplorerPanel.tsx`
  - 拆分项目中心子组件，新增模板中心 tab，减少文件体积。
- `src/components/sidebar/WorkbenchPanel.tsx`
  - 拆分为流程化卡片。

---

## 3. 执行包 P1A-1：模板目录与工作区索引基础

### Task 1: 新增共享类型

**Files:**
- Modify: `src/types/project.ts`
- Modify: `src/types/ipc.ts`
- Test: `src/types/project.test.ts`

- [ ] **Step 1: 写类型测试**

在 `src/types/project.test.ts` 增加断言，确保新类型可以被 TS 正确引用：

```ts
import { describe, expect, it } from 'vitest'
import type { ProjectInfo, ProjectStatus, TemplateInfo, WorkspaceIndex } from './project'

describe('project types', () => {
  it('supports project status metadata', () => {
    const status: ProjectStatus = {
      hasExcel: true,
      hasTemplates: true,
      hasPara: true,
      hasOutput: false,
      hasYaml: false,
      hasLabelOutput: false,
    }
    expect(status.hasTemplates).toBe(true)
  })

  it('supports workspace index and template metadata', () => {
    const project: ProjectInfo = { id: 1, name: 'test2', index: 1 }
    const template: TemplateInfo = {
      id: 'campus-switch-standard',
      name: '园区交换机标准模板',
      path: 'template/campus-switch-standard',
      description: '适用于园区接入交换机批量配置生成',
      scenario: '园区网络',
      sourceProject: 'test2',
      updatedAt: '2026-07-16T00:00:00.000Z',
      inputRequirements: ['hostname 表'],
      outputDescription: '生成设备配置、YAML 中间文件和设备标签',
      structure: {
        hasExcel: true,
        hasTemplates: true,
        hasPara: true,
        hasOutput: false,
        hasYaml: false,
        hasLabelOutput: false,
      },
      files: [],
    }
    const index: WorkspaceIndex = {
      version: 1,
      updatedAt: '2026-07-16T00:00:00.000Z',
      projects: [{ ...project, path: 'test2', status: template.structure }],
      templates: [template],
    }
    expect(index.templates[0].sourceProject).toBe('test2')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm run test:renderer -- src/types/project.test.ts
```

Expected: FAIL，提示 `ProjectStatus`、`TemplateInfo` 或 `WorkspaceIndex` 未导出。

- [ ] **Step 3: 增加类型定义**

在 `src/types/project.ts` 追加：

```ts
export interface ProjectStatus {
  hasExcel: boolean
  hasTemplates: boolean
  hasPara: boolean
  hasOutput: boolean
  hasYaml: boolean
  hasLabelOutput: boolean
}

export interface WorkspaceProjectInfo extends ProjectInfo {
  path: string
  createdAt?: string
  updatedAt?: string
  lastOpenedAt?: string
  status: ProjectStatus
}

export interface TemplateStructureSummary extends ProjectStatus {}

export interface TemplateMeta {
  name: string
  description: string
  scenario: string
  sourceProject: string
  updatedAt: string
  inputRequirements: string[]
  outputDescription: string
}

export interface TemplateInfo extends TemplateMeta {
  id: string
  path: string
  structure: TemplateStructureSummary
  files: FileNode[]
}

export interface WorkspaceIndex {
  version: 1
  updatedAt: string
  projects: WorkspaceProjectInfo[]
  templates: TemplateInfo[]
}
```

在 `src/types/ipc.ts` 中导入并扩展：

```ts
import type { TemplateInfo, TemplateMeta, WorkspaceIndex } from './project'
```

在 `ProjectIpcApi` 中增加：

```ts
  listTemplates: () => Promise<TemplateInfo[]>
  getTemplate: (id: string) => Promise<TemplateInfo>
  saveAsTemplate: (projectName: string, templateName: string, meta: Partial<TemplateMeta>) => Promise<void>
  updateTemplateMeta: (id: string, meta: Partial<TemplateMeta>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  getWorkspaceIndex: () => Promise<WorkspaceIndex>
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm run test:renderer -- src/types/project.test.ts
```

Expected: PASS。

### Task 2: 配置 template 目录并保留 example 兼容

**Files:**
- Modify: `electron/config.ts`
- Modify: `package.json`
- Test: `npm run typecheck`

- [ ] **Step 1: 新增 `getTemplateDir()`**

在 `electron/config.ts` 的 `getExampleDir()` 附近新增：

```ts
export function getTemplateDir(): string {
  const userTemplate = path.join(getUserDataDir(), 'template')
  return resolveExistingDir(
    [
      path.join(getRepoRootDir(), 'template'),
      path.join(process.cwd(), 'template'),
      path.join(app.getAppPath(), 'template'),
      path.join(process.resourcesPath, 'template'),
      userTemplate,
    ],
    userTemplate,
  )
}
```

- [ ] **Step 2: 更新初始化逻辑**

在 `initializeWorkspace()` 中保留 example 初始化，同时增加 template 初始化；优先复制 bundled `template`，没有时复制 bundled `example`：

```ts
  const templateDir = getTemplateDir()
  if (!fs.existsSync(templateDir)) {
    fs.mkdirSync(templateDir, { recursive: true })
    const bundledTemplate = path.join(process.resourcesPath, 'template')
    const bundledExample = path.join(process.resourcesPath, 'example')
    if (fs.existsSync(bundledTemplate)) {
      copyDirRecursive(bundledTemplate, templateDir)
    } else if (fs.existsSync(bundledExample)) {
      copyDirRecursive(bundledExample, templateDir)
    }
  }
```

- [ ] **Step 3: 更新打包资源**

在 `package.json` 的 `build.extraResources` 中增加：

```json
{
  "from": "template",
  "to": "template"
}
```

保留已有 `example` 条目，避免旧打包资源和旧路径失效。

- [ ] **Step 4: 类型检查**

Run:

```bash
npm run typecheck
```

Expected: PASS。

### Task 3: 实现模板服务

**Files:**
- Create: `electron/services/template.service.ts`
- Create: `electron/ipc/template.handler.test.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/ipc.ts`

- [ ] **Step 1: 写模板服务测试**

创建 `electron/ipc/template.handler.test.ts`：

```ts
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildDefaultTemplateMeta,
  computeProjectStatus,
  listTemplateInfosFromDir,
  readTemplateMeta,
  writeTemplateMeta,
} from '../services/template.service'

let tempRoot = ''

const makeRoot = () => {
  tempRoot = mkdtempSync(path.join(tmpdir(), 'mc-template-'))
  return tempRoot
}

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true })
  tempRoot = ''
})

describe('template.service', () => {
  it('builds default meta for legacy template folders', () => {
    const meta = buildDefaultTemplateMeta('legacy-template')
    expect(meta.name).toBe('legacy-template')
    expect(meta.description).toContain('legacy-template')
    expect(meta.inputRequirements).toEqual([])
  })

  it('reads and writes template meta', () => {
    const root = makeRoot()
    const templateDir = path.join(root, 'campus')
    mkdirSync(templateDir, { recursive: true })
    writeTemplateMeta(templateDir, {
      name: '园区模板',
      description: '标准园区模板',
      scenario: '园区网络',
      sourceProject: 'test2',
      inputRequirements: ['hostname 表'],
      outputDescription: '生成配置',
    })
    const raw = JSON.parse(readFileSync(path.join(templateDir, 'template.meta.json'), 'utf-8'))
    const meta = readTemplateMeta(templateDir, 'campus')
    expect(raw.name).toBe('园区模板')
    expect(meta.scenario).toBe('园区网络')
    expect(meta.updatedAt).toMatch(/T/)
  })

  it('computes project-like structure summary', () => {
    const root = makeRoot()
    mkdirSync(path.join(root, 'excel'), { recursive: true })
    mkdirSync(path.join(root, 'templates'), { recursive: true })
    writeFileSync(path.join(root, 'para.xlsx'), '')
    const status = computeProjectStatus(root)
    expect(status.hasExcel).toBe(true)
    expect(status.hasTemplates).toBe(true)
    expect(status.hasPara).toBe(true)
  })

  it('lists legacy folders as templates', () => {
    const root = makeRoot()
    mkdirSync(path.join(root, 'legacy', 'templates'), { recursive: true })
    const templates = listTemplateInfosFromDir(root)
    expect(templates).toHaveLength(1)
    expect(templates[0].id).toBe('legacy')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm run test:electron -- electron/ipc/template.handler.test.ts
```

Expected: FAIL，提示 `template.service` 不存在。

- [ ] **Step 3: 实现 `template.service.ts`**

创建 `electron/services/template.service.ts`，导出以下函数：

```ts
import fs from 'fs'
import path from 'path'
import type { FileNode, ProjectStatus, TemplateInfo, TemplateMeta } from '../../src/types/project'

const META_FILE = 'template.meta.json'

export function buildDefaultTemplateMeta(name: string): TemplateMeta {
  return {
    name,
    description: `${name} 模板`,
    scenario: '',
    sourceProject: '',
    updatedAt: new Date().toISOString(),
    inputRequirements: [],
    outputDescription: '',
  }
}

export function readTemplateMeta(templateDir: string, fallbackName: string): TemplateMeta {
  const metaPath = path.join(templateDir, META_FILE)
  if (!fs.existsSync(metaPath)) return buildDefaultTemplateMeta(fallbackName)
  const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Partial<TemplateMeta>
  return {
    ...buildDefaultTemplateMeta(fallbackName),
    ...raw,
    inputRequirements: Array.isArray(raw.inputRequirements) ? raw.inputRequirements : [],
  }
}

export function writeTemplateMeta(templateDir: string, meta: Partial<TemplateMeta>): TemplateMeta {
  fs.mkdirSync(templateDir, { recursive: true })
  const fallbackName = path.basename(templateDir)
  const next: TemplateMeta = {
    ...buildDefaultTemplateMeta(fallbackName),
    ...meta,
    updatedAt: new Date().toISOString(),
    inputRequirements: Array.isArray(meta.inputRequirements) ? meta.inputRequirements : [],
  }
  fs.writeFileSync(path.join(templateDir, META_FILE), JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function computeProjectStatus(projectDir: string): ProjectStatus {
  const hasDirectory = (name: string) => fs.existsSync(path.join(projectDir, name))
  const hasTemplates = hasDirectory('templates') && fs.readdirSync(path.join(projectDir, 'templates')).length > 0
  return {
    hasExcel: hasDirectory('excel'),
    hasTemplates,
    hasPara: fs.existsSync(path.join(projectDir, 'para.xlsx')),
    hasOutput: hasDirectory('output'),
    hasYaml: hasDirectory('yaml'),
    hasLabelOutput: hasDirectory('output-label'),
  }
}

function buildFileTree(dirPath: string, basePath: string): FileNode[] {
  if (!fs.existsSync(dirPath)) return []
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== '__pycache__')
    .map((entry) => {
      const fullPath = path.join(dirPath, entry.name)
      const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/')
      return {
        name: entry.name,
        path: relativePath,
        isDirectory: entry.isDirectory(),
        children: entry.isDirectory() ? buildFileTree(fullPath, basePath) : undefined,
      }
    })
}

function isTemplateLikeDir(dirPath: string): boolean {
  return ['para.xlsx', 'excel', 'templates', 'template.meta.json'].some((name) => fs.existsSync(path.join(dirPath, name)))
}

export function listTemplateInfosFromDir(templateRoot: string): TemplateInfo[] {
  if (!fs.existsSync(templateRoot)) return []
  return fs
    .readdirSync(templateRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .filter((entry) => isTemplateLikeDir(path.join(templateRoot, entry.name)))
    .map((entry) => {
      const templateDir = path.join(templateRoot, entry.name)
      const meta = readTemplateMeta(templateDir, entry.name)
      return {
        id: entry.name,
        path: `template/${entry.name}`,
        ...meta,
        structure: computeProjectStatus(templateDir),
        files: buildFileTree(templateDir, templateDir),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 4: 接入 IPC**

在 `electron/ipc/handlers.ts` 中导入 `getTemplateDir` 和模板服务函数，新增 IPC：

```ts
  ipcMain.handle('project:listTemplates', async () => listTemplateInfosFromDir(getTemplateDir()))

  ipcMain.handle('project:getTemplate', async (_e, id: string) => {
    const templates = listTemplateInfosFromDir(getTemplateDir())
    const template = templates.find((item) => item.id === id)
    if (!template) throw new Error(`模板不存在: ${id}`)
    return template
  })

  ipcMain.handle('project:updateTemplateMeta', async (_e, id: string, meta: Partial<TemplateMeta>) => {
    const targetPath = path.join(getTemplateDir(), id)
    if (!fs.existsSync(targetPath)) throw new Error(`模板不存在: ${id}`)
    writeTemplateMeta(targetPath, meta)
  })
```

旧 `project:listExamples` 返回 `listTemplateInfosFromDir(getTemplateDir()).map((item) => item.id)`；旧 `project:saveAsExample` 内部转到 `project:saveAsTemplate` 的复制逻辑。

- [ ] **Step 5: 暴露 preload API**

在 `electron/preload.ts` 的 `project` 下增加：

```ts
    listTemplates: () => ipcRenderer.invoke('project:listTemplates'),
    getTemplate: (id: string) => ipcRenderer.invoke('project:getTemplate', id),
    saveAsTemplate: (projectName: string, templateName: string, meta: unknown) =>
      ipcRenderer.invoke('project:saveAsTemplate', projectName, templateName, meta),
    updateTemplateMeta: (id: string, meta: unknown) => ipcRenderer.invoke('project:updateTemplateMeta', id, meta),
    deleteTemplate: (id: string) => ipcRenderer.invoke('project:deleteTemplate', id),
    getWorkspaceIndex: () => ipcRenderer.invoke('project:getWorkspaceIndex'),
```

- [ ] **Step 6: 运行验证**

Run:

```bash
npm run test:electron -- electron/ipc/template.handler.test.ts
npm run typecheck
```

Expected: PASS。

### Task 4: 实现工作区索引服务

**Files:**
- Create: `electron/services/workspace-index.service.ts`
- Create: `electron/ipc/workspace-index.service.test.ts`
- Modify: `electron/ipc/handlers.ts`

- [ ] **Step 1: 写索引服务测试**

创建 `electron/ipc/workspace-index.service.test.ts`：

```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { readWorkspaceIndex, scanWorkspaceIndex, writeWorkspaceIndex } from '../services/workspace-index.service'

let tempRoot = ''

const makeRoot = () => {
  tempRoot = mkdtempSync(path.join(tmpdir(), 'mc-workspace-'))
  return tempRoot
}

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true })
  tempRoot = ''
})

describe('workspace-index.service', () => {
  it('scans projects and templates when index is missing', () => {
    const root = makeRoot()
    mkdirSync(path.join(root, 'test2', 'templates'), { recursive: true })
    mkdirSync(path.join(root, 'test2', 'excel'), { recursive: true })
    writeFileSync(path.join(root, 'test2', 'para.xlsx'), '')
    mkdirSync(path.join(root, 'template', 'campus', 'templates'), { recursive: true })
    const index = scanWorkspaceIndex(root)
    expect(index.projects[0].name).toBe('test2')
    expect(index.templates[0].id).toBe('campus')
  })

  it('writes and reads workspace index', () => {
    const root = makeRoot()
    const index = scanWorkspaceIndex(root)
    writeWorkspaceIndex(root, index)
    const loaded = readWorkspaceIndex(root)
    expect(loaded.version).toBe(1)
  })
})
```

- [ ] **Step 2: 实现服务**

创建 `electron/services/workspace-index.service.ts`，核心函数：

```ts
import fs from 'fs'
import path from 'path'
import type { WorkspaceIndex, WorkspaceProjectInfo } from '../../src/types/project'
import { computeProjectStatus, listTemplateInfosFromDir } from './template.service'

const INDEX_FILE = 'mc-workspace.json'

function isProjectLikeDir(dirPath: string): boolean {
  return ['para.xlsx', 'excel', 'templates', 'output', 'yaml', 'output-label'].some((name) => fs.existsSync(path.join(dirPath, name)))
}

export function scanWorkspaceIndex(workspaceDir: string): WorkspaceIndex {
  const projects: WorkspaceProjectInfo[] = fs.existsSync(workspaceDir)
    ? fs
        .readdirSync(workspaceDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'template')
        .filter((entry) => isProjectLikeDir(path.join(workspaceDir, entry.name)))
        .map((entry, idx) => {
          const projectDir = path.join(workspaceDir, entry.name)
          const stat = fs.statSync(projectDir)
          return {
            id: idx + 1,
            name: entry.name,
            index: idx + 1,
            path: entry.name,
            createdAt: stat.birthtime.toISOString(),
            updatedAt: stat.mtime.toISOString(),
            status: computeProjectStatus(projectDir),
          }
        })
    : []

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    projects,
    templates: listTemplateInfosFromDir(path.join(workspaceDir, 'template')),
  }
}

export function writeWorkspaceIndex(workspaceDir: string, index: WorkspaceIndex): void {
  fs.mkdirSync(workspaceDir, { recursive: true })
  fs.writeFileSync(path.join(workspaceDir, INDEX_FILE), JSON.stringify({ ...index, updatedAt: new Date().toISOString() }, null, 2), 'utf-8')
}

export function readWorkspaceIndex(workspaceDir: string): WorkspaceIndex {
  const indexPath = path.join(workspaceDir, INDEX_FILE)
  if (!fs.existsSync(indexPath)) {
    const index = scanWorkspaceIndex(workspaceDir)
    writeWorkspaceIndex(workspaceDir, index)
    return index
  }
  const raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as WorkspaceIndex
  return {
    version: 1,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    templates: Array.isArray(raw.templates) ? raw.templates : [],
  }
}
```

- [ ] **Step 3: 接入 IPC**

在 `electron/ipc/handlers.ts` 注册：

```ts
  ipcMain.handle('project:getWorkspaceIndex', async () => readWorkspaceIndex(getWorkspaceDir()))
```

在项目创建、删除、保存模板、删除模板成功后调用 `writeWorkspaceIndex(getWorkspaceDir(), scanWorkspaceIndex(getWorkspaceDir()))` 刷新索引。

- [ ] **Step 4: 运行验证**

Run:

```bash
npm run test:electron -- electron/ipc/workspace-index.service.test.ts
npm run typecheck
```

Expected: PASS。

---

## 4. 执行包 P1A-2：可拖动布局

### Task 5: 扩展 UI store 布局尺寸

**Files:**
- Modify: `src/stores/ui.store.ts`
- Modify: `src/stores/ui.store.test.ts`

- [ ] **Step 1: 写 store 测试**

在 `src/stores/ui.store.test.ts` 增加：

```ts
  it('clamps layout sizes', () => {
    useUIStore.getState().setSidebarPx(100)
    useUIStore.getState().setBottomPx(50)
    useUIStore.getState().setExplorerProjectListHeight(80)
    useUIStore.getState().setTemplateListHeight(80)
    expect(useUIStore.getState().sidebarPx).toBeGreaterThanOrEqual(400)
    expect(useUIStore.getState().bottomPx).toBeGreaterThanOrEqual(180)
    expect(useUIStore.getState().explorerProjectListHeight).toBeGreaterThanOrEqual(160)
    expect(useUIStore.getState().templateListHeight).toBeGreaterThanOrEqual(160)
  })
```

- [ ] **Step 2: 实现字段**

在 `src/stores/ui.store.ts` 增加：

```ts
const LAYOUT_INTERNAL_MIN = 160
const LAYOUT_PROJECT_LIST_DEFAULT = 280
const LAYOUT_TEMPLATE_LIST_DEFAULT = 320
```

在 `UIState` 中增加：

```ts
  explorerProjectListHeight: number
  setExplorerProjectListHeight: (px: number) => void
  templateListHeight: number
  setTemplateListHeight: (px: number) => void
```

在 state 实现中增加：

```ts
      explorerProjectListHeight: LAYOUT_PROJECT_LIST_DEFAULT,
      setExplorerProjectListHeight: (px) => set({ explorerProjectListHeight: Math.max(LAYOUT_INTERNAL_MIN, px) }),
      templateListHeight: LAYOUT_TEMPLATE_LIST_DEFAULT,
      setTemplateListHeight: (px) => set({ templateListHeight: Math.max(LAYOUT_INTERNAL_MIN, px) }),
```

并加入 `partialize` 与 `onRehydrateStorage`。

- [ ] **Step 3: 运行测试**

Run:

```bash
npm run test:renderer -- src/stores/ui.store.test.ts
```

Expected: PASS。

### Task 6: 抽取可拖动 App 布局

**Files:**
- Create: `src/components/common/ResizeHandle.tsx`
- Create: `src/components/layout/ResizableAppLayout.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 新增通用拖动条**

创建 `src/components/common/ResizeHandle.tsx`：

```tsx
import clsx from 'clsx'
import { useCallback, useRef } from 'react'

type ResizeHandleProps = {
  direction: 'vertical' | 'horizontal'
  onResize: (delta: number) => void
  className?: string
}

export function ResizeHandle({ direction, onResize, className }: ResizeHandleProps) {
  const startRef = useRef<number | null>(null)

  const onMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      startRef.current = direction === 'vertical' ? event.clientX : event.clientY
      const handleMove = (moveEvent: MouseEvent) => {
        if (startRef.current === null) return
        const next = direction === 'vertical' ? moveEvent.clientX : moveEvent.clientY
        onResize(next - startRef.current)
        startRef.current = next
      }
      const handleUp = () => {
        startRef.current = null
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [direction, onResize],
  )

  return (
    <div
      role="separator"
      aria-orientation={direction === 'vertical' ? 'vertical' : 'horizontal'}
      className={clsx(
        direction === 'vertical' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
        'flex-shrink-0 bg-transparent hover:bg-blue-400/60 active:bg-blue-500',
        className,
      )}
      onMouseDown={onMouseDown}
    />
  )
}
```

- [ ] **Step 2: 新增布局容器**

创建 `src/components/layout/ResizableAppLayout.tsx`，接收 `sidebar`、`editor`、`bottomPanel`：

```tsx
import clsx from 'clsx'
import { ReactNode, useCallback } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { ResizeHandle } from '@/components/common/ResizeHandle'

type ResizableAppLayoutProps = {
  isDark: boolean
  sidebarVisible: boolean
  panelVisible: boolean
  sidebar: ReactNode
  editor: ReactNode
  bottomPanel: ReactNode
}

export function ResizableAppLayout({
  isDark,
  sidebarVisible,
  panelVisible,
  sidebar,
  editor,
  bottomPanel,
}: ResizableAppLayoutProps) {
  const sidebarPx = useUIStore((s) => s.sidebarPx)
  const bottomPx = useUIStore((s) => s.bottomPx)
  const setSidebarPx = useUIStore((s) => s.setSidebarPx)
  const setBottomPx = useUIStore((s) => s.setBottomPx)

  const resizeSidebar = useCallback((delta: number) => setSidebarPx(sidebarPx + delta), [setSidebarPx, sidebarPx])
  const resizeBottom = useCallback((delta: number) => setBottomPx(bottomPx - delta), [setBottomPx, bottomPx])

  return (
    <div className="flex-1 flex overflow-hidden">
      {sidebarVisible && (
        <>
          <div
            className={clsx('flex-shrink-0 overflow-hidden', isDark ? 'bg-gray-800 border-r border-gray-700' : 'bg-white border-r border-gray-200')}
            style={{ width: sidebarPx }}
          >
            {sidebar}
          </div>
          <ResizeHandle direction="vertical" onResize={resizeSidebar} />
        </>
      )}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className={clsx('flex-1 overflow-hidden min-h-0', isDark ? 'bg-gray-900' : 'bg-white')}>{editor}</div>
        {panelVisible && (
          <>
            <ResizeHandle direction="horizontal" onResize={resizeBottom} />
            <div
              className={clsx('overflow-hidden border-t', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200')}
              style={{ height: bottomPx }}
            >
              {bottomPanel}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 替换 App 布局**

在 `src/App.tsx` 引入 `ResizableAppLayout`，用它替换当前硬编码 `w-80` 和 `h-48` 的布局区。

- [ ] **Step 4: 运行验证**

Run:

```bash
npm run test:renderer -- src/stores/ui.store.test.ts
npm run typecheck
```

Expected: PASS。

---

## 5. 执行包 P1A-3：项目中心与模板中心

### Task 7: 渲染进程模板服务与 Project store action

**Files:**
- Create: `src/services/templateService.ts`
- Modify: `src/stores/project.store.ts`

- [ ] **Step 1: 新增服务封装**

创建 `src/services/templateService.ts`：

```ts
import type { TemplateInfo, TemplateMeta } from '@/types/project'

export const templateService = {
  listTemplates: (): Promise<TemplateInfo[]> => window.electron.project.listTemplates(),
  getTemplate: (id: string): Promise<TemplateInfo> => window.electron.project.getTemplate(id),
  saveAsTemplate: (projectName: string, templateName: string, meta: Partial<TemplateMeta>): Promise<void> =>
    window.electron.project.saveAsTemplate(projectName, templateName, meta),
  updateTemplateMeta: (id: string, meta: Partial<TemplateMeta>): Promise<void> =>
    window.electron.project.updateTemplateMeta(id, meta),
  deleteTemplate: (id: string): Promise<void> => window.electron.project.deleteTemplate(id),
}
```

- [ ] **Step 2: 扩展 project store**

在 `src/stores/project.store.ts` 增加 state/action：

```ts
  templates: TemplateInfo[]
  fetchTemplates: () => Promise<void>
  saveAsTemplate: (projectName: string, templateName: string, meta: Partial<TemplateMeta>) => Promise<void>
  updateTemplateMeta: (id: string, meta: Partial<TemplateMeta>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
```

实现中调用 `templateService`，每次写操作后 `fetchTemplates()`。

- [ ] **Step 3: 兼容旧 example API**

保留 `listExamples` 和 `saveAsExample`，内部仍可走旧 IPC 或新模板 action。不要删除现有调用点。

- [ ] **Step 4: 类型检查**

Run:

```bash
npm run typecheck
```

Expected: PASS。

### Task 8: 拆分项目中心组件

**Files:**
- Create: `src/components/sidebar/project/ProjectListToolbar.tsx`
- Create: `src/components/sidebar/project/ProjectStatusBadge.tsx`
- Create: `src/components/sidebar/project/ProjectListItem.tsx`
- Create: `src/components/sidebar/project/ProjectBatchBar.tsx`
- Modify: `src/components/sidebar/ExplorerPanel.tsx`

- [ ] **Step 1: 新增状态徽标组件**

`ProjectStatusBadge.tsx` 展示 `缺参数/缺模板/可渲染/有输出`：

```tsx
import clsx from 'clsx'
import type { ProjectStatus } from '@/types/project'

type ProjectStatusBadgeProps = { status?: ProjectStatus }

export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  if (!status) return null
  const items = [
    { show: !status.hasPara, label: '缺参数', tone: 'red' },
    { show: !status.hasTemplates, label: '缺模板', tone: 'amber' },
    { show: status.hasExcel && status.hasTemplates && status.hasPara, label: '可渲染', tone: 'green' },
    { show: status.hasOutput || status.hasYaml || status.hasLabelOutput, label: '有输出', tone: 'blue' },
  ].filter((item) => item.show)

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item.label}
          className={clsx(
            'rounded px-1.5 py-0.5 text-[10px]',
            item.tone === 'red' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
            item.tone === 'amber' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
            item.tone === 'green' && 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200',
            item.tone === 'blue' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
          )}
        >
          {item.label}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 新增工具栏、项目项、批量条**

组件只接收 props，不直接读取 Zustand。`ExplorerPanel.tsx` 负责传入当前 search/sort/selected/action。

- [ ] **Step 3: 在 ExplorerPanel 中替换局部 UI**

保持当前功能不变：搜索、排序、收藏、最近、普通项目、多选、批量渲染/删除、文件树。

- [ ] **Step 4: 同步多选到 render store**

在 `ExplorerPanel.tsx` 选择变化时调用：

```ts
const setSelectedIds = useRenderStore((s) => s.setSelectedIds)

useEffect(() => {
  setSelectedIds(selectedProjectIds)
}, [selectedProjectIds, setSelectedIds])
```

- [ ] **Step 5: 运行验证**

Run:

```bash
npm run typecheck
npm run test:renderer
```

Expected: PASS。

### Task 9: 实现模板中心 UI

**Files:**
- Create: `src/components/sidebar/template/TemplateCenterPanel.tsx`
- Create: `src/components/sidebar/template/TemplateListToolbar.tsx`
- Create: `src/components/sidebar/template/TemplateCard.tsx`
- Create: `src/components/sidebar/template/TemplateDetail.tsx`
- Create: `src/components/sidebar/template/TemplateEditDialog.tsx`
- Modify: `src/components/sidebar/ExplorerPanel.tsx`

- [ ] **Step 1: 新增 TemplateCard**

展示模板名称、简介、适用场景、来源项目、更新时间、结构摘要，以及主要操作按钮：从模板创建项目、编辑、删除。

- [ ] **Step 2: 新增 TemplateEditDialog**

字段：名称、简介、适用场景、来源项目、输入要求、输出说明。输入要求用换行文本转换为字符串数组。

- [ ] **Step 3: 新增 TemplateCenterPanel**

维护本地状态：

```ts
const [query, setQuery] = useState('')
const [sortBy, setSortBy] = useState<'name' | 'updatedAt' | 'sourceProject'>('name')
const [viewMode, setViewMode] = useState<'card' | 'compact'>('card')
const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
```

从 `useProjectStore` 读取 `templates/fetchTemplates/createProject/saveAsTemplate/updateTemplateMeta/deleteTemplate`。

- [ ] **Step 4: 接入 ExplorerPanel**

在 `ExplorerPanel.tsx` 顶部增加内部 tab：`项目 / 模板`。默认进入项目 tab，不改变 ActivityBar 主导航结构。

- [ ] **Step 5: 从模板创建项目**

调用现有：

```ts
await createProject(projectName, { template: template.id })
```

- [ ] **Step 6: 项目另存为模板**

调用：

```ts
await saveAsTemplate(selectedProject.name, templateName, meta)
```

- [ ] **Step 7: 运行验证**

Run:

```bash
npm run typecheck
npm run test:renderer
```

Expected: PASS。

---

## 6. 执行包 P1A-4：工作流面板卡片化

### Task 10: 统一工作台执行范围

**Files:**
- Create: `src/components/sidebar/workbench/workbenchScope.ts`

- [ ] **Step 1: 新增范围计算函数**

```ts
import type { ProjectInfo } from '@/types/project'

export type WorkbenchScope =
  | { type: 'none'; ids: string[]; label: string }
  | { type: 'single'; ids: string[]; label: string }
  | { type: 'batch'; ids: string[]; label: string }

export function getWorkbenchScope(selectedProject: ProjectInfo | null, selectedProjectIds: string[]): WorkbenchScope {
  if (selectedProjectIds.length > 0) {
    return { type: 'batch', ids: selectedProjectIds, label: `已选择 ${selectedProjectIds.length} 个项目` }
  }
  if (selectedProject) {
    return { type: 'single', ids: [String(selectedProject.id)], label: `当前项目：${selectedProject.name}` }
  }
  return { type: 'none', ids: [], label: '未选择项目' }
}
```

- [ ] **Step 2: 类型检查**

Run:

```bash
npm run typecheck
```

Expected: PASS。

### Task 11: 拆分 WorkbenchPanel 子组件

**Files:**
- Create: `src/components/sidebar/workbench/WorkbenchScopeCard.tsx`
- Create: `src/components/sidebar/workbench/WorkbenchReadinessCard.tsx`
- Create: `src/components/sidebar/workbench/WorkbenchActionGrid.tsx`
- Create: `src/components/sidebar/workbench/WorkbenchResultCard.tsx`
- Modify: `src/components/sidebar/WorkbenchPanel.tsx`

- [ ] **Step 1: 新增 ScopeCard**

显示 `getWorkbenchScope()` 返回的 label，并在批量模式下显示项目数量。

- [ ] **Step 2: 新增 ReadinessCard**

根据当前项目或批量项目的状态显示：Excel、Templates、para、output、yaml、output-label。

- [ ] **Step 3: 新增 ActionGrid**

按钮调用 `useRenderStore`：

```ts
renderProject(scope.ids)
renderYaml(scope.ids)
labelMarkdown(scope.ids)
labelPdf(scope.ids)
```

根据 `config.outputFormat` 决定调用 device name 或 SN 版本。

- [ ] **Step 4: 新增 ResultCard**

显示 `progress/currentMessage/errors`，提供打开项目目录和查看输出入口。批量模式下打开目录按钮可以禁用或提示先切回单项目。

- [ ] **Step 5: WorkbenchPanel 组装卡片**

`WorkbenchPanel.tsx` 只保留状态读取、scope 计算和卡片组合，减少内部业务分支。

- [ ] **Step 6: 运行验证**

Run:

```bash
npm run typecheck
npm run test:renderer
```

Expected: PASS。

---

## 7. 收口验证

### Task 12: 全量质量检查

**Files:**
- No direct file changes unless checks fail.

- [ ] **Step 1: 运行 lint**

Run:

```bash
npm run lint
```

Expected: PASS。若失败，只修复本次 Phase 1-A 改动引入的问题。

- [ ] **Step 2: 运行类型检查**

Run:

```bash
npm run typecheck
```

Expected: PASS。

- [ ] **Step 3: 运行测试**

Run:

```bash
npm test
```

Expected: PASS。

- [ ] **Step 4: 运行构建**

Run:

```bash
npm run build
```

Expected: PASS。

- [ ] **Step 5: 手动冒烟验证**

Run:

```bash
npm run dev:all
```

Manual checks:

1. 应用启动无白屏。
2. Sidebar 可以拖动调整宽度，重启后尺寸保留。
3. BottomPanel 可以拖动调整高度，重启后尺寸保留。
4. Explorer 默认显示项目中心，项目搜索、排序、收藏、最近、文件树可用。
5. 多选项目后 Workbench 显示“已选择 N 个项目”。
6. 模板 tab 显示模板卡片，可查看详情。
7. 当前项目可另存为模板，并生成 `template.meta.json`。
8. 可从模板创建项目。
9. 可编辑模板信息，刷新后仍保留。
10. 删除模板前有二次确认。
11. `workspace/mc-workspace.json` 被创建或更新。
12. 旧 `listExamples/saveAsExample` 相关 UI 不崩溃。
13. 未跟踪旧输出目录 `workspace/test2/output-label-md/` 和 `workspace/test2/output-label-pdf/` 不被提交。

---

## 8. 提交建议

每个执行包完成且验证通过后单独提交：

```bash
git add electron src package.json package-lock.json docs/plan/phase-1a-implementation-plan_v1.0_2026-07-16.md
git commit -m "feat(project): add phase 1a template and workspace foundation"
```

```bash
git add src
git commit -m "feat(layout): add resizable app workspace layout"
```

```bash
git add src electron
git commit -m "feat(template): add project and template center workflow"
```

```bash
git add src
git commit -m "feat(workbench): reorganize workflow panel cards"
```

实际提交前必须先检查 `git status`，不要提交 `workspace/test2/output-label-md/` 和 `workspace/test2/output-label-pdf/`。

---

## 9. 自查清单

- [ ] 设计文档中的模板展示、介绍、编辑、删除、另存为模板、从模板创建项目均有任务覆盖。
- [ ] `example/` 到 `template/` 的迁移保持兼容，没有删除旧 API。
- [ ] `MC_Para.xlsx` 未被移除，Python 渲染主流程不被破坏。
- [ ] `mc-workspace.json` 是旁路索引，不是数据库或常驻扫描服务。
- [ ] ActivityBar 主导航结构不被重做。
- [ ] Sidebar、BottomPanel、中栏内部尺寸都进入 UI store 持久化。
- [ ] 所有新增 IPC 都通过 `preload.ts` 和 `src/types/ipc.ts` 对齐。
- [ ] 最终运行 lint、typecheck、test、build。

# MagicCommander 客户端 v3.5 云集成 PRD 与开发规范

> 版本：v1.0  
> 日期：2026-07-22  
> 状态：待审批  
> 基于：服务器端 API 现状评估 + 客户端 v3.4.1 功能审计

---

## 目录

1. [服务器端 API 能力评估](#1-服务器端-api-能力评估)
2. [客户端现有功能审计](#2-客户端现有功能审计)
3. [差距分析与需求矩阵](#3-差距分析与需求矩阵)
4. [v3.5 云集成 PRD](#4-v35-云集成-prd)
5. [功能详细设计](#5-功能详细设计)
6. [开发规范](#6-开发规范)
7. [里程碑与交付物](#7-里程碑与交付物)

---

## 1. 服务器端 API 能力评估

### 1.1 已实现 API 清单

#### 认证模块 (`/api/v1/auth`)

| 端点 | 方法 | 认证 | 状态 | 说明 |
|------|------|------|------|------|
| `/auth/feishu/qrcode` | POST | 无 | 已实现 | 飞书扫码登录 - 生成二维码 session |
| `/auth/qq/qrcode` | POST | 无 | 已实现 | QQ 扫码登录 |
| `/auth/wechat/qrcode` | POST | 无 | 已实现 | 微信扫码登录 |
| `/auth/qrcode` | POST | 无 | 已实现 | 统一扫码入口（platform 参数） |
| `/auth/scan/status/{session_id}` | GET | 无 | 已实现 | 轮询扫码状态（pending/confirmed/expired） |
| `/auth/feishu/callback` | GET | 无 | 已实现 | 飞书 OAuth 回调 |
| `/auth/qq/callback` | GET | 无 | 已实现 | QQ OAuth 回调 |
| `/auth/wechat/callback` | GET | 无 | 已实现 | 微信 OAuth 回调 |
| `/auth/token/refresh` | POST | Bearer | 已实现 | 刷新 JWT Token |
| `/auth/bindings` | GET | Bearer | 已实现 | 查询社交绑定列表 |
| `/auth/bindings` | POST | Bearer | 占位 | 添加社交绑定（未实现） |
| `/auth/bindings/{platform}` | DELETE | Bearer | 已实现 | 解除社交绑定 |
| `/auth/health` | GET | 无 | 已实现 | 检查 OAuth Provider 配置状态 |

**评价：** 认证系统完整度高，支持飞书/QQ/微信三种 OAuth 扫码登录。客户端仅需实现 QR 码展示 + 轮询 + Token 管理。

#### 用户模块 (`/api/v1/user`)

| 端点 | 方法 | 认证 | 状态 | 说明 |
|------|------|------|------|------|
| `/user/profile` | GET | Bearer | 已实现 | 获取用户资料（聚合 Gitea + 社交绑定） |
| `/user/profile` | PUT | Bearer | 已实现 | 更新用户资料（full_name, bio） |

**评价：** 基础用户资料查询/更新可用，缺少头像上传、密码修改等功能。

#### 模板模块 (`/api/v1/templates`)

| 端点 | 方法 | 认证 | 状态 | 说明 |
|------|------|------|------|------|
| `/templates` | GET | 无 | 已实现 | 公开模板列表（搜索/分类/分页） |
| `/templates/{owner}/{repo}` | GET | 无 | 已实现 | 模板详情（含文件树） |
| `/templates/{owner}/{repo}/download` | GET | 无 | 已实现 | 下载模板（重定向到 Gitea archive） |
| `/templates/{owner}/{repo}/file/{path}` | GET | 无 | 已实现 | 获取模板中的单个文件内容 |
| `/templates` | POST | Bearer | 已实现 | 上传模板（创建 Gitea 仓库 + 文件） |
| `/templates/mine` | GET | Bearer | 已实现 | 我的模板列表 |
| `/templates/{owner}/{repo}/stats` | GET | 无 | 已实现 | 模板下载/使用统计 |
| `/templates/{owner}/{repo}` | DELETE | Bearer | 已实现 | 删除模板 |

**评价：** 模板市场 API 完整度高。搜索、分类、详情、下载、上传、统计全部可用。客户端可直接集成。

#### 项目模块 (`/api/v1/projects`)

| 端点 | 方法 | 认证 | 状态 | 说明 |
|------|------|------|------|------|
| `/projects` | GET | Bearer | 已实现 | 列出用户项目 |
| `/projects` | POST | Bearer | 已实现 | 创建项目（可选从模板创建） |
| `/projects/{owner}/{repo}` | DELETE | Bearer | 已实现 | 删除项目 |
| `/client/sync/check` | POST | Bearer | 已实现 | 检查本地与云端差异（SHA 比对） |

**评价：** 项目 CRUD 基础可用，sync/check 增量同步检测已实现。缺少项目更新（PUT）、公开/私有切换、项目搜索。

#### 客户端模块 (`/api/v1/client`)

| 端点 | 方法 | 认证 | 状态 | 说明 |
|------|------|------|------|------|
| `/client/dashboard` | GET | Bearer | 已实现 | 客户端仪表盘（模板数/项目数/最近5条） |

**评价：** 仪表盘可用，但建议增加通知、公告、版本检查等。

#### 系统模块

| 端点 | 方法 | 认证 | 状态 | 说明 |
|------|------|------|------|------|
| `/health` | GET | 无 | 已实现 | 基础健康检查 |
| `/health/full` | GET | 无 | 已实现 | 完整健康检查（磁盘/内存/Gitea 状态） |
| `/smoke` | GET | 无 | 已实现 | 冒烟测试 |
| `/analytics/track` | POST | 无 | 已实现 | 匿名分析追踪 |
| `/admin/stats` | GET | Admin Token | 已实现 | 管理后台统计 |
| `/admin/gitea` | GET | Admin Token | 已实现 | Gitea 统计 |
| `/admin` | GET | 无 | 已实现 | 管理后台 HTML 页面 |

**评价：** 运维和监控 API 完整。

### 1.2 服务器端缺失 API

| 优先级 | 缺失功能 | 建议端点 | 必要性 |
|--------|---------|---------|--------|
| P0 | 客户端版本检查 | `GET /api/v1/client/version` | 返回最新版本号、下载链接、更新日志 |
| P0 | 项目更新（push） | `PUT /api/v1/projects/{owner}/{repo}/files` | 接受文件变更、更新仓库 |
| P0 | 公开项目浏览 | `GET /api/v1/projects/public` | 浏览公开项目（类似模板市场） |
| P1 | 项目公开/私有切换 | `PUT /api/v1/projects/{owner}/{repo}/visibility` | 切换公开/私有状态 |
| P1 | 项目搜索 | `GET /api/v1/projects?q=xxx` | 搜索公开项目 |
| P1 | 用户头像上传 | `POST /api/v1/user/avatar` | 上传自定义头像 |
| P1 | 通知系统 | `GET /api/v1/client/notifications` | 系统公告、模板更新通知 |
| P2 | 项目 fork | `POST /api/v1/projects/{owner}/{repo}/fork` | 从公开项目 fork 到自己的空间 |
| P2 | 模板版本管理 | `GET /api/v1/templates/{owner}/{repo}/versions` | 模板版本列表 |
| P2 | 项目/模板星标 | `PUT /api/v1/projects/{owner}/{repo}/star` | 收藏/点赞 |
| P2 | 评论系统 | `GET/POST /api/v1/templates/{owner}/{repo}/comments` | 模板评论 |

### 1.3 服务器端架构优点

- **Gitea 作为用户主数据**：无需自建用户表，直接复用 Gitea 的用户系统、Token 管理、仓库权限
- **Git 作为同步内核**：增量传输、版本历史、冲突检测全部免费获得
- **Topics 标记分类**：用 `magiccommander-template` 和 `category-xxx` 标签区分模板和项目
- **JWT 72h 有效期**：合理的 Token 过期时间，减少客户端重登录频率
- **SQLite 轻量存储**：百级用户场景下零运维成本

---

## 2. 客户端现有功能审计

### 2.1 状态管理（Zustand Stores）

| Store | 持久化 | 核心状态 | 关键能力 |
|-------|--------|---------|---------|
| `project.store` | 是 | 项目列表、模板、收藏、最近 | 项目 CRUD、模板 CRUD、项目结构 |
| `chat.store` | 是 | 会话、消息、AI Hub 状态 | 多会话管理、流式响应、Provider 管理 |
| `ui.store` | 是 | 主题、语言、布局、AI 配置 | 三态主题、面板尺寸、Provider 路由 |
| `editor.store` | 是 | 标签页、分屏、关闭历史 | 多标签编辑、水平/垂直分屏、最近关闭 |
| `render.store` | 否 | 渲染状态、进度、结果 | 项目/YAML 渲染、SN 模式、标签打印 |
| `log.store` | 否 | 日志条目 | 日志缓冲、订阅 Electron 日志 |

### 2.2 UI 组件架构

```
App.tsx
├── LoadingScreen          # 启动加载屏幕
├── Header                 # 标题栏（Logo、菜单、语言、主题、更新）
├── ActivityBar            # 活动栏（搜索/资源管理/渲染/输出/工作台/设置/聊天）
├── ResizableAppLayout     # 可拖拽分隔布局
│   ├── Sidebar (左侧)     # ExplorerPanel / WorkbenchPanel / OutputPanel / 
│   │                      # SettingsPanel / SearchPanel / RenderPanel / ChatPanel
│   ├── EditorArea (中间)  # 代码编辑器 + 标签页
│   └── PanelArea (底部)   # 日志/终端/问题面板
├── StatusBar              # 状态栏（进度、连接状态、光标位置）
└── ToastContainer         # 全局 Toast 通知
```

### 2.3 IPC 通信通道

| 通道类别 | 通道名称 | 说明 |
|---------|---------|------|
| 项目管理 | `project:list`, `project:create`, `project:delete`, `project:structure` | 项目 CRUD |
| 文件操作 | `project:readFile`, `project:writeFile`, `project:readExcel`, `project:writeExcel` | 文件读写 |
| 模板管理 | `project:listTemplates`, `project:getTemplate`, `project:saveAsTemplate`, `project:deleteTemplate`, `project:updateTemplateMeta` | 本地模板 CRUD |
| 渲染 | `render:project`, `render:yaml`, `render:project-sn`, `render:yaml-sn`, `render:dry-run`, `render:undo` | 渲染执行 |
| 校验 | `validate:template`, `validate:excel` | 模板/Excel 校验 |
| 删除 | `delete:output`, `delete:output-sn`, `delete:yaml`, `delete:yaml-sn` | 输出清理 |
| 标签 | `feature:label-print`, `feature:label-markdown`, `feature:label-pdf`, `feature:label-delete` | 标签操作 |
| AI Hub | `aihub:start`, `aihub:stop`, `aihub:status`, `aihub:chat`, `aihub:syncProviders` 等 | AI 聊天 |
| 应用 | `app:getVersion`, `app:getBuildInfo`, `app:getPath`, `app:backupAiConfig`, `app:restoreAiConfig` | 应用信息 |
| 文件 | `file:read`, `file:write`, `file:exists`, `file:readExcel`, `file:readDocx` | 通用文件操作 |
| 日志 | `log:write` | 日志写入 |
| Shell | `shell:showItemInFolder` | 系统 Shell |

### 2.4 现有功能清单

| 功能模块 | 已完成 | 说明 |
|---------|--------|------|
| 项目创建 | 是 | 从模板创建 / 空白项目 |
| 项目删除 | 是 | 批量删除 |
| 项目渲染 | 是 | 标准模式 + SN 模式 |
| YAML 输出 | 是 | 标准模式 + SN 模式 |
| 渲染预览 (dry-run) | 是 | 预览渲染结果 |
| 渲染撤销 | 是 | 撤销渲染输出 |
| 模板校验 | 是 | Jinja2 语法校验 |
| Excel 校验 | 是 | 数据完整性校验 |
| 标签打印 | 是 | Markdown 输出 + PDF 导出 |
| 本地模板管理 | 是 | 保存/删除/更新模板元信息 |
| 示例项目 | 是 | 快速从示例创建 |
| 收藏/最近项目 | 是 | 收藏夹 + 最近使用 |
| AI 对话 | 是 | 流式响应、多 Provider、策略路由 |
| 代码编辑器 | 是 | 多标签、分屏、语法高亮 |
| 文件浏览器 | 是 | 项目文件树 |
| 多语言 | 是 | 中/英/日 等 12 种语言 |
| 主题切换 | 是 | Light/Dark/System |
| 自动更新 | 是 | electron-updater |
| 设置面板 | 是 | 通用 + 高级设置 |
| 用户指南 | 是 | 中英文使用文档 |

### 2.5 当前缺失的云相关能力

| 缺失能力 | 影响 | 对应服务器 API |
|---------|------|---------------|
| 用户登录/注册 | 无法识别用户身份 | `/auth/qrcode` + `/auth/scan/status` |
| API 客户端 | 无法与服务器通信 | 所有 `/api/v1/*` |
| 服务器配置 | 不知道服务器地址 | 需要配置项 |
| 远程模板浏览 | 无法发现在线模板 | `/templates` |
| 模板下载 | 无法安装在线模板 | `/templates/{owner}/{repo}/download` |
| 模板上传 | 无法发布模板 | POST `/templates` |
| 项目推送 | 无法备份项目到云端 | Git push / REST API |
| 项目拉取 | 无法从云端恢复项目 | Git clone / REST API |
| 同步状态 | 不知道本地与云端差异 | `/client/sync/check` |
| 公开项目浏览 | 无法发现社区项目 | 需要 `/projects/public` |
| 用户仪表盘 | 无法查看云端概览 | `/client/dashboard` |
| 连接状态 | 不知道网络是否可达 | `/health` |

---

## 3. 差距分析与需求矩阵

### 3.1 能力差距总览

```
                   客户端现有能力        服务器端 API 能力
                   ─────────────        ────────────────
用户认证           ✗ 无                  ✓ 完整（飞书/QQ/微信扫码）
用户资料           ✗ 无                  ✓ 查询/更新
本地模板            ✓ 完整               N/A
远程模板浏览        ✗ 无                  ✓ 搜索/分类/分页
远程模板下载        ✗ 无                  ✓ 下载/文件预览
模板发布            ✗ 无                  ✓ 上传
本地项目            ✓ 完整               N/A
远程项目列表        ✗ 无                  ✓ 查询/创建/删除
项目推送 (push)    ✗ 无                  △ 需扩展（Git 操作）
项目拉取 (pull)    ✗ 无                  △ 需扩展（Git 操作）
同步状态检测        ✗ 无                  ✓ sync/check
公开项目浏览        ✗ 无                  △ 需扩展
客户端仪表盘        ✗ 无                  ✓ dashboard
连接状态            ✗ 无                  ✓ health
```

### 3.2 需求优先级矩阵

| 优先级 | 需求 | 用户价值 | 技术复杂度 | 依赖 |
|--------|------|---------|-----------|------|
| **P0** | 用户认证（扫码登录） | 前提条件 | 中 | 服务器端 auth API |
| **P0** | 服务器连接配置 | 前提条件 | 低 | 无 |
| **P0** | 远程模板浏览 | 核心价值 | 中 | 认证 + templates API |
| **P0** | 模板一键下载安装 | 核心价值 | 中 | 模板浏览 |
| **P1** | 项目推送到云端 | 高价值 | 高 | 认证 + Git 集成 |
| **P1** | 项目从云端拉取 | 高价值 | 高 | 认证 + Git 集成 |
| **P1** | 同步状态指示 | 高价值 | 中 | 推送/拉取 + sync/check |
| **P1** | 模板发布到市场 | 高价值 | 中 | 认证 + templates POST |
| **P1** | 客户端仪表盘 | 中价值 | 低 | 认证 + dashboard API |
| **P2** | 公开项目浏览 | 中价值 | 中 | 服务器端扩展 |
| **P2** | 用户资料管理 | 中价值 | 低 | 认证 + user API |
| **P2** | 冲突处理 | 中价值 | 高 | Git 集成 |
| **P2** | 多设备同步 | 高价值 | 高 | 全部 P1 |
| **P3** | 通知系统 | 低价值 | 低 | 服务器端扩展 |
| **P3** | 模板评分/评论 | 低价值 | 高 | 服务器端扩展 |

---

## 4. v3.5 云集成 PRD

### 4.1 版本目标

**MagicCommander v3.5 "Cloud Connect"** 实现客户端与 MagicCommander Platform 的完整连接，让用户能够：

1. 通过扫码登录平台账号
2. 浏览、搜索、下载在线模板
3. 将本地项目推送到云端备份
4. 从云端拉取项目到本地
5. 将本地模板发布到模板市场
6. 查看云端仪表盘概览

### 4.2 新增 UI 组件

```
App.tsx 新增:
├── Header
│   └── CloudStatusIndicator    # 新增：云连接状态图标
├── ActivityBar
│   └── CloudActivity            # 新增：云中心活动入口
├── Sidebar
│   └── CloudPanel               # 新增：云中心面板
│       ├── LoginView            # 未登录：登录界面
│       ├── DashboardView        # 已登录：仪表盘
│       ├── TemplateMarketView   # 远程模板浏览
│       ├── TemplateDetailView   # 模板详情
│       ├── RemoteProjectView    # 远程项目列表
│       └── UserProfileView      # 用户资料
├── Dialogs
│   ├── QRCodeDialog             # 新增：扫码登录弹窗
│   ├── PublishTemplateDialog    # 新增：发布模板弹窗
│   ├── PushProjectDialog        # 新增：推送项目弹窗
│   └── PullProjectDialog        # 新增：拉取项目弹窗
└── StatusBar
    └── CloudSyncStatus          # 新增：同步状态文字
```

### 4.3 新增 Store

```typescript
// src/stores/cloud.store.ts
interface CloudState {
  // 连接状态
  serverUrl: string
  isConnected: boolean
  isLoggedIn: boolean
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresAt: number | null
  
  // 用户信息
  userProfile: UserProfile | null
  userBindings: SocialBinding[]
  
  // 远程数据
  remoteTemplates: RemoteTemplate[]
  remoteProjects: RemoteProject[]
  publicProjects: RemoteProject[]
  
  // 仪表盘
  dashboard: DashboardData | null
  
  // 同步状态
  syncStatus: Record<string, SyncStatus>  // key: projectName
  
  // 操作
  setServerUrl: (url: string) => void
  login: (platform: string) => Promise<QRCodeSession>
  pollScanStatus: (sessionId: string) => Promise<ScanStatus>
  logout: () => void
  refreshToken: () => Promise<void>
  
  fetchDashboard: () => Promise<void>
  fetchRemoteTemplates: (query?: string, category?: string) => Promise<void>
  fetchRemoteProjects: () => Promise<void>
  fetchPublicProjects: (query?: string) => Promise<void>
  
  downloadTemplate: (owner: string, repo: string) => Promise<void>
  publishTemplate: (templateName: string, meta: PublishMeta) => Promise<void>
  
  pushProject: (projectName: string) => Promise<void>
  pullProject: (owner: string, repo: string) => Promise<void>
  checkSyncStatus: () => Promise<void>
}
```

### 4.4 新增 IPC 通道

```typescript
// 云服务 API 客户端（主进程）
'cloud:request'       // 通用 HTTP 请求代理
'cloud:health'        // 健康检查
'cloud:login'         // 生成登录二维码
'cloud:pollScan'      // 轮询扫码状态
'cloud:git-push'      // Git push
'cloud:git-pull'      // Git pull
'cloud:git-clone'     // Git clone
'cloud:download-file' // 下载文件
```

### 4.5 新增依赖

```json
{
  "dependencies": {
    "simple-git": "^3.x"   // Git 操作
  }
}
```

### 4.6 服务器端需扩展的 API

| 优先级 | 端点 | 说明 |
|--------|------|------|
| P0 | `GET /api/v1/client/version` | 返回最新版本号、下载链接、更新日志 |
| P0 | `PUT /api/v1/projects/{owner}/{repo}/files` | 接受文件变更（批量上传文件到仓库） |
| P0 | `GET /api/v1/projects/public` | 公开项目列表（支持搜索/分类） |
| P1 | `PUT /api/v1/projects/{owner}/{repo}/visibility` | 切换公开/私有 |
| P1 | `GET /api/v1/projects/{owner}/{repo}/sync` | 获取仓库最新 commit SHA（用于增量同步） |
| P1 | `POST /api/v1/user/avatar` | 上传用户头像 |
| P2 | `GET /api/v1/client/notifications` | 系统通知 |
| P2 | `POST /api/v1/projects/{owner}/{repo}/fork` | Fork 公开项目 |

---

## 5. 功能详细设计

### 5.1 用户认证流程

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  客户端   │     │  FastAPI  │     │  飞书/QQ  │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     │ POST /auth/qrcode?platform=feishu
     │───────────────>│                │
     │                │                │
     │ {session_id, auth_url}          │
     │<───────────────│                │
     │                │                │
     │ 显示二维码(auth_url)            │
     │                │                │
     │ 轮询 GET /auth/scan/status/{session_id}
     │───────────────>│                │
     │                │                │
     │ {status: "pending"}             │
     │<───────────────│                │
     │                │                │
     │                │ 用户扫码授权    │
     │                │<───────────────│
     │                │                │
     │ 轮询           │                │
     │───────────────>│                │
     │                │                │
     │ {status: "confirmed", token: "jwt..."}
     │<───────────────│                │
     │                │                │
     │ 保存 JWT Token 到本地加密存储    │
     │                │                │
     │ GET /user/profile (Bearer token)│
     │───────────────>│                │
     │                │                │
     │ {user_id, username, avatar_url, bindings...}
     │<───────────────│                │
```

**Token 管理策略：**
- JWT 存储在 Electron `safeStorage`（加密存储）
- 72h 过期前自动刷新（提前 1h 刷新）
- 应用启动时检查 Token 有效性
- Token 过期后自动跳转登录界面

### 5.2 模板市场

#### 5.2.1 浏览界面

```
┌────────────────────────────────────────────────┐
│  [搜索框]         [分类筛选]        [刷新]      │
├────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ 模板名称  │ │ 模板名称  │ │ 模板名称  │       │
│ │ 描述...   │ │ 描述...   │ │ 描述...   │       │
│ │ 作者 · 时间│ │ 作者 · 时间│ │ 作者 · 时间│      │
│ │ [安装]    │ │ [安装]    │ │ [安装]    │       │
│ └──────────┘ └──────────┘ └──────────┘       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ ...       │ │ ...       │ │ ...       │       │
│ └──────────┘ └──────────┘ └──────────┘       │
├────────────────────────────────────────────────┤
│              < 1  2  3 ... 10 >               │
└────────────────────────────────────────────────┘
```

#### 5.2.2 模板详情

```
┌────────────────────────────────────────────────┐
│  < 返回    模板名称                    [安装]   │
├────────────────────────────────────────────────┤
│  描述文本...                                   │
│                                                │
│  文件列表:                                     │
│  ├── template.j2          (2.3 KB)    [预览]   │
│  ├── config.yaml          (0.5 KB)    [预览]   │
│  └── README.md            (1.1 KB)    [预览]   │
│                                                │
│  统计: 下载 128 次 · 使用 45 次                  │
└────────────────────────────────────────────────┘
```

#### 5.2.3 一键安装流程

```
用户点击 [安装]
  → 检查本地是否已存在同名模板
    → 存在：提示覆盖/重命名
  → 下载模板文件到本地 template/ 目录
  → 显示进度
  → 完成后刷新本地模板列表
  → Toast 提示安装成功
```

### 5.3 项目同步

#### 5.3.1 同步架构

```
客户端 (Electron)                服务器 (Gitea)
┌─────────────────┐           ┌─────────────────┐
│ workspace/       │           │ repos/          │
│  project-a/      │──push──>  │  user/project-a │
│  project-b/      │<─pull───  │  user/project-b │
│  project-c/      │           │  user/project-c │
└─────────────────┘           └─────────────────┘

同步策略（按优先级）：
1. Gitea REST API 文件级操作（优先）
2. Git CLI (simple-git) 作为增量/完整操作（备用）
3. 手动文件上传/下载（兜底）
```

#### 5.3.2 推送项目到云端

```
用户选择项目 → 点击 [推送到云端]
  → 弹窗确认：
    ┌──────────────────────────────┐
    │  推送项目到云端               │
    │                              │
    │  项目名称: [project-a]        │
    │  描述: [________________]    │
    │  可见性: ○ 私有  ○ 公开      │
    │                              │
    │  文件变更:                    │
    │  ├── templates/main.j2  (修改)│
    │  ├── excel/para.xlsx    (新增)│
    │  └── yaml/output.yaml   (删除)│
    │                              │
    │  [取消]        [确认推送]     │
    └──────────────────────────────┘
  → 上传文件到 Gitea 仓库
  → 更新本地记录的 commit SHA
  → Toast 提示推送成功
```

#### 5.3.3 从云端拉取项目

```
用户进入远程项目列表 → 点击 [拉取到本地]
  → 如果本地不存在同名项目：
    → 直接 clone/download 到 workspace/
  → 如果本地已存在：
    ┌──────────────────────────────┐
    │  项目已存在                   │
    │                              │
    │  本地版本: 2026-07-20 10:30   │
    │  云端版本: 2026-07-22 15:00   │
    │                              │
    │  ○ 覆盖本地（云端为准）       │
    │  ○ 合并（保留本地修改）       │
    │  ○ 另存为新项目              │
    │                              │
    │  [取消]        [确认]        │
    └──────────────────────────────┘
```

#### 5.3.4 同步状态指示

在项目列表中显示同步状态：

```
项目名称         状态
─────────────────────
project-a        ✓ 已同步
project-b        ↑ 本地有未推送的修改
project-c        ↓ 云端有更新
project-d        ○ 仅本地
project-e        ☁ 仅云端
```

### 5.4 发布模板到市场

```
用户在本地模板 → 右键 [发布到市场]
  → 弹窗：
    ┌──────────────────────────────┐
    │  发布模板到市场               │
    │                              │
    │  模板名称: [my-template]      │
    │  描述: [________________]    │
    │  分类: [交换机 ▼]            │
    │  可见性: ○ 公开  ○ 私有      │
    │                              │
    │  包含文件:                    │
    │  ☑ template.j2               │
    │  ☑ config.yaml               │
    │  ☑ README.md                 │
    │  ☐ excel/para.xlsx (敏感)    │
    │                              │
    │  [取消]        [发布]        │
    └──────────────────────────────┘
  → 上传文件到服务器
  → 设置 topics 标记
  → Toast 提示发布成功
```

### 5.5 客户端仪表盘

```
┌────────────────────────────────────────────────┐
│  欢迎, username                        [头像]   │
├────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  模板     │ │  项目     │ │  连接状态  │       │
│  │   12      │ │   8      │ │  ● 正常   │       │
│  └──────────┘ └──────────┘ └──────────┘       │
│                                                │
│  最近模板:                                      │
│  ├── template-a  (2天前)                       │
│  ├── template-b  (5天前)                       │
│  └── template-c  (1周前)                       │
│                                                │
│  最近项目:                                      │
│  ├── project-x  (昨天)                         │
│  ├── project-y  (3天前)                        │
│  └── project-z  (1周前)                        │
│                                                │
│  [浏览模板市场]  [管理我的项目]                  │
└────────────────────────────────────────────────┘
```

### 5.6 连接状态管理

```
连接状态机：
  disconnected → connecting → connected
       ↑            ↓             ↓
       └──── disconnected ←─── error

Header 状态图标：
  ● 已连接（绿色）  点击 → 打开云中心面板
  ◌ 连接中（黄色）  点击 → 重试
  ○ 未连接（灰色）  点击 → 打开设置/登录
  ✕ 错误（红色）    点击 → 显示错误详情
```

---

## 6. 开发规范

### 6.1 代码组织规范

```
src/
├── stores/
│   └── cloud.store.ts           # 新增：云服务状态管理
├── services/
│   └── cloudApi.service.ts      # 新增：云服务 API 客户端
├── components/
│   └── cloud/                   # 新增：云服务组件目录
│       ├── CloudPanel.tsx        # 云中心面板容器
│       ├── LoginView.tsx         # 登录界面
│       ├── QRCodeDialog.tsx      # 二维码弹窗
│       ├── DashboardView.tsx     # 仪表盘
│       ├── TemplateMarketView.tsx # 模板市场
│       ├── TemplateDetailView.tsx # 模板详情
│       ├── RemoteProjectView.tsx  # 远程项目
│       ├── PublishDialog.tsx     # 发布模板弹窗
│       ├── PushDialog.tsx        # 推送项目弹窗
│       ├── PullDialog.tsx        # 拉取项目弹窗
│       ├── CloudStatusIndicator.tsx # 连接状态图标
│       └── SyncStatusBadge.tsx   # 同步状态标签
├── types/
│   └── cloud.ts                 # 新增：云服务类型定义
└── i18n/
    └── resources/
        └── cloud.ts             # 新增：云服务多语言资源

electron/
├── ipc/
│   └── cloud.handler.ts         # 新增：云服务 IPC 处理器
├── services/
│   └── cloud.service.ts         # 新增：主进程云服务
└── utils/
    └── git.ts                   # 新增：Git 操作工具
```

### 6.2 数据流规范

```
用户操作 → 组件 dispatch → cloud.store action
  → cloudApi.service (renderer) → IPC invoke
  → cloud.handler (main process) → HTTP request
  → FastAPI server → Gitea API
  → 响应原路返回 → cloud.store 更新 → 组件 re-render
```

### 6.3 安全规范

| 场景 | 规范 |
|------|------|
| JWT 存储 | 使用 Electron `safeStorage.encryptString()` 加密存储 |
| API 通信 | 全部使用 HTTPS（生产环境强制） |
| Token 传输 | Authorization: Bearer header，不放在 URL 中 |
| Git 认证 | 使用 Gitea Personal Access Token，不存储密码 |
| 本地敏感数据 | API Key、Token 等使用 safeStorage 或 keytar |
| 请求校验 | 客户端校验文件大小、类型后再上传 |
| 错误处理 | 不暴露完整错误堆栈给用户，显示友好提示 |

### 6.4 UI/UX 规范

| 规范 | 说明 |
|------|------|
| 加载状态 | 所有远程操作使用 `LoadingState` 组件（已有） |
| 错误提示 | 网络错误使用 Toast 组件显示（已有） |
| 空状态 | 未登录/无数据时显示引导界面 |
| 多语言 | 所有 UI 文本使用 `t()` 调用，同步添加中英文翻译 |
| 主题适配 | 支持 Light/Dark/System 三态 |
| 响应式 | 云面板在侧边栏中显示，需适配不同宽度 |
| 键盘快捷键 | `Ctrl+Shift+C` 打开云中心面板 |

### 6.5 状态持久化规范

```typescript
// cloud.store 持久化策略
partialize: (state) => ({
  serverUrl: state.serverUrl,       // 服务器地址
  // 注意：accessToken 不持久化到 localStorage
  // 使用 Electron safeStorage 单独加密存储
})
```

### 6.6 Git 操作规范

| 场景 | 方法 | 说明 |
|------|------|------|
| 推送项目 | 文件级 REST API 上传 | 优先使用 Gitea API 逐文件上传，避免 Git 复杂性 |
| 拉取项目 | Git clone (shallow) | 使用 `git clone --depth 1` 浅克隆 |
| 增量同步 | REST API sync/check | SHA 比对确定变更，再决定推送/拉取 |
| 冲突处理 | 提示用户选择 | 不做自动合并，由用户手动选择策略 |

### 6.7 错误处理规范

```typescript
// 错误分类与处理
enum CloudErrorType {
  NETWORK = 'network',         // 网络不可达 → 显示连接状态
  AUTH_EXPIRED = 'auth_expired', // Token 过期 → 自动刷新或重新登录
  AUTH_INVALID = 'auth_invalid', // Token 无效 → 重新登录
  RATE_LIMIT = 'rate_limit',   // 频率限制 → 提示稍后重试
  SERVER_ERROR = 'server_error', // 服务器错误 → 提示稍后重试
  CONFLICT = 'conflict',       // 冲突 → 提示用户选择策略
  NOT_FOUND = 'not_found',     // 资源不存在 → 提示已删除
  VALIDATION = 'validation',   // 数据校验失败 → 显示具体错误
}
```

### 6.8 测试规范

| 测试类型 | 覆盖范围 | 工具 |
|---------|---------|------|
| 单元测试 | cloud.store actions, cloudApi.service | Vitest |
| 集成测试 | IPC 通道、HTTP 请求 mock | Vitest + MSW |
| E2E 测试 | 登录流程、模板下载、项目推送 | Playwright |
| 手动测试 | 真实服务器连接、Git 操作 | 测试清单 |

---

## 7. 里程碑与交付物

### Phase 1: 基础连接 (v3.5.0-alpha)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 服务器配置 | 设置面板新增服务器地址配置 | 可输入 URL 并保存 |
| 健康检查 | 连接测试按钮 | 点击后显示连接状态 |
| 扫码登录 | QRCodeDialog + 轮询 | 手机扫码 → 客户端获取 Token → 显示用户信息 |
| Token 管理 | 加密存储 + 自动刷新 | 重启应用后 Token 有效，过期前自动刷新 |
| 用户资料 | 云面板显示用户信息 | 头像、用户名、绑定平台显示正确 |

### Phase 2: 模板市场 (v3.5.0-beta)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 远程模板浏览 | TemplateMarketView | 搜索、分类筛选、分页正常 |
| 模板详情 | TemplateDetailView | 文件列表、预览、统计信息 |
| 一键安装 | downloadTemplate | 下载到本地 template/ 目录，刷新本地模板列表 |
| 模板发布 | PublishDialog | 本地模板发布到服务器，分类正确 |

### Phase 3: 项目同步 (v3.5.0-rc)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 推送项目 | PushDialog + 文件上传 | 项目文件推送到 Gitea 仓库 |
| 拉取项目 | PullDialog + 下载 | 从云端 clone 到 workspace/ |
| 同步状态 | SyncStatusBadge | 项目列表显示同步状态 |
| 增量检测 | checkSyncStatus | SHA 比对正确 |

### Phase 4: 完善上线 (v3.5.0)

| 任务 | 交付物 | 验收标准 |
|------|--------|---------|
| 客户端仪表盘 | DashboardView | 统计数据正确 |
| 公开项目浏览 | RemoteProjectView | 可浏览/搜索公开项目 |
| 远程项目列表 | 我的云端项目 | 显示所有云端项目 |
| 冲突处理 | 冲突弹窗 | 三个选项可用 |
| 全链路测试 | 测试报告 | 所有 P0/P1 功能通过 |
| 多语言 | 中英文翻译 | 所有新增文本覆盖 |

---

## 附录 A：API 类型定义参考

```typescript
// src/types/cloud.ts

export interface UserProfile {
  user_id: number
  username: string
  full_name: string
  email: string
  avatar_url: string
  bio: string
  location: string
  website: string
  created_at: string
  bindings: SocialBinding[]
}

export interface SocialBinding {
  platform: 'feishu' | 'qq' | 'wechat'
  open_id: string
  nickname: string
  avatar_url: string
  created_at: string
}

export interface QRCodeSession {
  session_id: string
  auth_url: string
  expires_in: number
}

export interface ScanStatus {
  status: 'pending' | 'confirmed' | 'expired'
  token?: string
  user?: { id: number; username: string }
}

export interface RemoteTemplate {
  id: number
  name: string
  owner: string
  description: string
  category: string
  public: boolean
  html_url: string
  clone_url: string
  updated_at: string
}

export interface TemplateDetail extends RemoteTemplate {
  files: { path: string; size: number }[]
}

export interface RemoteProject {
  name: string
  description: string
  private: boolean
  html_url: string
  clone_url: string
  updated_at: string
}

export interface DashboardData {
  template_count: number
  project_count: number
  recent_templates: RemoteTemplate[]
  recent_projects: RemoteProject[]
}

export interface SyncStatus {
  status: 'synced' | 'local_only' | 'remote_only' | 'local_ahead' | 'remote_ahead' | 'conflict'
  localSha?: string
  remoteSha?: string
  lastSyncAt?: string
}

export interface PublishMeta {
  name: string
  description: string
  category: string
  public: boolean
  files: { path: string; content: string }[]
}
```

## 附录 B：服务器端 API 扩展建议

以下 API 需要服务器端新增，按优先级排序：

### P0 优先级

```python
# GET /api/v1/client/version
# 返回最新客户端版本信息
{
  "code": 0,
  "data": {
    "latest_version": "3.5.0",
    "latest_build": "26080101",
    "download_url": "https://github.com/...",
    "release_notes": "## v3.5.0\n- 云集成...",
    "min_version": "3.4.0"  # 最低兼容版本
  }
}

# PUT /api/v1/projects/{owner}/{repo}/files
# 批量上传文件到项目仓库
# Request: { "files": [{"path": "templates/main.j2", "content": "base64..."}], "message": "Update" }
# Response: { "code": 0, "data": { "committed": true, "sha": "abc123" } }

# GET /api/v1/projects/public
# 公开项目列表
# Query: ?q=search&category=xxx&page=1&limit=20
# Response: { "code": 0, "data": { "projects": [...], "total": 42 } }
```

### P1 优先级

```python
# PUT /api/v1/projects/{owner}/{repo}/visibility
# Request: { "private": false }
# Response: { "code": 0, "data": { "private": false } }

# GET /api/v1/projects/{owner}/{repo}/sync
# 返回仓库最新 commit 信息
# Response: { "code": 0, "data": { "sha": "abc123...", "message": "...", "timestamp": "..." } }

# POST /api/v1/user/avatar
# 上传用户头像（multipart/form-data）
```

### P2 优先级

```python
# GET /api/v1/client/notifications
# Response: { "code": 0, "data": { "notifications": [...] } }

# POST /api/v1/projects/{owner}/{repo}/fork
# Response: { "code": 0, "data": { "owner": "current_user", "repo": "forked-project" } }
```
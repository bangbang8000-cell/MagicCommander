# MagicCommander 客户端 v3.5 云集成 PRD 与开发规范

> 版本：v1.1  
> 日期：2026-07-23  
> 状态：已批准  
> 基于：服务器端 API 现状评估 + 客户端 v3.4.1 功能审计 + v3.5 四 Build 上线后评估

---

## 目录

1. [服务器端 API 能力评估](#1-服务器端-api-能力评估)
2. [客户端现有功能审计](#2-客户端现有功能审计)
3. [差距分析与需求矩阵](#3-差距分析与需求矩阵)
4. [v3.5 云集成 PRD](#4-v35-云集成-prd)
5. [功能详细设计](#5-功能详细设计)
6. [开发规范](#6-开发规范)
7. [里程碑与交付物](#7-里程碑与交付物)
8. [v3.5.x 界面与体验优化](#8-v35x-界面与体验优化)

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
| P0 | 公开项目浏览 | `GET /api/v1/projects/public` | 浏览公开项目，支持 `?q=xxx&page=1&limit=20` 搜索和分页 |
| P0 | 项目搜索（我的项目） | `GET /api/v1/projects?q=xxx` | 搜索用户自己的项目，在现有列表端点加 `?q=` 参数 |
| P1 | 项目公开/私有切换 | `PUT /api/v1/projects/{owner}/{repo}/visibility` | 切换公开/私有状态 |
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

## 8. v3.5.x 界面与体验优化

> 评估日期：2026-07-23  
> 评估范围：v3.5 四 Build 上线后，客户端与云平台的界面、交互、用户体验系统性问题

### 8.1 问题总览

| 优先级 | 问题领域 | 严重程度 | 说明 |
|--------|----------|----------|------|
| **P0** | 用户资料界面 | 高 | 展示编程字段（userId），非用户可理解的场景字段 |
| **P0** | 设置面板结构 | 高 | 分类混乱，AI/外观/通用/高级/平台混杂 |
| **P0** | 硬编码中文 | 高 | 13+ 个组件存在未走 i18n 的硬编码中文文本 |
| **P1** | 菜单顺序与完整性 | 中 | ActivityBar 中 cloud 排第一，不符合心智模型；View 菜单缺少 cloud 入口 |
| **P1** | 模板/项目同步入口 | 中 | 模板列表缺少同步操作；项目仅有点击上传，无拉取按钮 |
| **P1** | 多语言覆盖 | 中 | cloud.json 翻译键严重不足；非中/英文语言缺少 cloud/chat 翻译 |
| **P1** | 云端搜索 | 中 | 云端项目和模板市场缺少搜索功能，公开项目浏览无搜索 |
| **P2** | 登录体验 | 中 | QQ/微信登录未配置但显示为可用；无 Token 过期自动刷新 |
| **P2** | Dashboard 界面 | 中 | 硬编码中文；按钮跳转目标不正确；缺少通知中心 |
| **P2** | 云端通知与版本检查 | 低 | 服务端缺少通知公告、版本检查 API |

### 8.2 用户资料界面重构 (P0)

**现状问题：**
- `UserProfileView.tsx` 仅展示 `username` 和 `userId`（Gitea 内部 ID），用户无法理解
- `/api/v1/user/profile` 已返回 `full_name`, `email`, `avatar_url`, `bio`, `location`, `website`, `bindings`，但客户端未使用
- 缺少编辑入口

**改进设计：**

```
用户资料卡片（下拉面板）：
┌─────────────────────────────┐
│  [头像]  显示名称             │
│          @username           │
│          bio (如有)           │
├─────────────────────────────┤
│  📧 email                   │
│  📍 location (如有)          │
│  🔗 website (如有)           │
├─────────────────────────────┤
│  绑定账号:                   │
│  🕊️ 飞书 - 已绑定 [昵称]     │
│  🐧 QQ   - 未绑定 [+绑定]    │
│  💬 微信 - 未绑定 [+绑定]    │
├─────────────────────────────┤
│  ✏️ 编辑资料                 │
│  🌐 打开平台                 │
│  🚪 退出登录                 │
└─────────────────────────────┘
```

**客户端改动：**
- `UserProfileView.tsx`：调用 `GET /api/v1/user/profile` 获取完整资料，展示用户场景字段
- 新增 `EditProfileDialog.tsx`：调用 `PUT /api/v1/user/profile` 编辑 full_name 和 bio

**云端改动建议：**
- 增加 `POST /api/v1/user/avatar` 头像上传端点
- 实现 `POST /api/v1/auth/bindings` 多平台绑定逻辑（当前为占位）

### 8.3 ActivityBar 菜单顺序调整 (P1)

**现状：** `cloud → search → chat → explorer → workbench → output → settings`

**改进后：** `search → cloud → chat → explorer → workbench → output → settings`

**理由：**
- "搜索"是最高频操作，应在最顶部
- "云平台"是连接外部服务的入口，放在搜索和 AI 之间符合"本地→云端→AI"的逻辑层次
- 底部保留 settings（最低频）

**联动改动：**
- Header View 菜单添加 `cloud` 入口
- 热键注册添加 `Ctrl+Shift+C` → cloud
- `App.tsx` 中 `useHotkey` 添加 cloud 快捷键

### 8.4 设置面板重新分类 (P0)

**现状问题：**
- 6 个区块平铺：AI 配置 → 策略路由 → 外观 → 通用设置 → 平台连接 → 高级设置
- "策略路由"应属于 AI 配置子项
- "外观"（仅有主题切换）与 Header 中的主题按钮功能重复
- "软件更新"在通用设置里，但和通用设置无关
- "平台连接"应在更显眼的位置

**改进方案：采用分组 tabs 结构**

```
设置面板
├── 📋 通用 (General)
│   ├── 语言选择
│   ├── 外观 (主题: 浅色/深色/跟随系统)
│   ├── 字体大小 (小/中/大)
│   ├── 自动保存 (开关 + 间隔)
│   └── 工作区路径
│
├── 🤖 AI (AI Configuration)
│   ├── Provider 选择卡片 (DeepSeek/OpenAI/Claude等)
│   ├── 当前 Provider 配置 (API Key / Base URL / Model)
│   ├── 测试连接 / 获取模型
│   ├── 智能路由 (开关 + 任务类型 → Provider 映射)
│   └── 自主模式 (顾问/半自动/全自动)
│
├── ☁️ 平台 (Platform)
│   ├── 服务器地址 + 测试连接
│   ├── 登录状态 (已登录/未登录)
│   ├── 账号信息 (来自 user/profile)
│   └── 同步设置 (自动检查同步间隔等，未来)
│
├── 🔧 高级 (Advanced)
│   ├── Python 路径
│   ├── AI Hub 端口 + 自动启动
│   ├── 代理设置
│   ├── 调试模式
│   └── 软件更新 (检查更新按钮 + 自动检查开关)
│
└── 📊 关于 (About)
    ├── 版本信息
    ├── 检查更新
    └── 开源协议
```

**改动说明：**
- "外观"合并到"通用"（主题 + 字体大小在一起更合理）
- "策略路由"和"自主模式"合并到"AI"
- "平台连接"独立为"平台"tab，从"通用设置"中移出
- "软件更新"移到"高级"
- 新增"关于"tab

### 8.5 菜单和多语言体系更新 (P1)

#### 8.5.1 菜单栏更新

**Header View 菜单** 添加 cloud 入口：
```typescript
view: [
  renderMenuItem('search', ...),
  renderMenuItem('cloud', '云平台', 'Ctrl+Shift+C', ...),  // 新增
  renderMenuItem('explorer', ...),
  renderMenuItem('workbench', ...),
  renderMenuItem('chat', ...),
  renderMenuItem('output', ...),
]
```

#### 8.5.2 多语言覆盖率

**现状问题：**
- 13 种语言中，只有 `zh-CN` 和 `en` 有完整的 `cloud.json` 和 `chat.json`
- `cloud.json` 当前仅约 20 个键，缺少大量 UI 文本翻译
- 多个组件存在硬编码中文

**硬编码中文清单（需修复）：**

| 文件 | 硬编码文本 |
|------|-----------|
| `CloudPanel.tsx` | `'仪表盘'`, `'模板市场'`, `'远程项目'`, `'MagicCommander Platform'`, `'登录'` |
| `DashboardView.tsx` | `'请先登录...'`, `'加载失败:'`, `'欢迎, {username}'`, `'我的模板'`, `'浏览模板市场'` 等 |
| `SyncStatusBadge.tsx` | `'已同步'`, `'仅本地'`, `'仅云端'`, `'冲突'` 等 |
| `ProjectListItem.tsx` | `'推送到云端'`, `'在资源管理器中打开'` |
| `LoginDialog.tsx` | `'飞书'`, `'QQ'`, `'微信'`, `'扫描二维码登录'` |
| `UserProfileView.tsx` | `'打开平台'`, `'退出登录'` |

**改进方案：**

| 任务 | 说明 |
|------|------|
| 补全 `cloud.json` 翻译键 | 新增 `profile.*`, `status.*`, `sync.*`, `push.*`, `pull.*`, `login.*`, `auth.*`, `settings.*` 等 key |
| 消除所有硬编码中文 | 上述 13 个文件全部替换为 `t()` 调用 |
| 为所有语言生成 cloud.json | 至少覆盖 zh-CN/zh-TW/en/ja/ko 五种语言 |
| 新增 `auth` 翻译命名空间 | 将登录/认证相关文本独立管理 |

### 8.6 本地项目/模板同步入口增强 (P1)

#### 8.6.1 项目列表同步操作

**现状：** `ProjectListItem` 有 `onPush` 上传按钮，但缺少拉取按钮和完整的状态操作

**改进设计：**

```tsx
// ProjectListItem 增加操作按钮组
<div className="project-actions">
  {syncStatus === 'local_only' && <PushButton onClick={onPush} />}
  {syncStatus === 'remote_only' && <PullButton onClick={onPull} />}
  {syncStatus === 'local_ahead' && <PushButton onClick={onPush} />}
  {syncStatus === 'remote_ahead' && <PullButton onClick={onPull} />}
  {syncStatus === 'conflict' && <ResolveConflictButton onClick={onResolve} />}
  {syncStatus === 'synced' && <SyncedCheckmark />}
  <OpenFolderButton onClick={onOpenFolder} />
</div>
```

#### 8.6.2 模板列表同步操作

**现状：** 模板中心（TemplateCenter）没有向服务端同步的入口

**改进方案：**
- 本地模板列表项增加"发布到云端"按钮
- 支持从本地模板创建远程模板（调用 `POST /api/v1/templates`）
- 远程模板列表项增加"安装到本地"按钮

**云端改动建议：**

| 端点 | 说明 | 优先级 |
|------|------|--------|
| `POST /api/v1/projects/{owner}/{repo}/sync` | 触发服务端同步（合并冲突） | P2 |
| `GET /api/v1/templates/check` | 批量检查本地模板与云端版本差异 | P2 |
| `PUT /api/v1/projects/{owner}/{repo}` | 更新项目信息（当前仅支持创建/删除） | P2 |

### 8.7 云端项目与模板搜索 (P1)

#### 8.7.1 现状分析

| 端点 | 搜索支持 | 说明 |
|------|----------|------|
| `GET /api/v1/templates?q=xxx&category=xxx` | 已支持 | 模板搜索已实现 |
| `GET /api/v1/projects` | 不支持 | 仅列出当前用户的所有项目 |
| `GET /api/v1/projects/public` | 不存在 | 公开项目浏览端点未实现 |
| Gitea `search_repos()` | 已封装 | 服务端已封装搜索方法 |

#### 8.7.2 推荐方案：混合搜索（客户端过滤 + 服务端搜索）

```
搜索策略（按 tab 不同）：
┌──────────────────┬─────────────────────────────┐
│ Tab              │ 搜索策略                      │
├──────────────────┼─────────────────────────────┤
│ "我的项目" tab   │ 客户端即时过滤（数据已全量加载）│
│ "公开项目" tab   │ 服务端搜索（数据量不可控）     │
│ "模板市场" tab   │ 服务端搜索（已有 `?q=` 参数）  │
│ "仪表盘" tab     │ 不搜索（仅统计展示）           │
└──────────────────┴─────────────────────────────┘
```

**为什么不全用服务端搜索？**
- "我的项目"数量通常很小（几十个），客户端过滤响应更快（0ms vs 网络延迟）
- 减少不必要的网络请求

**为什么不全用客户端过滤？**
- "公开项目"和"模板市场"可能有成百上千条，客户端无法一次性加载全量
- 服务端 Gitea 已有成熟的搜索 API

#### 8.7.3 交互设计

```
┌─────────────────────────────────────────────────┐
│  MagicCommander Platform                  [登录] │
│  🔍 搜索项目名称或描述...                        │
├─────────────────────────────────────────────────┤
│  [仪表盘] [模板市场] [远程项目]                   │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌─ 远程项目 ─────────────────────────────────┐ │
│  │ [我的项目] [公开项目]          [刷新]       │ │
│  │                                            │ │
│  │ 当用户在搜索框输入时:                        │ │
│  │ - "我的项目": 实时客户端过滤，名称/描述匹配   │ │
│  │ - "公开项目": 380ms 防抖后服务端搜索         │ │
│  │                                            │ │
│  │ ┌──────────────────────────────────────┐   │ │
│  │ │ project-name    私有  [已同步]  ⬇️ 🗑️ │   │ │
│  │ │ description text...                  │   │ │
│  │ │ owner · 2024-07-23                   │   │ │
│  │ └──────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**搜索行为细节：**
- 输入框带清除按钮（X）
- 380ms 防抖，减少服务端请求频率
- 空搜索词时，服务端搜索恢复默认列表（最近更新）
- 搜索时显示加载状态（spinner）
- 无结果时显示空状态："未找到匹配的项目/模板"

#### 8.7.4 服务端改动

**新增公开项目搜索端点：**
```python
# GET /api/v1/projects/public?q=xxx&page=1&limit=20
# 使用 Gitea search_repos() API，过滤掉私有仓库和模板仓库
# 返回: { projects: [...], total: N, page: 1, limit: 20 }
```

**为现有项目列表增加搜索参数：**
```python
# GET /api/v1/projects?q=xxx
# 当 q 非空时，使用 Gitea 搜索 + 过滤当前用户自己的仓库
# 当 q 为空时，保持原有逻辑（列出所有项目）
```

#### 8.7.5 客户端改动

| 任务 | 文件 | 说明 |
|------|------|------|
| 新增 SearchInput 组件 | `SearchInput.tsx` (新) | 带防抖的搜索输入框，380ms 防抖 |
| CloudPanel 集成搜索栏 | `CloudPanel.tsx` | 顶部添加搜索栏，搜索词向下传递 |
| RemoteProjectView 混合搜索 | `RemoteProjectView.tsx` | "我的项目"客户端过滤，"公开项目"服务端搜索 |
| TemplateMarket 组件实现 | `TemplateMarket.tsx` (新) | 模板市场搜索 + 卡片列表（当前为占位界面） |
| platform.ts API 扩展 | `platform.ts` | 新增 `projects.searchPublic(q, page)` 方法 |

### 8.8 登录体验优化 (P2)

**现状问题：**
- QQ/微信登录在服务端有端点但未配置 App ID，客户端显示但无法使用
- Token 过期后无自动刷新
- 登录成功后无 session 持久化状态提示

**改进方案：**

| 任务 | 说明 |
|------|------|
| 动态显示可用登录方式 | 调用 `GET /api/v1/auth/health` 检查 `feishu/qq/wechat` 是否配置，未配置的灰显 |
| Token 自动刷新 | 在 `platform.ts` 的 `request()` 中检测 401，自动调用 `auth.refresh()` |
| 登录状态持久化 | 在 `LoginDialog` 添加"记住登录状态"复选框；使用 `safeStorage` 加密存储 Token |
| 登录过期提示 | Token 过期后在 UI 显示"登录已过期，请重新登录"的 toast 提示 |
| 多平台绑定实现 | 实现 `POST /api/v1/auth/bindings` 添加绑定逻辑 |

### 8.9 Dashboard 界面优化 (P2)

**现状问题：**
- 硬编码中文
- "浏览模板市场"和"管理我的项目"按钮都跳转到同一个 cloud 面板的 tabs
- 缺少通知/公告区域

**改进设计：**

```
仪表盘 (Dashboard)
├── 👤 欢迎区域
│   ├── 头像 + 显示名称 + @username
│   └── 服务器状态 + 连接指示
│
├── 📊 统计卡片 (横向排列)
│   ├── 我的模板: N
│   ├── 我的项目: N
│   └── 平台用户: N (新增，调用公开统计 API)
│
├── 🔔 通知中心 (新增)
│   ├── 平台公告 (服务端推送)
│   └── 同步提醒 (本地有未推送的更改)
│
├── 📋 最近模板 (保留)
│   └── 每项增加"安装到本地"按钮
│
├── 📁 最近项目 (保留)
│   └── 每项增加"拉取到本地"按钮
│
└── ⚡ 快捷操作
    ├── 浏览模板市场 → 跳转到 explorer 的模板中心标签
    ├── 管理远程项目 → 跳转到 CloudPanel 的远程项目 tab
    └── 发布模板 → 打开发布对话框
```

### 8.10 云端服务端优化建议 (P2-P3)

| 端点 | 说明 | 优先级 |
|------|------|--------|
| `GET /api/v1/client/version` | 客户端版本检查（返回最新版本号、下载链接、更新日志） | P1 |
| `GET /api/v1/announcements` | 平台公告/通知列表 | P2 |
| `GET /api/v1/public/stats` | 公开统计（总用户数、总模板数、总项目数） | P2 |
| `POST /api/v1/user/avatar` | 头像上传 | P3 |
| `PUT /api/v1/projects/{owner}/{repo}` | 更新项目（名称、描述、公开/私有） | P2 |
| `GET /api/v1/projects/public?q=xxx` | 公开项目搜索（新增） | P0 |
| `GET /api/v1/projects?q=xxx` | 用户项目搜索（扩展） | P0 |

### 8.11 文件变更预估

| 类别 | 新增文件 | 修改文件 |
|------|----------|----------|
| 客户端组件 | 4 (EditProfileDialog, SearchInput, TemplateMarket, NotificationCenter) | 15+ |
| 多语言 | 22 (11语言 × 2文件 cloud/chat) | 2 (zh-CN/en cloud.json) |
| 服务端 | 2 (notifications 路由, project search 扩展) | 3 (auth, client, user) |
| 文档 | 0 | 2 (PRD + 开发计划) |

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
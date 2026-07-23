# MagicCommander v3.5 云集成开发计划

> 版本：v1.1  
> 日期：2026-07-23  
> 基于：[CLIENT_CLOUD_INTEGRATION_PRD.md](./CLIENT_CLOUD_INTEGRATION_PRD.md) v1.1  
> 版本号规则：`V{MAJOR}.{MINOR}.{PATCH}-build.{YYMMDDNN}`

---

## 目录

1. [版本路线图](#1-版本路线图)
2. [Build 26072601 - 基础连接](#2-build-26072601---基础连接)
3. [Build 26080201 - 模板市场](#3-build-26080201---模板市场)
4. [Build 26080901 - 项目同步](#4-build-26080901---项目同步)
5. [Build 26081601 - 完善上线](#5-build-26081601---完善上线)
6. [Build 26082301 - UI 重构与多语言](#6-build-26082301---ui-重构与多语言)
7. [Build 26083001 - 同步与搜索](#7-build-26083001---同步与搜索)
8. [Build 26090601 - 登录体验与云端完善](#8-build-26090601---登录体验与云端完善)
9. [文件变更清单](#9-文件变更清单)
10. [风险评估](#10-风险评估)

---

## 1. 版本路线图

```
V3.5.0 Build 26081601  (当前版本 - 四 Build 完成后)
        │
        ├── Build 26082301  [UI重构与多语言]  用户资料重构 + 设置面板重组 + 硬编码消除 + 菜单顺序 + 多语言补全
        │
        ├── Build 26083001  [同步与搜索]      项目/模板同步按钮 + 云端搜索 + Dashboard 优化 + 模板市场实现
        │
        └── Build 26090601  [登录体验与云端]  登录优化 + 通知中心 + 版本检查 + 云端 API 扩展
                                       ↓
                              V3.5.x Build 26090601  (下一个正式发布)
```

每个 Build 独立可测、可发布，后一个 Build 依赖前一个 Build 的功能。

---

## 2. Build 26072601 - 基础连接

### 目标
让用户能够配置服务器地址、扫码登录、查看个人资料。这是后续所有云功能的前置依赖。

### 2.1 服务器端扩展（需同步完成）

| 任务 | 文件 | 说明 |
|------|------|------|
| 客户端版本检查 API | `api/routes/client.py` | 新增 `GET /api/v1/client/version`，返回最新版本号、下载链接、更新日志 |

### 2.2 客户端新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/types/cloud.ts` | 类型定义 | 全部云服务类型（UserProfile, QRCodeSession, ScanStatus 等） |
| `src/stores/cloud.store.ts` | Zustand Store | 连接状态、Token、用户信息、登录/登出/刷新 |
| `src/services/cloudApi.service.ts` | 服务层 | HTTP 请求封装（renderer 侧，通过 IPC 调用主进程） |
| `electron/services/cloud.service.ts` | 主进程服务 | HTTP 请求、Token 加密存储、Git 操作 |
| `electron/ipc/cloud.handler.ts` | IPC 处理器 | cloud:request, cloud:health, cloud:login, cloud:pollScan |
| `src/components/cloud/CloudPanel.tsx` | UI 组件 | 云中心面板容器（未登录→LoginView / 已登录→DashboardView） |
| `src/components/cloud/LoginView.tsx` | UI 组件 | 登录界面（平台选择：飞书/QQ/微信） |
| `src/components/cloud/QRCodeDialog.tsx` | UI 组件 | 二维码弹窗（显示二维码 + 轮询状态） |
| `src/components/cloud/UserProfileView.tsx` | UI 组件 | 用户资料展示 |
| `src/components/cloud/CloudStatusIndicator.tsx` | UI 组件 | Header 连接状态图标 |
| `src/i18n/resources/cloud.ts` | 多语言 | 云服务相关中英文翻译 |

### 2.3 客户端修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/App.tsx` | 引入 CloudPanel，注册 CloudActivity 活动入口 |
| `src/components/layout/Header.tsx` | 引入 CloudStatusIndicator |
| `src/components/layout/ActivityBar.tsx` | 添加云中心活动图标 |
| `src/components/sidebar/SettingsPanel.tsx` | 新增服务器地址配置项（`serverUrl`） |
| `src/stores/ui.store.ts` | 新增 `cloudPanelActive` 状态 |
| `electron/ipc/handlers.ts` | 注册 cloud.* IPC 通道 |
| `electron/main.ts` | 初始化 cloud handler |
| `package.json` | 版本号更新为 `3.5.0` |
| `electron/config.ts` | VERSION 更新为 `3.5.0`，BUILD 更新为 `26072601` |

### 2.4 详细任务分解

#### 任务 2.4.1：类型定义 `src/types/cloud.ts`

```typescript
// 定义所有云服务类型
export interface UserProfile { /* ... */ }
export interface SocialBinding { /* ... */ }
export interface QRCodeSession { /* ... */ }
export interface ScanStatus { /* ... */ }
export interface DashboardData { /* ... */ }
export interface RemoteTemplate { /* ... */ }
export interface RemoteProject { /* ... */ }
export interface SyncStatus { /* ... */ }
export interface PublishMeta { /* ... */ }
export enum CloudErrorType { /* ... */ }
```

#### 任务 2.4.2：云服务 Store `src/stores/cloud.store.ts`

```
状态：
  - serverUrl: string (持久化到 localStorage)
  - isConnected: boolean
  - isLoggedIn: boolean
  - userProfile: UserProfile | null
  - userBindings: SocialBinding[]

操作：
  - setServerUrl(url)            // 设置服务器地址
  - checkHealth()                // 健康检查 → 更新 isConnected
  - login(platform)              // 请求二维码 → QRCodeSession
  - pollScanStatus(sessionId)    // 轮询扫码状态 → 更新 Token
  - logout()                     // 清除 Token 和用户信息
  - refreshToken()               // 刷新 JWT Token
  - fetchProfile()               // 获取用户资料

Token 管理：
  - 使用 IPC 调用主进程 safeStorage 加密存储/读取
  - 72h 过期前 1h 自动刷新
  - 应用启动时检查 Token 有效性
```

#### 任务 2.4.3：主进程云服务 `electron/services/cloud.service.ts`

```
功能：
  - request(method, path, body?, headers?)  // 通用 HTTP 请求
  - healthCheck()                            // GET /api/v1/health
  - generateQRCode(platform)                 // POST /api/v1/auth/qrcode
  - pollScanStatus(sessionId)                // GET /api/v1/auth/scan/status/{sessionId}
  - refreshToken(token)                      // POST /api/v1/auth/token/refresh
  - getUserProfile(token)                    // GET /api/v1/user/profile
  - saveToken(token)                         // safeStorage 加密保存
  - loadToken()                              // safeStorage 解密读取
  - clearToken()                             // 清除 Token

依赖：
  - Node.js 内置 https/http 模块
  - Electron safeStorage
```

#### 任务 2.4.4：IPC 处理器 `electron/ipc/cloud.handler.ts`

```
通道注册：
  cloud:health       → cloudService.healthCheck()
  cloud:login        → cloudService.generateQRCode()
  cloud:pollScan     → cloudService.pollScanStatus()
  cloud:request      → cloudService.request() (通用代理)
  cloud:getToken     → cloudService.loadToken()
  cloud:saveToken    → cloudService.saveToken()
  cloud:clearToken   → cloudService.clearToken()
```

#### 任务 2.4.5：设置面板扩展

在 `SettingsPanel.tsx` 的"高级设置"区域新增：

```
服务器地址*: [http://81.71.11.33              ] [测试连接]
* 用于在线模板市场、项目同步等功能
```

- 输入框绑定 `cloud.store.serverUrl`
- [测试连接] 按钮调用 `checkHealth()`
- 连接成功显示绿色勾，失败显示红色叉

#### 任务 2.4.6：登录界面 `LoginView.tsx`

```
┌────────────────────────────────────┐
│  登录 MagicCommander Platform        │
│                                    │
│  选择登录方式:                      │
│                                    │
│  ┌──────────┐ ┌──────────┐       │
│  │  飞书     │ │  QQ      │       │
│  │  扫码登录  │ │  扫码登录  │       │
│  └──────────┘ └──────────┘       │
│  ┌──────────┐                     │
│  │  微信     │                     │
│  │  扫码登录  │                     │
│  └──────────┘                     │
│                                    │
│  登录后可使用:                      │
│  · 在线模板市场                     │
│  · 项目云端同步                     │
│  · 模板发布与分享                   │
└────────────────────────────────────┘
```

#### 任务 2.4.7：二维码弹窗 `QRCodeDialog.tsx`

```
┌────────────────────────────────────┐
│  飞书扫码登录                  [X] │
│                                    │
│  ┌──────────────────┐             │
│  │                  │             │
│  │    [二维码图片]   │             │
│  │                  │             │
│  └──────────────────┘             │
│                                    │
│  请使用飞书扫描二维码               │
│  ⏳ 等待扫码中...                  │
│  (2:58 后过期)                    │
│                                    │
│        [取消]                      │
└────────────────────────────────────┘
```

轮询逻辑：
- 每 2 秒轮询 `GET /api/v1/auth/scan/status/{sessionId}`
- `pending` → 继续等待
- `confirmed` → 保存 Token → 关闭弹窗 → 获取用户资料 → 跳转仪表盘
- `expired` → 提示过期 → 提供重新生成按钮
- 5 分钟未完成 → 自动过期

#### 任务 2.4.8：用户资料 `UserProfileView.tsx`

```
┌────────────────────────────────────┐
│  [头像]  username                   │
│          user@example.com           │
│  ─────────────────────────────────  │
│  已绑定账号:                        │
│  ├── 飞书: 张三                    │
│  └── QQ:   zhangsan                │
│  ─────────────────────────────────  │
│  [退出登录]                         │
└────────────────────────────────────┘
```

#### 任务 2.4.9：Header 状态图标 `CloudStatusIndicator.tsx`

- 未配置服务器：灰色云图标 + 提示"未配置服务器"
- 已配置 + 未连接：灰色云图标
- 已连接 + 未登录：黄色云图标 + 提示"未登录"
- 已连接 + 已登录：绿色云图标 + 显示用户名
- 连接错误：红色云图标 + 提示错误信息
- 点击任意状态 → 打开云中心面板

#### 任务 2.4.10：多语言资源 `src/i18n/resources/cloud.ts`

所有新增 UI 文本必须使用 `t()` 调用，中英文翻译键值覆盖：

| Key | 中文 | English |
|-----|------|---------|
| `cloud.title` | 云中心 | Cloud Center |
| `cloud.login.title` | 登录 MagicCommander Platform | Login to MagicCommander Platform |
| `cloud.login.selectPlatform` | 选择登录方式 | Select Login Method |
| `cloud.login.feishu` | 飞书扫码登录 | Feishu QR Login |
| `cloud.login.qq` | QQ 扫码登录 | QQ QR Login |
| `cloud.login.wechat` | 微信扫码登录 | WeChat QR Login |
| `cloud.login.benefits` | 登录后可使用 | After login you can |
| `cloud.login.benefit1` | 在线模板市场 | Online Template Market |
| `cloud.login.benefit2` | 项目云端同步 | Cloud Project Sync |
| `cloud.login.benefit3` | 模板发布与分享 | Template Publishing & Sharing |
| `cloud.qrcode.title` | 扫码登录 | Scan to Login |
| `cloud.qrcode.scanHint` | 请使用{platform}扫描二维码 | Please scan QR code with {platform} |
| `cloud.qrcode.waiting` | 等待扫码中... | Waiting for scan... |
| `cloud.qrcode.expiresIn` | {seconds}秒后过期 | Expires in {seconds}s |
| `cloud.qrcode.expired` | 二维码已过期 | QR code expired |
| `cloud.qrcode.regenerate` | 重新生成 | Regenerate |
| `cloud.status.connected` | 已连接 | Connected |
| `cloud.status.disconnected` | 未连接 | Disconnected |
| `cloud.status.connecting` | 连接中... | Connecting... |
| `cloud.status.error` | 连接失败 | Connection Failed |
| `cloud.status.notConfigured` | 未配置服务器 | Server Not Configured |
| `cloud.status.notLoggedIn` | 未登录 | Not Logged In |
| `cloud.profile.title` | 用户资料 | User Profile |
| `cloud.profile.username` | 用户名 | Username |
| `cloud.profile.bindings` | 已绑定账号 | Linked Accounts |
| `cloud.profile.logout` | 退出登录 | Logout |
| `cloud.settings.serverUrl` | 服务器地址 | Server URL |
| `cloud.settings.testConnection` | 测试连接 | Test Connection |
| `cloud.settings.connectionSuccess` | 连接成功 | Connection Successful |
| `cloud.settings.connectionFailed` | 连接失败 | Connection Failed |

### 2.5 验收标准

| 验收项 | 标准 |
|--------|------|
| 服务器配置 | 在设置面板输入 URL 后可保存，重启后保留 |
| 健康检查 | 点击"测试连接"后 2 秒内返回连接状态 |
| 扫码登录 | 手机扫码 → 弹窗关闭 → 显示用户信息 |
| Token 管理 | 重启应用后 Token 有效，无需重新登录 |
| 自动刷新 | Token 过期前 1h 自动刷新，用户无感知 |
| 用户资料 | 头像、用户名、绑定平台正确显示 |
| 退出登录 | 清除 Token 和用户信息，回到未登录状态 |
| 多语言 | 所有新增文本中英文切换正常 |
| 错误处理 | 网络不通/服务器错误/Token 过期均有友好提示 |

---

## 3. Build 26080201 - 模板市场

### 目标
让用户能够浏览在线模板、查看详情、一键安装到本地，以及将本地模板发布到市场。

### 3.1 服务器端扩展（需同步完成）

| 任务 | 文件 | 说明 |
|------|------|------|
| 公开项目浏览 API | `api/routes/projects.py` | 新增 `GET /api/v1/projects/public`，支持搜索和分类 |
| 项目文件推送 API | `api/routes/projects.py` | 新增 `PUT /api/v1/projects/{owner}/{repo}/files`，批量上传文件 |

### 3.2 客户端新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/cloud/TemplateMarketView.tsx` | UI 组件 | 模板市场浏览（搜索框 + 分类筛选 + 卡片列表 + 分页） |
| `src/components/cloud/TemplateDetailView.tsx` | UI 组件 | 模板详情（文件列表 + 预览 + 统计 + 安装按钮） |
| `src/components/cloud/PublishDialog.tsx` | UI 组件 | 发布模板弹窗（名称/描述/分类/文件选择） |

### 3.3 客户端修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/stores/cloud.store.ts` | 新增 `fetchRemoteTemplates`, `downloadTemplate`, `publishTemplate` 等 action |
| `src/services/cloudApi.service.ts` | 新增模板相关 API 调用 |
| `electron/services/cloud.service.ts` | 新增模板下载/上传逻辑（文件写入/读取） |
| `electron/ipc/cloud.handler.ts` | 新增 `cloud:downloadTemplate`, `cloud:publishTemplate` 通道 |
| `src/components/cloud/CloudPanel.tsx` | 新增模板市场 Tab |
| `src/stores/project.store.ts` | 新增 `importTemplate` action（将下载的模板注册到本地模板列表） |
| `electron/config.ts` | BUILD 更新为 `26080201` |

### 3.4 详细任务分解

#### 任务 3.4.1：模板市场浏览 `TemplateMarketView.tsx`

```
┌────────────────────────────────────────┐
│  [🔍 搜索模板...]    [全部分类 ▼]      │
├────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐           │
│  │ 模板名称  │ │ 模板名称  │           │
│  │ 描述...   │ │ 描述...   │           │
│  │ 作者 · 时间│ │ 作者 · 时间│          │
│  │ [查看详情] │ │ [查看详情] │          │
│  └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐           │
│  │ ...       │ │ ...       │           │
│  └──────────┘ └──────────┘           │
├────────────────────────────────────────┤
│           < 1  2  3 ... 10 >          │
└────────────────────────────────────────┘
```

功能：
- 调用 `GET /api/v1/templates?q=xxx&category=xxx&page=1&limit=20`
- 搜索框支持关键词搜索（防抖 300ms）
- 分类下拉从服务器 topics 动态获取
- 卡片显示：模板名称、描述（截断）、作者、更新时间
- 分页：显示页码，上一页/下一页
- 点击卡片 → 进入模板详情

#### 任务 3.4.2：模板详情 `TemplateDetailView.tsx`

```
┌────────────────────────────────────────┐
│  < 返回市场    模板名称       [安装]   │
├────────────────────────────────────────┤
│  完整描述文本...                        │
│                                         │
│  文件列表:                              │
│  ├── 📄 main.j2          2.3 KB  预览  │
│  ├── 📄 config.yaml       0.5 KB  预览  │
│  ├── 📄 README.md         1.1 KB  预览  │
│  └── 📁 subdir/                       │
│      └── 📄 sub.j2        0.8 KB  预览  │
│                                         │
│  统计: 下载 128 次 · 使用 45 次          │
│  作者: username                         │
└────────────────────────────────────────┘
```

功能：
- 调用 `GET /api/v1/templates/{owner}/{repo}` 获取详情
- 调用 `GET /api/v1/templates/{owner}/{repo}/stats` 获取统计
- 文件树展示（支持嵌套目录）
- 点击文件 → 调用 `GET /api/v1/templates/{owner}/{repo}/file/{path}` 在编辑器预览
- [安装] 按钮 → 一键安装流程

#### 任务 3.4.3：一键安装流程

```
用户点击 [安装]
  → 检查本地 template/ 目录是否已存在同名模板
    → 存在：弹窗提示
      ┌──────────────────────────────┐
      │  模板已存在                   │
      │  本地已存在模板 "my-template" │
      │                              │
      │  ○ 覆盖本地版本               │
      │  ○ 重命名安装 (my-template-1) │
      │  ○ 取消                       │
      └──────────────────────────────┘
  → 调用 GET /api/v1/templates/{owner}/{repo}/download
    → 下载 zip 压缩包到临时目录
    → 解压到 template/ 目录
    → 读取模板元信息，注册到 project.store
  → 显示进度条
  → 完成后刷新本地模板列表
  → Toast 提示安装成功
```

#### 任务 3.4.4：发布模板 `PublishDialog.tsx`

```
用户在本地模板列表右键 → [发布到市场]
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
    │  ☑ 📄 main.j2      (2.3 KB) │
    │  ☑ 📄 config.yaml  (0.5 KB) │
    │  ☑ 📄 README.md    (1.1 KB) │
    │  ☐ 📊 para.xlsx    (5.2 KB) │
    │                              │
    │  [取消]        [发布]        │
    └──────────────────────────────┘
  → 调用 POST /api/v1/templates
    → 文件打包为 multipart 或 base64 上传
    → 设置 topics: magiccommander-template, category-xxx
    → 根据可见性设置仓库 public/private
  → Toast 提示发布成功
```

#### 任务 3.4.5：Store 扩展 `cloud.store.ts`

新增 action：
```typescript
fetchRemoteTemplates(query?: string, category?: string, page?: number)
  → 调用 GET /api/v1/templates

downloadTemplate(owner: string, repo: string)
  → 调用 GET /api/v1/templates/{owner}/{repo}/download
  → 解压到 template/ 目录
  → 调用 projectStore.importTemplate()

publishTemplate(templateName: string, meta: PublishMeta)
  → 调用 POST /api/v1/templates
```

### 3.5 验收标准

| 验收项 | 标准 |
|--------|------|
| 模板搜索 | 输入关键词后 300ms 内显示搜索结果 |
| 分类筛选 | 切换分类后正确过滤模板 |
| 分页加载 | 翻页后正确加载下一页数据 |
| 模板详情 | 文件列表、预览、统计信息正确 |
| 一键安装 | 下载 → 解压 → 注册模板，完成后可用 |
| 同名覆盖 | 三个选项（覆盖/重命名/取消）均正常工作 |
| 模板发布 | 发布后在"我的模板"列表可见 |
| 错误处理 | 网络错误/下载失败/解压失败均有提示 |

---

## 4. Build 26080901 - 项目同步

### 目标
让用户能够将本地项目推送到云端、从云端拉取项目、查看同步状态。

### 4.1 服务器端扩展（需同步完成）

| 任务 | 文件 | 说明 |
|------|------|------|
| 项目可见性切换 API | `api/routes/projects.py` | 新增 `PUT /api/v1/projects/{owner}/{repo}/visibility` |
| 项目同步信息 API | `api/routes/projects.py` | 新增 `GET /api/v1/projects/{owner}/{repo}/sync`，返回最新 commit SHA |

### 4.2 客户端新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/cloud/RemoteProjectView.tsx` | UI 组件 | 远程项目列表（我的云端项目 + 公开项目） |
| `src/components/cloud/PushDialog.tsx` | UI 组件 | 推送项目弹窗（文件变更预览 + 可见性选择） |
| `src/components/cloud/PullDialog.tsx` | UI 组件 | 拉取项目弹窗（覆盖策略选择） |
| `src/components/cloud/SyncStatusBadge.tsx` | UI 组件 | 同步状态标签（在项目列表中使用） |
| `electron/utils/git.ts` | 工具 | Git 操作工具（clone/pull 使用 simple-git） |

### 4.3 客户端修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/stores/cloud.store.ts` | 新增 `fetchRemoteProjects`, `pushProject`, `pullProject`, `checkSyncStatus` 等 action |
| `src/services/cloudApi.service.ts` | 新增项目同步相关 API 调用 |
| `electron/services/cloud.service.ts` | 新增 Git 操作逻辑 |
| `electron/ipc/cloud.handler.ts` | 新增 `cloud:gitPush`, `cloud:gitPull`, `cloud:gitClone`, `cloud:syncCheck` 通道 |
| `src/components/cloud/CloudPanel.tsx` | 新增项目同步 Tab |
| `src/components/project/ProjectList.tsx` | 列表项新增 SyncStatusBadge |
| `package.json` | 新增依赖 `simple-git` |
| `electron/config.ts` | BUILD 更新为 `26080901` |

### 4.4 详细任务分解

#### 任务 4.4.1：远程项目视图 `RemoteProjectView.tsx`

```
┌────────────────────────────────────────┐
│  [我的项目]  [公开项目]                │
├────────────────────────────────────────┤
│  ┌────────────────────────────────────┐│
│  │ project-a           ☁ 已同步      ││
│  │ 描述...             3天前          ││
│  │ [拉取到本地]                       ││
│  ├────────────────────────────────────┤│
│  │ project-b           ↑ 本地有修改   ││
│  │ 描述...             昨天           ││
│  │ [推送] [拉取]                      ││
│  ├────────────────────────────────────┤│
│  │ project-c           ↓ 云端有更新   ││
│  │ 描述...             1周前          ││
│  │ [拉取到本地]                       ││
│  └────────────────────────────────────┘│
└────────────────────────────────────────┘
```

两个 Tab：
- **我的项目**：调用 `GET /api/v1/projects`，显示用户自己的项目，支持推送/拉取操作
- **公开项目**：调用 `GET /api/v1/projects/public`，浏览社区项目，支持拉取到本地

#### 任务 4.4.2：推送项目 `PushDialog.tsx`

```
用户选择本地项目 → 右键 [推送到云端]
  → 弹窗：
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
    │  └── yaml/               (新增)│
    │                              │
    │  [取消]        [确认推送]     │
    └──────────────────────────────┘
```

推送流程：
1. 先调用 `GET /api/v1/projects/{owner}/{repo}/sync` 获取云端最新 SHA
2. 对比本地文件与云端 SHA 的差异（通过 `sync/check` API 或本地 Git 状态）
3. 显示文件变更列表（新增/修改/删除）
4. 用户确认后，调用 `PUT /api/v1/projects/{owner}/{repo}/files` 批量上传变更文件
5. 如果首次推送（仓库不存在），先调用 `POST /api/v1/projects` 创建仓库
6. 更新本地记录的 commit SHA
7. Toast 提示推送成功

#### 任务 4.4.3：拉取项目 `PullDialog.tsx`

```
用户选择远程项目 → 点击 [拉取到本地]
  → 如果本地不存在同名项目：
    → 直接 clone 到 workspace/
  → 如果本地已存在：
    ┌──────────────────────────────┐
    │  项目已存在                   │
    │                              │
    │  本地版本: 2026-07-20 10:30   │
    │  云端版本: 2026-07-22 15:00   │
    │                              │
    │  ○ 覆盖本地（云端为准）       │
    │  ○ 另存为新项目              │
    │  ○ 取消                       │
    │                              │
    │  [取消]        [确认]        │
    └──────────────────────────────┘
```

拉取流程：
1. 检查本地 workspace/ 是否已存在同名项目
2. 不存在 → 使用 `git clone --depth 1` 浅克隆到 workspace/
3. 存在 → 对比本地和云端版本 → 弹窗让用户选择策略
4. 覆盖：删除本地 → 重新 clone
5. 另存为：clone 到带后缀的新目录名
6. 完成后刷新项目列表
7. 更新 SyncStatus

#### 任务 4.4.4：同步状态 `SyncStatusBadge.tsx`

在 `ProjectList.tsx` 的每个项目项中显示同步状态：

| 状态 | 图标 | 含义 | 条件 |
|------|------|------|------|
| synced | ✓ 绿色 | 已同步 | 本地 SHA = 云端 SHA |
| local_only | ○ 灰色 | 仅本地 | 未推送到云端 |
| remote_only | ☁ 蓝色 | 仅云端 | 本地不存在 |
| local_ahead | ↑ 橙色 | 本地有修改 | 本地 SHA 比云端新 |
| remote_ahead | ↓ 蓝色 | 云端有更新 | 云端 SHA 比本地新 |
| conflict | ⚠ 红色 | 冲突 | 本地和云端都有修改 |

状态检测逻辑：
- 调用 `POST /api/v1/client/sync/check` 批量检查所有项目
- 或调用 `GET /api/v1/projects/{owner}/{repo}/sync` 逐个检查
- 在应用启动时自动检查一次
- 提供手动刷新按钮

#### 任务 4.4.5：Git 操作工具 `electron/utils/git.ts`

```typescript
// 使用 simple-git 进行 Git 操作
import simpleGit from 'simple-git'

export async function cloneProject(cloneUrl: string, targetDir: string, token: string): Promise<void> {
  // 将 token 嵌入 URL: https://token@host/repo.git
  const authenticatedUrl = cloneUrl.replace('https://', `https://${token}@`)
  await simpleGit().clone(authenticatedUrl, targetDir, ['--depth', '1'])
}

export async function getLocalCommitSha(projectDir: string): Promise<string | null> {
  try {
    const git = simpleGit(projectDir)
    const log = await git.log({ maxCount: 1 })
    return log.latest?.hash || null
  } catch {
    return null
  }
}
```

### 4.5 验收标准

| 验收项 | 标准 |
|--------|------|
| 推送项目 | 本地项目文件正确上传到 Gitea 仓库 |
| 首次推送 | 自动创建仓库 + 上传文件 + 设置 topics |
| 增量推送 | 仅上传变更的文件，不重复上传 |
| 拉取项目 | 从云端 clone 到 workspace/，目录结构正确 |
| 覆盖策略 | 覆盖/另存为/取消 三个选项均正常 |
| 同步状态 | 项目列表正确显示同步状态图标 |
| 批量检测 | 启动时自动检测所有项目同步状态 |
| Git 认证 | 使用 Gitea Token 认证，无需输入密码 |
| 错误处理 | 网络错误/认证失败/冲突等均有提示 |

---

## 5. Build 26081601 - 完善上线

### 目标
补全仪表盘、公开项目浏览、冲突处理、版本检查，达到正式发布标准。

### 5.1 服务器端扩展（需同步完成）

| 任务 | 文件 | 说明 |
|------|------|------|
| 通知系统 API | `api/routes/client.py` | 新增 `GET /api/v1/client/notifications` |
| 项目 Fork API | `api/routes/projects.py` | 新增 `POST /api/v1/projects/{owner}/{repo}/fork` |

### 5.2 客户端新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/cloud/DashboardView.tsx` | UI 组件 | 客户端仪表盘（统计卡片 + 最近模板/项目） |

### 5.3 客户端修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/stores/cloud.store.ts` | 新增 `fetchDashboard`, `fetchPublicProjects`, `checkVersion` 等 action |
| `src/services/cloudApi.service.ts` | 新增仪表盘、版本检查 API 调用 |
| `electron/services/cloud.service.ts` | 新增版本检查逻辑 |
| `electron/services/update.service.ts` | 集成云端版本检查（替代/补充 GitHub electron-updater） |
| `src/components/cloud/CloudPanel.tsx` | 完善仪表盘 Tab |
| `src/components/cloud/RemoteProjectView.tsx` | 完善公开项目浏览 + Fork 功能 |
| `src/components/cloud/PullDialog.tsx` | 完善冲突处理逻辑 |
| `src/components/cloud/CloudStatusIndicator.tsx` | 新增版本更新提示 |
| `electron/config.ts` | BUILD 更新为 `26081601` |

### 5.4 详细任务分解

#### 任务 5.4.1：仪表盘 `DashboardView.tsx`

```
┌────────────────────────────────────────┐
│  欢迎, username               [头像]   │
├────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ 我的模板  │ │ 我的项目  │ │ 连接状态│ │
│  │   12     │ │   8      │ │ ● 正常 │ │
│  └──────────┘ └──────────┘ └────────┘ │
│                                         │
│  最近模板:                              │
│  ├── template-a      (2天前)  [查看]   │
│  ├── template-b      (5天前)  [查看]   │
│  └── template-c      (1周前)  [查看]   │
│                                         │
│  最近项目:                              │
│  ├── project-x       (昨天)   [查看]   │
│  ├── project-y       (3天前)  [查看]   │
│  └── project-z       (1周前)  [查看]   │
│                                         │
│  [浏览模板市场]    [管理我的项目]        │
└────────────────────────────────────────┘
```

数据来源：`GET /api/v1/client/dashboard`

#### 任务 5.4.2：公开项目浏览

在 `RemoteProjectView.tsx` 的"公开项目" Tab 中：
- 调用 `GET /api/v1/projects/public?q=xxx&page=1&limit=20`
- 支持搜索和分类筛选
- 每个项目显示 [拉取到本地] 按钮
- 公开项目不显示同步状态（因为不是自己的项目）
- 拉取后自动 fork 到用户空间（如果服务器支持）或直接 clone

#### 任务 5.4.3：冲突处理优化

完善 `PullDialog.tsx` 的冲突检测：
- 拉取前先用 `sync/check` 检测本地和云端是否都有修改
- 如果两边都有修改且不一致 → 冲突状态
- 冲突时的选项：
  - 覆盖本地（云端为准）
  - 另存为新项目
  - 取消
- 未来可扩展：智能合并（非本版本优先级）

#### 任务 5.4.4：版本检查

集成云端版本检查：
- 调用 `GET /api/v1/client/version` 获取最新版本信息
- 与 `electron/config.ts` 中的 `CURRENT` 和 `BUILD` 对比
- 如果有新版本，在 `CloudStatusIndicator` 中显示更新提示
- 可与现有的 `electron-updater` 机制并存（云端作为备用更新源）

### 5.5 验收标准

| 验收项 | 标准 |
|--------|------|
| 仪表盘 | 统计数字正确，最近列表显示正确 |
| 公开项目 | 可浏览、搜索、拉取公开项目 |
| 冲突处理 | 冲突时正确显示三个选项 |
| 版本检查 | 有新版本时在 Header 显示更新提示 |
| 全链路测试 | 登录 → 浏览模板 → 安装 → 创建项目 → 推送 → 拉取 → 发布模板 全流程通过 |
| 多语言 | 所有新增文本中英文翻译完整 |

---

## 6. Build 26082301 - UI 重构与多语言

### 目标
修复 v3.5 四 Build 上线后暴露的 UI 与多语言问题：用户资料展示编程字段、设置面板分类混乱、大量硬编码中文、菜单顺序不合理。

### 6.1 服务器端扩展（需同步完成）

| 任务 | 文件 | 说明 |
|------|------|------|
| 用户头像上传 API | `api/routes/user.py` | 新增 `POST /api/v1/user/avatar`，支持 multipart 上传 |

### 6.2 客户端新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/cloud/EditProfileDialog.tsx` | UI 组件 | 编辑用户资料弹窗（full_name, bio） |

### 6.3 客户端修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/components/cloud/UserProfileView.tsx` | **重构**：调用 `/user/profile` 展示完整资料（full_name, email, avatar, bio, bindings）；移除 userId 展示 |
| `src/components/sidebar/SettingsPanel.tsx` | **重构**：改为 tabs 分组（通用/AI/平台/高级/关于），合并外观到通用，策略路由到 AI，平台连接独立 |
| `src/components/layout/ActivityBar.tsx` | 调整 activities 顺序：`search → cloud → chat → explorer → workbench → output → settings` |
| `src/components/layout/Header.tsx` | View 菜单新增 `cloud` 入口 |
| `src/App.tsx` | 添加 cloud 热键 `Ctrl+Shift+C` |
| `src/components/cloud/CloudPanel.tsx` | 消除 tab 标签硬编码中文，改为 `t()` 调用 |
| `src/components/cloud/DashboardView.tsx` | 消除所有硬编码中文，改为 `t()` 调用 |
| `src/components/cloud/SyncStatusBadge.tsx` | 消除状态文本硬编码 |
| `src/components/auth/LoginDialog.tsx` | 消除平台名称硬编码 |
| `src/components/sidebar/project/ProjectListItem.tsx` | 消除按钮文本硬编码 |
| `src/i18n/locales/zh-CN/cloud.json` | 补全翻译键：`profile.*`, `status.*`, `sync.*`, `push.*`, `pull.*`, `login.*`, `settings.*`, `dashboard.*`, `search.*` |
| `src/i18n/locales/en/cloud.json` | 同步补全英文翻译 |
| `src/i18n/locales/{ja,ko,zh-TW}/cloud.json` | 为日/韩/繁中生成 cloud.json（AI 辅助翻译） |
| `src/i18n/locales/{ja,ko,zh-TW}/chat.json` | 为日/韩/繁中生成 chat.json |
| `src/i18n/index.ts` | 注册 `auth` 命名空间（如需） |
| `electron/config.ts` | BUILD 更新为 `26082301` |

### 6.4 详细任务分解

#### 任务 6.4.1：用户资料重构 `UserProfileView.tsx`

```
改造前：
┌─────────────────────────────┐
│  [头像]  username            │
│          ID: 123            │  ← 编程字段，用户无法理解
│  [打开平台] [退出登录]       │
└─────────────────────────────┘

改造后：
┌─────────────────────────────┐
│  [头像]  显示名称 (full_name)│
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

数据来源：`GET /api/v1/user/profile`（已实现，但客户端未使用完整字段）

#### 任务 6.4.2：设置面板重构 `SettingsPanel.tsx`

采用 tabs 分组替代当前平铺结构：

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
│   ├── Provider 选择卡片
│   ├── 当前 Provider 配置 (API Key / Base URL / Model)
│   ├── 测试连接 / 获取模型
│   ├── 智能路由 (开关 + 任务类型 → Provider 映射)
│   └── 自主模式 (顾问/半自动/全自动)
│
├── ☁️ 平台 (Platform)
│   ├── 服务器地址 + 测试连接
│   ├── 登录状态 (已登录/未登录)
│   ├── 账号信息 (来自 user/profile)
│   └── 同步设置 (未来)
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

#### 任务 6.4.3：消除硬编码中文

扫描并修复所有硬编码中文，涉及 13+ 个文件：

| 文件 | 硬编码文本 |
|------|-----------|
| `CloudPanel.tsx` | `'仪表盘'`, `'模板市场'`, `'远程项目'`, `'MagicCommander Platform'`, `'登录'` |
| `DashboardView.tsx` | `'请先登录...'`, `'加载失败:'`, `'欢迎, {username}'`, `'服务器: {baseUrl}'`, `'我的模板'`, `'我的项目'`, `'连接正常'`, `'浏览模板市场'`, `'管理我的项目'`, `'最近模板'`, `'最近项目'` |
| `SyncStatusBadge.tsx` | `'已同步'`, `'仅本地'`, `'仅云端'`, `'本地有修改'`, `'云端有更新'`, `'冲突'` |
| `ProjectListItem.tsx` | `'推送到云端'`, `'在资源管理器中打开'` |
| `LoginDialog.tsx` | `'飞书'`, `'QQ'`, `'微信'`, `'扫描二维码登录'` |
| `UserProfileView.tsx` | `'打开平台'`, `'退出登录'` |

#### 任务 6.4.4：多语言补全

新增 `cloud.json` 翻译键：

| Key | 中文 | English |
|-----|------|---------|
| `cloud.profile.fullName` | 显示名称 | Display Name |
| `cloud.profile.email` | 邮箱 | Email |
| `cloud.profile.location` | 位置 | Location |
| `cloud.profile.website` | 网站 | Website |
| `cloud.profile.bio` | 简介 | Bio |
| `cloud.profile.edit` | 编辑资料 | Edit Profile |
| `cloud.profile.openPlatform` | 打开平台 | Open Platform |
| `cloud.profile.logout` | 退出登录 | Logout |
| `cloud.profile.bindings` | 绑定账号 | Linked Accounts |
| `cloud.profile.bind` | 绑定 | Bind |
| `cloud.profile.unbind` | 解绑 | Unbind |
| `cloud.status.synced` | 已同步 | Synced |
| `cloud.status.localOnly` | 仅本地 | Local Only |
| `cloud.status.remoteOnly` | 仅云端 | Remote Only |
| `cloud.status.localAhead` | 本地有修改 | Local Modified |
| `cloud.status.remoteAhead` | 云端有更新 | Remote Updated |
| `cloud.status.conflict` | 冲突 | Conflict |
| `cloud.sync.push` | 推送到云端 | Push to Cloud |
| `cloud.sync.pull` | 拉取到本地 | Pull to Local |
| `cloud.sync.pushTitle` | 推送项目 | Push Project |
| `cloud.sync.pullTitle` | 拉取项目 | Pull Project |
| `cloud.settings.title` | 设置 | Settings |
| `cloud.settings.general` | 通用 | General |
| `cloud.settings.ai` | AI | AI |
| `cloud.settings.platform` | 平台 | Platform |
| `cloud.settings.advanced` | 高级 | Advanced |
| `cloud.settings.about` | 关于 | About |
| `cloud.dashboard.welcome` | 欢迎, {name} | Welcome, {name} |
| `cloud.dashboard.myTemplates` | 我的模板 | My Templates |
| `cloud.dashboard.myProjects` | 我的项目 | My Projects |
| `cloud.dashboard.recentTemplates` | 最近模板 | Recent Templates |
| `cloud.dashboard.recentProjects` | 最近项目 | Recent Projects |
| `cloud.dashboard.browseMarket` | 浏览模板市场 | Browse Template Market |
| `cloud.dashboard.manageProjects` | 管理我的项目 | Manage My Projects |
| `cloud.dashboard.notLoggedIn` | 请先登录云平台 | Please login to the cloud platform |
| `cloud.dashboard.goSettings` | 前往设置 | Go to Settings |
| `cloud.dashboard.loadFailed` | 加载失败 | Load Failed |
| `cloud.dashboard.connected` | 连接正常 | Connected |
| `cloud.panel.tabDashboard` | 仪表盘 | Dashboard |
| `cloud.panel.tabTemplates` | 模板市场 | Template Market |
| `cloud.panel.tabProjects` | 远程项目 | Remote Projects |
| `cloud.search.placeholder` | 搜索项目名称或描述... | Search project name or description... |
| `cloud.search.noResults` | 未找到匹配的项目 | No matching projects found |
| `cloud.search.noResultsTemplates` | 未找到匹配的模板 | No matching templates found |

### 6.5 验收标准

| 验收项 | 标准 |
|--------|------|
| 用户资料 | 展示 full_name、email、bio、location、website、bindings；编辑资料弹窗可用 |
| 设置面板 | 5 个 tab 分组正确，各设置项工作正常 |
| 菜单顺序 | ActivityBar 顺序为 search → cloud → chat → explorer → workbench → output → settings |
| View 菜单 | 包含 cloud 入口，快捷键 Ctrl+Shift+C |
| 硬编码消除 | 扫描确认所有 cloud 组件无硬编码中文 |
| 多语言 | zh-CN/en/ja/ko/zh-TW 五种语言 cloud.json 完整，切换正常 |

---

## 7. Build 26083001 - 同步与搜索

### 目标
完善项目/模板的同步操作入口，实现云端项目与模板的搜索功能，优化 Dashboard，实现模板市场界面。

### 7.1 服务器端扩展（需同步完成）

| 任务 | 文件 | 说明 |
|------|------|------|
| 公开项目搜索 API | `api/routes/projects.py` | 新增 `GET /api/v1/projects/public?q=xxx&page=1&limit=20`，使用 Gitea `search_repos()` |
| 用户项目搜索参数 | `api/routes/projects.py` | 为 `GET /api/v1/projects` 增加 `?q=` 参数，搜索当前用户的项目 |
| 公开统计 API | `api/routes/client.py` | 新增 `GET /api/v1/public/stats`，返回总用户数、总模板数、总项目数 |

### 7.2 客户端新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/ui/SearchInput.tsx` | UI 组件 | 带防抖的搜索输入框（380ms 防抖 + 清除按钮） |
| `src/components/cloud/TemplateMarket.tsx` | UI 组件 | 模板市场搜索 + 卡片列表（替代当前占位界面） |

### 7.3 客户端修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/components/cloud/CloudPanel.tsx` | 顶部新增搜索栏；搜索词向下传递到各子组件 |
| `src/components/cloud/RemoteProjectView.tsx` | "我的项目"tab：客户端过滤；"公开项目"tab：服务端搜索（新增搜索框 + 380ms 防抖） |
| `src/components/cloud/DashboardView.tsx` | 统计卡片新增"平台用户"；最近模板每项增加"安装"按钮；最近项目每项增加"拉取"按钮；快捷操作按钮修正跳转目标 |
| `src/components/sidebar/project/ProjectListItem.tsx` | 根据 syncStatus 显示对应操作按钮（push/pull/conflict/synced） |
| `src/components/sidebar/project/ExplorerPanel.tsx` | 模板列表项增加"发布到云端"按钮；远程模板列表项增加"安装到本地"按钮 |
| `src/api/platform.ts` | 新增 `projects.searchPublic(q, page)` 和 `projects.search(q)` 方法 |
| `electron/config.ts` | BUILD 更新为 `26083001` |

### 7.4 详细任务分解

#### 任务 7.4.1：SearchInput 组件

```tsx
// src/components/ui/SearchInput.tsx
// 属性：value, onChange, placeholder, className
// 功能：380ms 防抖、清除按钮、搜索图标
// 使用 useRef + useEffect 实现防抖
```

#### 任务 7.4.2：混合搜索实现

```
搜索策略（按 tab 不同）：
┌──────────────────┬─────────────────────────────┐
│ Tab              │ 搜索策略                      │
├──────────────────┼─────────────────────────────┤
│ "我的项目" tab   │ 客户端即时过滤（名称/描述匹配）│
│ "公开项目" tab   │ 服务端搜索（380ms 防抖）      │
│ "模板市场" tab   │ 服务端搜索（已有 `?q=` 参数）  │
│ "仪表盘" tab     │ 不搜索（仅统计展示）           │
└──────────────────┴─────────────────────────────┘
```

**客户端过滤实现（"我的项目"）：**
```typescript
const filtered = useMemo(() => {
  if (!searchQuery) return remoteProjects
  const q = searchQuery.toLowerCase()
  return remoteProjects.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q)
  )
}, [remoteProjects, searchQuery])
```

**服务端搜索实现（"公开项目"）：**
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    fetchPublicProjects(searchQuery)
  }, 380)
  return () => clearTimeout(timer)
}, [searchQuery])
```

#### 任务 7.4.3：项目同步按钮

根据 syncStatus 动态显示操作按钮：

```tsx
// ProjectListItem 操作按钮组
{syncStatus === 'local_only' && <Tooltip text="推送到云端"><PushButton /></Tooltip>}
{syncStatus === 'remote_only' && <Tooltip text="拉取到本地"><PullButton /></Tooltip>}
{syncStatus === 'local_ahead' && <Tooltip text="推送到云端"><PushButton /></Tooltip>}
{syncStatus === 'remote_ahead' && <Tooltip text="拉取到本地"><PullButton /></Tooltip>}
{syncStatus === 'conflict' && <Tooltip text="解决冲突"><ConflictButton /></Tooltip>}
{syncStatus === 'synced' && <SyncedCheckmark />}
<Tooltip text="在资源管理器中打开"><OpenFolderButton /></Tooltip>
```

#### 任务 7.4.4：模板市场实现

当前 `CloudPanel.tsx` 的"模板市场" tab 是占位文本。实现实际功能：

```
┌────────────────────────────────────────┐
│  [🔍 搜索模板...]    [全部分类 ▼]      │
├────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐           │
│  │ 模板名称  │ │ 模板名称  │           │
│  │ 描述...   │ │ 描述...   │           │
│  │ 作者 · 时间│ │ 作者 · 时间│          │
│  │ [安装]    │ │ [安装]    │           │
│  └──────────┘ └──────────┘           │
├────────────────────────────────────────┤
│           < 1  2  3 ... 10 >          │
└────────────────────────────────────────┘
```

- 调用 `GET /api/v1/templates?q=xxx&category=xxx&page=1&limit=20`
- 搜索框支持关键词搜索（防抖 380ms）
- 分类下拉从服务器 topics 动态获取
- 点击"安装" → 一键安装流程
- 点击卡片 → 进入模板详情（复用已有 TemplateDetailView）

### 7.5 验收标准

| 验收项 | 标准 |
|--------|------|
| 搜索输入框 | 输入后 380ms 触发搜索，有清除按钮，空状态提示 |
| 我的项目搜索 | 实时客户端过滤，名称/描述匹配 |
| 公开项目搜索 | 服务端搜索，分页正常，无结果提示 |
| 模板市场搜索 | 服务端搜索，分类筛选，分页正常 |
| 同步按钮 | 根据 syncStatus 正确显示 push/pull/conflict/synced |
| 模板发布按钮 | 本地模板列表显示"发布到云端"按钮 |
| 模板安装按钮 | 远程模板列表显示"安装到本地"按钮 |
| Dashboard | 按钮跳转目标正确，最近模板/项目有操作按钮 |

---

## 8. Build 26090601 - 登录体验与云端完善

### 目标
优化登录体验（动态显示可用登录方式、Token 自动刷新），实现通知中心，集成版本检查，完善云端 API。

### 8.1 服务器端扩展（需同步完成）

| 任务 | 文件 | 说明 |
|------|------|------|
| 客户端版本检查 API | `api/routes/client.py` | 新增 `GET /api/v1/client/version`，返回最新版本号、下载链接、更新日志 |
| 通知系统 API | `api/routes/notifications.py` (新) | 新增 `GET /api/v1/client/notifications`，返回系统公告列表 |
| 多平台绑定实现 | `api/routes/auth.py` | 实现 `POST /api/v1/auth/bindings` 添加绑定逻辑 |
| 用户头像上传 | `api/routes/user.py` | 新增 `POST /api/v1/user/avatar` multipart 上传 |

### 8.2 客户端新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/cloud/NotificationCenter.tsx` | UI 组件 | 通知中心（平台公告 + 同步提醒） |

### 8.3 客户端修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/components/auth/LoginDialog.tsx` | 调用 `/auth/health` 动态显示可用登录方式（未配置的灰显） |
| `src/api/platform.ts` | `request()` 中检测 401，自动调用 `auth.refresh()` 刷新 Token；新增 `getVersion()`, `getNotifications()`, `getPublicStats()` |
| `src/components/cloud/CloudStatusIndicator.tsx` | 新增版本更新提示（有新版本时显示红点） |
| `src/components/cloud/DashboardView.tsx` | 集成通知中心组件 |
| `src/App.tsx` | 启动时检查版本更新 |
| `electron/services/update.service.ts` | 集成云端版本检查（替代/补充 GitHub electron-updater） |
| `electron/config.ts` | BUILD 更新为 `26090601` |

### 8.4 详细任务分解

#### 任务 8.4.1：动态登录方式

```
调用 GET /api/v1/auth/health 获取各平台配置状态：
{
  "feishu": { "configured": true },
  "qq": { "configured": false },
  "wechat": { "configured": false }
}

根据配置状态渲染登录方式：
- 已配置：正常显示，可点击
- 未配置：灰显 + 提示"暂未开放"
```

#### 任务 8.4.2：Token 自动刷新

```typescript
// platform.ts 的 request() 函数中
if (res.status === 401 && !isRefreshRequest) {
  try {
    const newToken = await refreshToken()
    // 重试原请求
    return request<T>(method, url, body, { ...headers, Authorization: `Bearer ${newToken}` })
  } catch {
    // 刷新失败，提示重新登录
    throw new Error('Token 已过期，请重新登录')
  }
}
```

#### 任务 8.4.3：通知中心

```
┌────────────────────────────────────────┐
│  🔔 通知中心                           │
├────────────────────────────────────────┤
│  📢 平台公告 (2)                       │
│  ├── MagicCommander v3.5 正式发布！    │
│  │   新版本带来云集成功能...  (2天前)  │
│  ├── 模板市场新增 50+ 模板！           │
│  │   来自社区贡献者...        (5天前)  │
│  └── 查看更多...                       │
│                                        │
│  ⚠️ 同步提醒 (1)                       │
│  ├── project-a 有未推送的修改           │
│  └── [立即推送]                        │
└────────────────────────────────────────┘
```

数据来源：`GET /api/v1/client/notifications`

#### 任务 8.4.4：版本检查

```typescript
// 启动时调用
const versionInfo = await getVersion()
if (versionInfo.latest_build > CURRENT_BUILD) {
  // 在 CloudStatusIndicator 显示红点
  // 在设置 > 关于 tab 显示更新提示
}
```

### 8.5 验收标准

| 验收项 | 标准 |
|--------|------|
| 动态登录方式 | 仅已配置的平台可点击，未配置的灰显 |
| Token 自动刷新 | 401 时自动刷新 Token，重试请求 |
| 登录过期提示 | Token 刷新失败后显示 toast 提示 |
| 通知中心 | 公告列表正确显示，同步提醒正确显示 |
| 版本检查 | 有新版本时在 Header 显示红点提示 |
| 全链路测试 | 完整流程 P0 功能通过 |

---

## 9. 文件变更清单

### 9.1 新增文件（共 22 个）

| Build | 文件 | 行数估算 |
|-------|------|---------|
| 26072601 | `src/types/cloud.ts` | ~120 |
| 26072601 | `src/stores/cloud.store.ts` | ~250 |
| 26072601 | `src/services/cloudApi.service.ts` | ~200 |
| 26072601 | `electron/services/cloud.service.ts` | ~300 |
| 26072601 | `electron/ipc/cloud.handler.ts` | ~80 |
| 26072601 | `src/components/cloud/CloudPanel.tsx` | ~100 |
| 26072601 | `src/components/cloud/LoginView.tsx` | ~150 |
| 26072601 | `src/components/cloud/QRCodeDialog.tsx` | ~200 |
| 26072601 | `src/components/cloud/UserProfileView.tsx` | ~80 |
| 26072601 | `src/components/cloud/CloudStatusIndicator.tsx` | ~100 |
| 26072601 | `src/i18n/resources/cloud.ts` | ~80 |
| 26080201 | `src/components/cloud/TemplateMarketView.tsx` | ~250 |
| 26080201 | `src/components/cloud/TemplateDetailView.tsx` | ~200 |
| 26080201 | `src/components/cloud/PublishDialog.tsx` | ~200 |
| 26080901 | `src/components/cloud/RemoteProjectView.tsx` | ~250 |
| 26080901 | `src/components/cloud/PushDialog.tsx` | ~200 |
| 26080901 | `src/components/cloud/PullDialog.tsx` | ~200 |
| 26080901 | `src/components/cloud/SyncStatusBadge.tsx` | ~80 |
| 26080901 | `electron/utils/git.ts` | ~100 |
| 26081601 | `src/components/cloud/DashboardView.tsx` | ~150 |
| 26082301 | `src/components/cloud/EditProfileDialog.tsx` | ~120 |
| 26083001 | `src/components/ui/SearchInput.tsx` | ~60 |
| 26083001 | `src/components/cloud/TemplateMarket.tsx` | ~200 |
| 26090601 | `src/components/cloud/NotificationCenter.tsx` | ~150 |

### 9.2 修改文件（共 20+ 个）

| Build | 文件 | 修改范围 |
|-------|------|---------|
| 26072601 | `package.json` | 版本号 + 新增 simple-git 依赖 |
| 26072601 | `electron/config.ts` | VERSION/BUILD/DISPLAY (各 Build 各更新一次) |
| 26072601 | `electron/ipc/handlers.ts` | 注册 cloud IPC 通道 |
| 26072601 | `electron/main.ts` | 初始化 cloud handler |
| 26072601 | `src/App.tsx` | 引入 CloudPanel，注册 CloudActivity |
| 26072601 | `src/components/layout/Header.tsx` | 引入 CloudStatusIndicator |
| 26072601 | `src/components/layout/ActivityBar.tsx` | 添加云中心活动入口 |
| 26072601 | `src/components/sidebar/SettingsPanel.tsx` | 新增服务器地址配置 |
| 26072601 | `src/stores/ui.store.ts` | 新增 cloudPanelActive 状态 |
| 26080201 | `src/stores/project.store.ts` | 新增 importTemplate action |
| 26080901 | `src/components/project/ProjectList.tsx` | 列表项新增 SyncStatusBadge |
| 26081601 | `electron/services/update.service.ts` | 集成云端版本检查 |
| 26082301 | `src/components/cloud/UserProfileView.tsx` | **重构**：展示完整用户资料 |
| 26082301 | `src/components/sidebar/SettingsPanel.tsx` | **重构**：tabs 分组 |
| 26082301 | `src/components/layout/ActivityBar.tsx` | 调整 activities 顺序 |
| 26082301 | `src/components/layout/Header.tsx` | View 菜单添加 cloud 入口 |
| 26082301 | `src/components/cloud/CloudPanel.tsx` | 消除硬编码 |
| 26082301 | `src/components/cloud/DashboardView.tsx` | 消除硬编码 |
| 26082301 | `src/components/cloud/SyncStatusBadge.tsx` | 消除硬编码 |
| 26082301 | `src/components/auth/LoginDialog.tsx` | 消除硬编码 |
| 26082301 | `src/components/sidebar/project/ProjectListItem.tsx` | 消除硬编码 |
| 26082301 | `src/i18n/locales/*/cloud.json` | 补全翻译键 |
| 26082301 | `src/i18n/locales/{ja,ko,zh-TW}/chat.json` | 新增翻译文件 |
| 26083001 | `src/components/cloud/CloudPanel.tsx` | 添加搜索栏 |
| 26083001 | `src/components/cloud/RemoteProjectView.tsx` | 混合搜索 |
| 26083001 | `src/components/cloud/DashboardView.tsx` | 优化仪表盘 |
| 26083001 | `src/components/sidebar/project/ProjectListItem.tsx` | 同步按钮组 |
| 26083001 | `src/components/sidebar/project/ExplorerPanel.tsx` | 模板同步入口 |
| 26083001 | `src/api/platform.ts` | 新增搜索 API |
| 26090601 | `src/components/auth/LoginDialog.tsx` | 动态登录方式 |
| 26090601 | `src/api/platform.ts` | Token 自动刷新 + 版本/通知 API |
| 26090601 | `src/components/cloud/CloudStatusIndicator.tsx` | 版本更新提示 |
| 26090601 | `src/components/cloud/DashboardView.tsx` | 集成通知中心 |

---

## 10. 风险评估

| 风险 | 级别 | 影响 | 缓解措施 |
|------|------|------|---------|
| 服务器端 API 未同步扩展 | 高 | 客户端功能无法使用 | 每个 Build 前先确认服务器端 API 就绪 |
| Windows 编码问题 | 中 | Git 操作中文路径出错 | 统一使用 UTF-8 编码，Git 配置 `core.quotepath=false` |
| simple-git 可用性 | 中 | 用户未安装 Git 时同步失败 | 检测 Git 可用性，不可用时回退到 REST API 文件上传 |
| safeStorage 兼容性 | 低 | 部分 Linux 发行版不可用 | 回退到文件存储 + 加密（keytar 备用） |
| 网络环境差异 | 中 | 内网/代理环境无法连接 | 支持 HTTP 代理配置，提供手动下载链接 |
| Gitea Token 安全 | 高 | Token 泄露导致数据风险 | 使用 safeStorage 加密存储，最小权限 Token |
| 同步冲突 | 中 | 数据丢失风险 | 冲突时不做自动合并，由用户手动选择策略 |
| 多语言维护成本 | 中 | 新增大量翻译键，11 种语言维护困难 | 优先覆盖中/英/日/韩/繁中 5 种，其余 AI 辅助翻译 |
| 设置面板重构风险 | 中 | 重构后现有设置项丢失或错位 | 逐项迁移，保留原有 localStorage key 不变 |

---

## 附录：版本号对照表

| 版本号 | 对应 Build | 说明 |
|--------|-----------|------|
| V3.5.0 Build 26072601 | Build 1 | 基础连接 |
| V3.5.0 Build 26080201 | Build 2 | 模板市场 |
| V3.5.0 Build 26080901 | Build 3 | 项目同步 |
| V3.5.0 Build 26081601 | Build 4 | 完善上线 |
| V3.5.0 Build 26082301 | Build 5 | UI 重构与多语言 |
| V3.5.0 Build 26083001 | Build 6 | 同步与搜索 |
| V3.5.x Build 26090601 | Build 7 | 登录体验与云端完善（下一个正式发布） |
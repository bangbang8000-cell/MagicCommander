# MagicCommander v3.5 云集成开发计划

> 版本：v1.0  
> 日期：2026-07-22  
> 基于：[CLIENT_CLOUD_INTEGRATION_PRD.md](./CLIENT_CLOUD_INTEGRATION_PRD.md)  
> 版本号规则：`V{MAJOR}.{MINOR}.{PATCH}-build.{YYMMDDNN}`

---

## 目录

1. [版本路线图](#1-版本路线图)
2. [Build 26072601 - 基础连接](#2-build-26072601---基础连接)
3. [Build 26080201 - 模板市场](#3-build-26080201---模板市场)
4. [Build 26080901 - 项目同步](#4-build-26080901---项目同步)
5. [Build 26081601 - 完善上线](#5-build-26081601---完善上线)
6. [文件变更清单](#6-文件变更清单)
7. [风险评估](#7-风险评估)

---

## 1. 版本路线图

```
V3.4.1 Build 26072006  (当前版本)
        │
        ├── Build 26072601  [基础连接]    服务器配置 + 扫码登录 + Token 管理 + 用户资料
        │
        ├── Build 26080201  [模板市场]    远程模板浏览 + 详情 + 一键安装 + 模板发布
        │
        ├── Build 26080901  [项目同步]    推送/拉取 + 同步状态 + 增量检测
        │
        └── Build 26081601  [完善上线]    仪表盘 + 公开项目 + 冲突处理 + 版本检查
                                       ↓
                              V3.5.0 Build 26081601  (正式发布)
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

## 6. 文件变更清单

### 6.1 新增文件（共 16 个）

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

### 6.2 修改文件（共 11 个）

| Build | 文件 | 修改范围 |
|-------|------|---------|
| 26072601 | `package.json` | 版本号 + 新增 simple-git 依赖 |
| 26072601 | `electron/config.ts` | VERSION/BUILD/DISPLAY |
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

---

## 7. 风险评估

| 风险 | 级别 | 影响 | 缓解措施 |
|------|------|------|---------|
| 服务器端 API 未同步扩展 | 高 | 客户端功能无法使用 | 每个 Build 前先确认服务器端 API 就绪 |
| Windows 编码问题 | 中 | Git 操作中文路径出错 | 统一使用 UTF-8 编码，Git 配置 `core.quotepath=false` |
| simple-git 可用性 | 中 | 用户未安装 Git 时同步失败 | 检测 Git 可用性，不可用时回退到 REST API 文件上传 |
| safeStorage 兼容性 | 低 | 部分 Linux 发行版不可用 | 回退到文件存储 + 加密（keytar 备用） |
| 网络环境差异 | 中 | 内网/代理环境无法连接 | 支持 HTTP 代理配置，提供手动下载链接 |
| Gitea Token 安全 | 高 | Token 泄露导致数据风险 | 使用 safeStorage 加密存储，最小权限 Token |
| 同步冲突 | 中 | 数据丢失风险 | 冲突时不做自动合并，由用户手动选择策略 |

---

## 附录：版本号对照表

| 版本号 | 对应 Build | 说明 |
|--------|-----------|------|
| V3.4.1 Build 26072006 | 当前版本 | 纯本地功能 |
| V3.5.0 Build 26072601 | Build 1 | 基础连接 |
| V3.5.0 Build 26080201 | Build 2 | 模板市场 |
| V3.5.0 Build 26080901 | Build 3 | 项目同步 |
| V3.5.0 Build 26081601 | Build 4 | 完善上线（正式发布） |
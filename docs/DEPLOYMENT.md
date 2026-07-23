# MagicCommander 部署指南

## 环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | 22+ |
| Python | 3.11+ |
| npm | 10+ |
| Git | 2.40+ |

## 快速开始（开发环境）

```bash
# 1. 克隆仓库
git clone https://github.com/bangbang8000-cell/MagicCommander.git
cd MagicCommander

# 2. 安装依赖
npm install
pip install -r backend/requirements.txt

# 3. 启动开发模式（Vite + Electron 并行）
npm run dev:all

# 4. 仅启动前端开发服务器
npm run dev

# 5. 仅启动 Electron（需要先启动 Vite）
npm run dev:electron
```

## 项目结构

```
MagicCommander/
├── src/                  # 前端源码 (React + TypeScript)
│   ├── components/       # UI 组件 (chat, cloud, layout, sidebar, dialogs)
│   ├── stores/           # Zustand 状态管理 (ui, platform, cloud, chat, project)
│   ├── i18n/             # 13 语言国际化
│   ├── api/              # 云端 API 客户端 (platform.ts)
│   └── types/            # TypeScript 类型定义
├── electron/             # Electron 主进程 (TypeScript)
├── backend/              # Python CLI 后端
├── ai_hub/               # AI Hub 服务 (FastAPI)
├── public/               # 静态资源 (图标/文档)
├── resources/            # 构建资源 (嵌入式 Python)
├── workspace/            # 默认项目工作区
├── example/              # 示例项目模板
├── template/             # 模板中心
├── dist/                 # 前端构建产物 (Vite)
├── dist-electron/        # Electron 主进程构建产物
└── release/              # 安装包输出目录
```

## 构建命令

```bash
# TypeScript 类型检查
npm run typecheck

# 编译前端 + Electron
npm run build

# 仅编译前端
npm run build:renderer

# 仅编译 Electron 主进程
npm run build:electron

# 运行测试
npm run test

# 代码检查与格式化
npm run lint
npm run format
```

## 打包安装包

```bash
# 打包当前平台（不生成安装包，仅打包目录）
npm run pack

# 打包当前平台安装包
npm run dist

# 按平台打包
npm run dist:win      # Windows NSIS 安装包 (.exe)
npm run dist:mac      # macOS DMG (.dmg)
npm run dist:linux    # Linux AppImage + deb

# 全平台打包
npm run dist:all
```

构建产物输出到 `release/` 目录：

| 平台 | 产物 |
|------|------|
| Windows | `MagicCommander Setup x.x.x.exe` |
| macOS | `MagicCommander-x.x.x-arm64.dmg` |
| Linux | `MagicCommander-x.x.x.AppImage`, `magiccommander_x.x.x_amd64.deb` |

## Electron Builder 配置

配置文件位于 `package.json` 的 `build` 字段：

- **appId**: `com.magiccommander.app`
- **发布渠道**: GitHub Releases (owner: `bangbang8000-cell`, repo: `MagicCommander`)
- **extraResources**: 打包时包含 `backend/`, `workspace/`, `example/`, `template/`, `resources/python/`, `ai_hub/`
- **自动更新**: `electron-updater` 通过 GitHub Releases 检测和下载更新

## 嵌入式 Python 运行时

Windows 安装包内嵌 Python 3.11.9 运行时，用户无需单独安装 Python。构建过程：

1. 下载 Python 3.11.9 embeddable zip
2. 配置 `python311._pth` 启用 `site-packages`
3. 安装 pip 和所有依赖 (`backend/requirements.txt`)
4. 删除 `python311._pth` 使 `PYTHONPATH` 环境变量生效

macOS 和 Linux 使用 `python-build-standalone` 构建独立 Python 运行时。

## CI/CD 流水线

### 触发条件

- 推送 `v*` 格式的 tag 时自动触发
- 支持手动触发 (`workflow_dispatch`)

### 流水线步骤

1. **Build 矩阵** (3 平台并行):
   - 安装 Node.js 22 + Python 3.11
   - 安装 Python 依赖
   - 嵌入 Python 运行时 (平台特定)
   - 安装 npm 依赖
   - 编译前端 + Electron
   - 打包安装包
   - 上传构建产物 (artifact)

2. **Release** (仅 tag 推送):
   - 下载所有平台的构建产物
   - 删除跨平台冲突文件 (`builder-debug.yml`)
   - 创建 GitHub Release 并上传资产

### 版本号规则

格式: `V{MAJOR}.{MINOR}.{PATCH}-build.{YYMMDDNN}`

示例: `v3.3.2-build.26072003`

### 发布流程

```bash
# 1. 更新版本号
# 修改 package.json 的 version 字段
# 修改 electron/config.ts 的 VERSION 和 BUILD

# 2. 编译 Electron 主进程
npm run build:electron

# 3. 提交并推送 tag
git add .
git commit -m "chore: bump version to x.x.x [skip ci]"
git tag v3.3.2-build.26072003
git push origin main
git push origin v3.3.2-build.26072003

# 4. GitHub Actions 自动编译并发布
# 监控: https://github.com/bangbang8000-cell/MagicCommander/actions
```

## 生产部署

### Windows

1. 下载 `MagicCommander Setup x.x.x.exe`
2. 双击运行安装向导
3. 安装完成后桌面和开始菜单自动创建快捷方式
4. 首次启动：自动初始化 Python 运行时环境

### macOS

1. 下载 `MagicCommander-x.x.x-arm64.dmg`
2. 双击挂载 DMG
3. 将 MagicCommander 拖入 Applications 文件夹
4. 首次启动：右键 → 打开（绕过 Gatekeeper）

### Linux

1. 下载 `MagicCommander-x.x.x.AppImage`
2. 添加执行权限: `chmod +x MagicCommander-x.x.x.AppImage`
3. 双击运行或通过命令行启动

或使用 deb 包:

```bash
sudo dpkg -i magiccommander_x.x.x_amd64.deb
```

## 自动更新

MagicCommander 使用 `electron-updater` 实现自动更新：

- 启动时自动检查 GitHub Releases 是否有新版本
- 检测到新版本后提示用户下载
- 下载完成后提示重启安装
- 用户也可手动通过菜单栏 "工具 → 检查更新" 触发

## Cloud Connect — 云平台集成 (v3.5.0)

### 架构说明

MagicCommander v3.5.0 支持连接自建 MagicCommander Platform，实现团队协作功能：

```
MagicCommander Client (Electron)
    │
    ├── 平台 API (FastAPI + JWT)
    │   ├── /api/v1/auth/*          # 认证 (飞书/QQ/微信扫码 + JWT)
    │   ├── /api/v1/templates/*     # 模板市场 CRUD + 搜索 + 下载
    │   ├── /api/v1/projects/*      # 项目管理 (列表/搜索/统计)
    │   ├── /api/v1/notifications/* # 通知公告
    │   ├── /api/v1/user/*          # 用户档案管理
    │   └── /api/v1/client/*        # 客户端版本检查
    │
    └── Gitea (Git 托管)
        └── /api/v1/repos/*         # 项目仓库存档下载
```

### 服务端部署

MagicCommander Platform 服务端需独立部署在 Linux 服务器（建议 Ubuntu 22.04）：

```bash
# 1. 克隆平台仓库
git clone https://github.com/bangbang8000-cell/MagicCommander-Platform.git
cd MagicCommander-Platform

# 2. 配置环境变量
cp .env.example .env
nano .env
# 必须配置:
#   DATABASE_URL=postgresql://...
#   JWT_SECRET_KEY=<随机密钥>
#   FEISHU_APP_ID=xxx          # 飞书应用 ID (可选)
#   FEISHU_APP_SECRET=xxx      # 飞书应用密钥 (可选)
#   FEISHU_REDIRECT_URI=...    # 飞书回调地址 (可选)

# 3. 启动服务 (Docker)
docker compose up -d

# 4. 验证服务
curl http://localhost:18720/api/v1/health
```

### 客户端连接配置

1. 打开 MagicCommander 设置面板 → **平台连接** 标签
2. 填写服务器地址（如 `http://81.71.11.33`）
3. 点击"测试连接"确认连通性
4. 点击云平台侧边栏图标登录

### 支持的功能

| 功能 | 说明 |
|------|------|
| QR 扫码登录 | 飞书 / QQ / 微信，JWT Token 72h 自动刷新 |
| 模板市场 | 浏览/搜索/安装云端模板，支持分类筛选 |
| 项目同步 | Push 推送本地到云端 / Pull 拉取云端到本地 / 冲突检测 |
| 通知中心 | 平台公告和版本更新提醒 |
| 用户档案 | 个人信息管理、平台账号绑定 |

### 云端 API 代理配置 (Nginx)

如果服务端使用 Nginx 反向代理，需要配置 Gitea 仓库下载路由：

```nginx
# MagicCommander Platform
location /api/v1/ {
    proxy_pass http://127.0.0.1:18720/api/v1/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

# Gitea 仓库存档 (项目 Pull 下载)
location /api/v1/repos/ {
    proxy_pass http://127.0.0.1:3000/api/v1/repos/;
    proxy_set_header Host $host;
    proxy_set_header Authorization $http_authorization;
}
```

## AI Hub 组件部署

### 架构说明

AI Hub 是 MagicCommander 的 AI 对话引擎，作为独立 FastAPI 子进程运行：

```
MagicCommander (Electron 主进程)
    │
    └── AI Hub (FastAPI 子进程)
        ├── /api/chat          # SSE 流式对话
        ├── /api/test          # 测试连接
        ├── /api/models        # 获取模型列表
        └── /api/health        # 健康检查
```

AI Hub 在用户首次打开 AI Chat 面板时自动启动，通过 HTTP 本地端口与主进程通信。端口号自动分配（可在高级设置中指定），避免端口冲突。

### 依赖清单

AI Hub 需要以下 Python 依赖（`backend/requirements.txt`）：

| 依赖 | 用途 | 版本要求 |
|------|------|---------|
| `fastapi` | Web 框架 | >= 0.100 |
| `uvicorn` | ASGI 服务器 | >= 0.23 |
| `httpx` | HTTP 客户端（连接 LLM API） | >= 0.24 |
| `openai` | OpenAI SDK（统一 LLM 接口） | >= 1.0 |
| `pandas` | Excel 数据读取 | >= 2.0 |
| `openpyxl` | Excel 文件解析 | >= 3.1 |
| `jinja2` | 模板 AST 分析 | >= 3.1 |
| `pyyaml` | YAML 解析 | >= 6.0 |
| `python-docx` | Word 文档生成 | >= 0.8 |

### 开发环境配置

```bash
# 安装 Python 依赖
pip install -r backend/requirements.txt

# 验证安装
python -c "import fastapi, uvicorn, httpx, openai, pandas, openpyxl, jinja2, yaml; print('OK')"

# AI Hub 在应用启动 AI Chat 功能时自动启动
```

### 生产环境配置

嵌入式 Python 运行时已在构建时安装所有依赖，生产环境无需额外配置。如需自定义 Python 路径：

1. 打开 MagicCommander 设置面板
2. 进入 **高级设置**
3. 修改 **Python 路径**（留空使用系统默认）
4. 修改 **AI Hub 端口**（0 表示自动分配）
5. 重启应用生效

### 独立启动 AI Hub（调试用）

```bash
cd ai_hub
python api/server.py --port 8765
```

### Provider 配置

AI Hub 支持 9 种 LLM Provider：

| Provider | 需要 API Key | 需要 Base URL | 说明 |
|----------|-------------|---------------|------|
| DeepSeek | 是 | 否 | 默认 Provider |
| OpenAI | 是 | 否 | 支持 GPT-4o 等模型 |
| Claude | 是 | 否 | Anthropic API |
| Gemini | 是 | 否 | Google AI |
| Qwen | 是 | 否 | 阿里通义千问 |
| GLM | 是 | 否 | 智谱清言 |
| Grok | 是 | 否 | xAI |
| Ollama | 否 | 是 (http://localhost:11434) | 本地部署 |
| 自定义 | 是 | 是 | 兼容 OpenAI 接口 |

配置方式：在设置面板的 AI 设置中，选择 Provider 后填写 API Key、Base URL 和模型名称。

### 智能路由

在 AI 设置中启用智能路由后，MagicCommander 根据任务类型自动选择 Provider：

- 编码任务 → 指定 Provider
- 分析任务 → 指定 Provider
- 问答任务 → 指定 Provider
- 推理任务 → 指定 Provider
- 默认 → 使用默认 Provider

## Agent v2 架构

MagicCommander v3.4.0 引入 Agent v2 智能编排引擎，采用五层架构：

```
用户对话 (Chat UI)
    │
    ▼
Planner (规划层)         ─── 理解意图 → 制定执行计划
    │
    ▼
Validator (校验层)       ─── 工具权限分级 (auto/notify/confirm)
    │
    ▼
Context Manager (上下文)  ─── 项目结构扫描 + 变量引用追踪
    │
    ▼
Executor (执行层)        ─── 27 Tools (渲染/分析/校验/反向生成...)
    │
    ▼
Recovery (恢复层)        ─── 错误识别 → 自动修正 → 重试
    │
    ▼
Reporter (报告层)        ─── 结构化执行报告 + 优化建议
```

### 工具权限分级

| 级别 | 图标 | 行为 | 示例工具 |
|------|------|------|---------|
| `auto` | 🟢 | 自动执行，无需确认 | list_projects, analyze_project |
| `notify` | 🟡 | 执行后通知用户 | render_config, dry_run |
| `confirm` | 🔴 | 需用户确认后才执行 | delete_project, delete_file |

### Skills Engine（技能引擎）

- 7 个预置 Skill：`create-from-template`、`enhance-template`、`analyze-project`、`reverse-engineer-config`、`create-project-intelligent`、`recommend-template`、`generate-labels`
- 支持用户通过对话半自动生成新 Skill
- Skill 文件存储在 `ai_hub/skills/skills/` 目录，Markdown 格式

### Memory System（记忆系统）

- **用户画像**：记录用户偏好（常用 Provider、语言、工作区路径）
- **项目历史**：记录每个项目的操作历史（渲染次数、常用模板）
- **操作习惯**：记录高频操作模式，优化后续交互
- 存储位置：`ai_hub/project_history/`

## Chat UI 新特性

### 会话管理
- 横向标签栏：支持多会话并行，一键切换
- 标签溢出检测：超出显示宽度时自动折叠到历史下拉菜单
- AI 自动提炼会话标题：首次对话后异步生成 15 字以内标题

### 界面优化
- 移除模式标签和自主模式按钮，整合到设置面板
- 字体大小可调节：小 (12px) / 中 (13px) / 大 (14px)
- 图标语义修正：清除 (RotateCcw) / 新建会话 (MessageSquarePlus)

## 故障排查

| 问题 | 解决方案 |
|------|---------|
| `npm install` 失败 | 确保 Node.js >= 22，清除 `node_modules` 后重试 |
| Python 依赖缺失 | 执行 `pip install -r backend/requirements.txt` |
| AI Hub 启动失败 | 检查 Python 3.11+ 是否安装，确认 `backend/requirements.txt` 依赖已安装，查看设置面板中 Python 路径 |
| AI Hub 端口占用 | 在高级设置中修改 AI Hub 端口号，或设置 0 自动分配 |
| AI Hub 连接超时 | 检查防火墙设置，确认本地端口未被阻止 |
| API Key 无效 | 在设置面板中重新输入 API Key，点击测试连接验证 |
| 模型连接失败 | 检查网络连接和 Base URL 是否正确，Ollama 用户确认 `ollama serve` 已启动 |
| 获取模型列表失败 | 检查 API Key 是否有权限访问模型列表接口 |
| 对话无响应 | 检查 AI Hub 状态（设置面板），确认 AI Hub 正在运行 |
| Electron 启动白屏 | 确认 `npm run build:renderer` 已执行，检查 `dist/` 目录 |
| 打包失败 (macOS) | 确保 `build/background.tiff` 存在 |
| 打包失败 (Windows) | 确保 `resources/python/` 目录存在且已嵌入 Python |
| GitHub Actions 发布失败 | 检查 tag 格式是否为 `v*`，确保 `GH_TOKEN` 有写入权限 |
| 渲染返回非 JSON 错误 | Python CLI 进度输出污染 stdout，v3.4.0 已修复（balance-brace JSON 提取 + 进度过滤） |
| AI 工具调用 XML 截断 | Agent v2 增加 XML 容错解析 + 截断回退提取，system.md 强化 JSON 格式优先 |
| AI 对话无响应 | 检查 AI Hub 是否运行（设置面板），确认 Agent v2 的 validator 未拦截工具调用 |
| 会话标签不显示标题 | AI 标题生成有 8 秒超时，超时后保留默认标题；可手动双击标签修改 |
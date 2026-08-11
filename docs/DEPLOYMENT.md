# MagicCommander 部署指南

> 适用于 v3.6.0。涵盖：开发环境、构建测试、版本管理与发布（GitHub Actions）、客户端安装、云平台（MagicCommander Platform）部署。

## 目录

1. [环境要求](#环境要求)
2. [开发环境](#开发环境)
3. [构建与测试](#构建与测试)
4. [版本管理与发布流程](#版本管理与发布流程)
5. [CI/CD 流水线](#cicd-流水线)
6. [客户端生产部署](#客户端生产部署)
7. [云平台部署](#云平台部署)
8. [AI Hub 部署](#ai-hub-部署)
9. [故障排查](#故障排查)

---

## 环境要求

| 依赖 | 版本 | 用途 |
|------|------|------|
| Node.js | 20+ | 前端构建 |
| Python | 3.8+ | 渲染引擎 / AI Hub |
| npm | 10+ | 依赖管理 |
| Git | 2.40+ | 版本控制 |

Windows 发布版已内嵌 Python 3.11 运行时，终端用户无需安装 Python。

---

## 开发环境

```bash
# 1. 克隆仓库
git clone https://github.com/bangbang8000-cell/MagicCommander.git
cd MagicCommander

# 2. 安装依赖
npm install
pip install -r backend/requirements.txt

# 3. 启动开发模式（Vite + Electron 并行）
npm run dev:all

# 4. 单独启动
npm run dev           # 仅 Vite 前端
npm run dev:electron  # 仅 Electron（需先启动 Vite）
```

> 💡 开发模式下 AI Hub 会自动启动；首次启动需安装 AI 依赖（约 30 秒）。

## 项目结构

```
MagicCommander/
├── src/                  # 前端 (React + TypeScript)
│   ├── components/       # UI 组件
│   ├── stores/           # Zustand 状态管理
│   ├── i18n/             # 6 语言国际化
│   └── types/            # 类型定义
├── electron/             # Electron 主进程（IPC / 安全 / 更新）
├── backend/              # Python 渲染引擎
│   ├── main.py           # 统一命令行入口
│   ├── pre_processing.py # 渲染管线（输入指纹缓存）
│   └── analyzer.py       # 项目/模板质量分析
├── ai_hub/               # AI Hub 服务 (FastAPI Agent)
├── public/docs/          # 中英使用指南
├── resources/            # 嵌入式 Python 运行时
├── workspace/            # 默认项目工作区
├── version.json          # 版本号单一事实来源
└── docs/                 # 开发文档与计划
```

---

## 构建与测试

```bash
# 类型检查（渲染进程 + Electron）
npm run typecheck

# 代码质量门禁（0 error 0 warning）
npm run lint
npm run format:check

# 测试（渲染进程 + Electron + 后端 + AI Hub）
npm test
python -m pytest backend/tests/ -v
python -m pytest ai_hub/tests/ -v

# 版本一致性校验（version.json / package.json / VERSION.txt）
npm run check-version

# 构建
npm run build           # 前端 + Electron
npm run build:renderer  # 仅前端
npm run build:electron  # 仅 Electron 主进程

# 打包
npm run dist:win        # Windows NSIS (.exe)
npm run dist:mac        # macOS (.zip)
npm run dist:linux      # Linux (AppImage + deb)
npm run dist:all        # 全平台
```

CI 会自动执行以上门禁（typecheck / lint / format:check / check-version / 全部测试 / build），任一失败即阻断合并。

---

## 版本管理与发布流程

### 版本号规则

`V{MAJOR}.{MINOR}.{PATCH} Build {YYMMDDNN}`，Git tag 使用干净格式 `v{MAJOR}.{MINOR}.{PATCH}`（如 `v3.6.0`）。

### 单一事实来源

**`version.json`** 是版本号唯一来源：

```json
{
  "version": "3.6.0",
  "build": "26081101",
  "displayVersion": "V3.6.0 Build 26081101",
  "releaseDate": "2026-08-11"
}
```

- `electron/config.ts` 启动时从 version.json 读取
- 安装包 `artifactName` 使用 `${env.MC_BUILD}`（由 CI 从 version.json 注入）
- CI 通过 `npm run check-version` 校验 version.json / package.json / VERSION.txt 三者一致

### 发布流程

```bash
# 1. 更新版本号（唯一需要手动改的文件）
#    编辑 version.json 后执行：
npm run sync-version   # 自动重新生成 VERSION.txt 并同步 package.json

# 2. 门禁验证
npm run typecheck && npm run lint && npm run format:check && npm run build

# 3. 提交 + 打干净 tag + 推送
git add -A
git commit -m "release: v3.6.0 - <变更摘要>"
git push origin main
git tag -a v3.6.0 -m "MagicCommander v3.6.0"
git push origin v3.6.0

# 4. GitHub Actions 自动编译并发布（监控 /actions）
```

> ⚠️ 推送 `v*` tag 会触发 **Build & Release** 工作流（三平台编译 + GitHub Release）。tag 应使用干净格式 `v3.6.0`，避免 `-build.` 后缀的中间 tag。

---

## CI/CD 流水线

### CI（push main / PR）— [ci.yml](.github/workflows/ci.yml)

| 步骤 | 命令 |
|------|------|
| 类型检查 | `npm run typecheck` |
| 代码质量 | `npm run lint` + `npm run format:check` |
| 版本一致性 | `npm run check-version` |
| 测试 | `npm test` + 后端 pytest + ai_hub pytest |
| 构建 | `npm run build` |

### Build & Release（push `v*` tag）— [build.yml](.github/workflows/build.yml)

1. **三平台并行构建**（Windows / macOS / Linux）
   - 安装 Node 22 + Python 3.11
   - Windows 下载并嵌入 Python 3.11 运行时；macOS/Linux 使用 python-build-standalone
   - `npm ci` + `npm run build`
   - `electron-builder` 打包（`MC_BUILD` 从 version.json 注入 artifactName）
   - 上传构建产物
2. **Release**：下载全部产物 → 创建 GitHub Release 并上传安装包

---

## 客户端生产部署

### Windows

1. 下载 `MagicCommander-Setup-<version>-build.<build>.exe`
2. 双击运行安装向导（NSIS，支持选择安装目录）
3. 桌面与开始菜单自动创建快捷方式
4. 首次启动自动初始化内嵌 Python 环境

### macOS

1. 下载 `MagicCommander-<version>-build.<build>-mac-<arch>.zip`
2. 解压后拖入 Applications 文件夹
3. 首次启动：右键 → 打开（绕过 Gatekeeper）

### Linux

```bash
# AppImage
chmod +x MagicCommander-<version>-build.<build>-linux-x86_64.AppImage
./MagicCommander-<version>-build.<build>-linux-x86_64.AppImage

# deb
sudo dpkg -i magiccommander_<version>_amd64.deb
```

### 自动更新

- 启动后延迟 3 秒静默检查 GitHub Releases 更新
- 发现新版本自动下载，下载完成提示重启安装
- 也可通过菜单 **工具 → 检查更新** 手动触发

---

## 云平台部署

### 架构

```
MagicCommander Client (Electron)
    │
    ├── MagicCommander Platform API (FastAPI + JWT, SQLite)
    │   ├── /api/v1/auth/*          # 认证 (飞书/QQ/微信扫码 + JWT)
    │   ├── /api/v1/templates/*     # 模板市场
    │   ├── /api/v1/projects/*      # 项目同步
    │   ├── /api/v1/user/*          # 用户档案
    │   └── /api/v1/admin/*         # 管理接口（需 ADMIN_TOKEN）
    │
    └── Gitea (Git 托管 + 模板/项目仓库)
```

平台仓库托管于私有 **群晖 Git Server**（`ssh://...@ds1522plus/.../magiccommander-platform.git`），运行于 **ubuntu-tce**（Ubuntu 24.04, systemd + nginx + SQLite）。

### 服务端组件

| 组件 | 端口 | 说明 |
|------|------|------|
| magiccommander-api | 127.0.0.1:18720 | FastAPI 服务（systemd 管理） |
| gitea | :3000 | Gitea 仓库服务 |
| nginx | :80 | 反向代理 / 静态网站 |

### 部署到 ubuntu-tce

一键部署脚本 `magiccommander-platform/scripts/deploy-ubuntu-tce.sh`：

```bash
cd magiccommander-platform
bash scripts/deploy-ubuntu-tce.sh   # 构建 Astro → rsync 同步 → 装依赖 → 重启服务 → 健康检查
```

> ⚠️ **Windows 开发机无 rsync**：请使用 `winget install rsync` 安装，或使用 tar-over-ssh 方式：
> ```bash
> tar czf - --exclude=node_modules --exclude=venv --exclude=.git --exclude=dist --exclude=.env . \
>   | ssh ubuntu@ubuntu-tce "tar xzf - -C /opt/magiccommander-platform"
> ```

### 环境变量（.env）

部署脚本 **不会**覆盖服务器的 `.env`（rsync 已排除），服务器专属配置：

| 变量 | 必填 | 说明 |
|------|------|------|
| `GITEA_URL` | 是 | Gitea 地址（服务器上为 `http://localhost:3000`） |
| `GITEA_API_TOKEN` | 是 | Gitea 管理 token |
| `JWT_SECRET` | 是 | JWT 签名密钥（生产必须自定义） |
| `ADMIN_TOKEN` | 是* | 管理接口口令（v3.6.0 起无默认值，见下） |
| `FEISHU_APP_ID/SECRET` | 可选 | 飞书扫码登录 |
| `MC_ENV` | 可选 | 设 `production` 时强制校验 JWT_SECRET/ADMIN_TOKEN |

### 管理接口鉴权（v3.6.0 安全加固）

- **无公开默认口令**：历史版本存在 `mc-admin-2026` 默认值，v3.6.0 已删除
- 未配置 `ADMIN_TOKEN` 时，管理接口返回 **503**（拒绝而非放行）
- 管理接口通过 `Authorization: Bearer <token>` 或 `X-Admin-Token` 请求头鉴权
- 口令生成与配置：`openssl rand -hex 24` → 写入服务器 `.env` → 重启 API
- 口令记录见平台仓库 `docs/ADMIN_TOKEN.md`

### 数据备份

服务器 `scripts/manage.sh backup` 会备份：
- `api.db`（用户绑定 / 扫码会话）
- `analytics.db`（访问统计）
- Gitea 全量 dump

---

## AI Hub 部署

AI Hub 是 MagicCommander 的 AI 对话引擎，作为 **FastAPI 子进程** 随桌面应用启动：

```
Electron 主进程 ──spawn──▶ python ai_hub/main.py --port 18721 --auth-token <token>
```

### 关键设计

- **本地鉴权**：Electron 生成随机 token，通过 `--auth-token` 注入子进程；所有 `/api/chat/*` 请求必须携带 `X-MC-Auth-Token` 头，否则 401（v3.6.0 加固）
- **CORS 已移除**：仅本地主进程访问，消除任意网页跨域调用
- **进程管理**：并发启动去重、异常退出指数退避自动重启（最多 3 次）、30 秒健康检查
- **会话 TTL**：24 小时空闲自动清理，防止内存泄漏
- **工具执行异步化**：`asyncio.create_subprocess_exec` 不阻塞事件循环

### 依赖

AI Hub 使用 `ai_hub/requirements.txt`：fastapi / uvicorn / openai / httpx / sse-starlette / pydantic-settings 等。Windows 发布版已内嵌。

### Provider 配置

| Provider | 需要 API Key | 说明 |
|----------|-------------|------|
| DeepSeek / OpenAI / Claude / Gemini / Qwen / GLM / Grok | 是 | OpenAI 兼容接口 |
| **Ollama** | **否** | 本地部署（v3.6.0 起无需 Key 即可注册） |
| 自定义 | 是 | 兼容 OpenAI 接口 |

配置方式：设置面板 → AI 标签 → 选 Provider → 填 API Key / Base URL / 模型 → 测试连接。

### 调试：独立启动 AI Hub

```bash
cd MagicCommander
PYTHONPATH=".;backend" python ai_hub/main.py --port 18799 \
  --workspace workspace --backend-dir backend --auth-token <token>
# 不带 token 启动则无鉴权（仅调试）
```

---

## 故障排查

| 问题 | 解决方案 |
|------|---------|
| `npm install` 失败 | 确保 Node.js >= 20，清除 `node_modules` 后重试 |
| Python 依赖缺失 | `pip install -r backend/requirements.txt` |
| AI Hub 启动失败 | 检查 Python 3.8+，确认依赖已装；Windows 发布版已内嵌 |
| AI Hub 401 | 主进程与子进程 token 不一致，重启应用 |
| 渲染失败 | 检查模板语法（工作台可先做 dry-run / 校验） |
| 渲染返回非 JSON | 检查 `para.xlsx` 的 `project_para` sheet 配置是否正确 |
| 自动更新失败 | 检查 GitHub Releases 是否已发布新 tag |
| 云平台登录失败 | 检查服务器地址、`.env` 的 GITEA_URL/FEISHU 配置、服务是否运行（`sudo systemctl status magiccommander-api`） |
| 管理接口 503 | 服务器 `.env` 未配置 `ADMIN_TOKEN`，补配后重启 API |
| 管理接口 401 | `ADMIN_TOKEN` 不匹配，核对 `docs/ADMIN_TOKEN.md` |
| GitHub Actions 发布失败 | 确认 tag 为 `v*` 干净格式，GH_TOKEN 有权限 |
| 打包失败 (Windows) | 确保 `resources/python/` 已嵌入 Python |

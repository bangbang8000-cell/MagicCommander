---
name: "github-sync"
description: "将 MagicCommander3 代码同步到 GitHub。当用户要求推送到 GitHub、同步代码、提交版本或归档时调用。自动处理 SSL 证书问题、网络重试和远程历史冲突。"
---

# GitHub 同步（MagicCommander3）

将 MagicCommander3 项目代码同步到 GitHub 仓库 `https://github.com/bangbang8000-cell/MagicCommander.git`。

## 环境信息

- 仓库地址：`git@github.com:bangbang8000-cell/MagicCommander.git`（SSH 协议）
- HTTPS 地址（备用）：`https://github.com/bangbang8000-cell/MagicCommander.git`
- 分支：`main`
- 工作目录：`D:\MyCoding\MagicCommander\MagicCommander3`
- Git 用户配置（一次设置即可）：
  ```powershell
  git config user.name "everg"
  git config user.email "everg@magiccommander.dev"
  ```

## 推送前检查清单

推送前确保以下文件已更新：

| 文件 | 需要更新的内容 |
|------|---------------|
| `package.json` | `"version"` 字段 |
| `electron/config.ts` | `VERSION.CURRENT` |
| `dist-electron/config.js` | `VERSION.CURRENT` |
| `README.md` | 版本历史表格、截图路径（使用相对路径如 `snapshot/xxx.png`） |

## 同步流程

### 第一步：确保远程仓库使用 SSH 协议

SSH 是推荐的推送方式（HTTPS 443 端口在当前环境不稳定）。

```powershell
git remote get-url origin
# 应该输出：git@github.com:bangbang8000-cell/MagicCommander.git
# 如果是 HTTPS 地址，切换为 SSH：
git remote set-url origin git@github.com:bangbang8000-cell/MagicCommander.git
```

**前提条件**：已配置 SSH Key（`~/.ssh/id_ed25519`），已添加到 GitHub 账号。
- 生成 SSH Key：`ssh-keygen -t ed25519 -C "everg@magiccommander.dev" -f "$env:USERPROFILE\.ssh\id_ed25519" -N '""'`
- 公钥内容：`Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"`
- 添加位置：`https://github.com/settings/ssh/new`（需要 GitHub 浏览器已验证登录）

### 第二步：处理远程历史（如果本地是新初始化的仓库）

如果本地仓库是全新初始化的，但远程已有提交记录，需要先拉取并合并：

```powershell
git -c http.sslVerify=false fetch origin main
git -c http.sslVerify=false merge origin/main --allow-unrelated-histories
```

如果出现冲突（本地和远程都有同名文件），用本地版本覆盖：

```powershell
git checkout --ours .
git add -A
git -c http.sslVerify=false commit -m "merge: 同步远程仓库历史"
```

### 第三步：暂存所有变更

```powershell
git add -A
```

**不要提交**以下内容（确保 `.gitignore` 已配置排除）：
- `.electron-user-data/`
- `node_modules/`
- `dist/` / `dist-electron/`
- `magiccommander-i18n-plan/`
- `mc-backup/`

### 第四步：提交

```powershell
git -c http.sslVerify=false commit -m "vX.Y.Z: <简要描述>"
```

### 第五步：推送（使用 SSH 协议）

当前环境通过 SSH（22 端口）连接 GitHub，推送稳定可靠：

```powershell
git push -u origin main
```

如果 SSH 推送失败（如 `known_hosts` 写入警告），忽略警告即可——实际推送通常会成功。查看输出中的 `main -> main` 行确认推送结果。

如果 SSH 不可用，回退到 HTTPS 重试循环：
```powershell
for ($i=1; $i -le 5; $i++) {
  Write-Output "--- 第 $i 次尝试 ---"
  git -c http.sslVerify=false push -u origin main 2>&1
  if ($LASTEXITCODE -eq 0) { Write-Output '推送成功'; break }
  Start-Sleep -Seconds 3
}
```

关键参数说明：
- `-c http.sslVerify=false` — 绕过当前环境的 SSL 证书问题
- `-u origin main` — 首次推送时设置上游跟踪
- 重试循环 — 应对间歇性网络故障，一般 1-3 次内成功

## 常见问题及解决方案

| 问题 | 原因 | 解决方法 |
|------|------|----------|
| `Failed to connect to github.com port 443` | HTTPS 端口在当前环境不通 | 切换到 SSH 协议：`git remote set-url origin git@github.com:bangbang8000-cell/MagicCommander.git` |
| `Permission denied (publickey)` | SSH 密钥未配置 | 生成 SSH key 并在 GitHub 设置中添加公钥 |
| `hostfile_replace_entries` 警告 | known_hosts 文件权限问题 | 忽略即可，实际推送不受影响。检查输出中的 `main -> main` 确认成功 |
| `! [rejected] main -> main (fetch first)` | 远程有新提交，本地落后 | 执行第二步拉取并合并远程历史 |
| `CONFLICT (add/add)` 大量文件冲突 | 本地和远程都初始化了同名文件 | 执行 `git checkout --ours .` 用本地版本覆盖 |
| 推送卡在 `schannel: remote party requests renegotiation` | SSL 握手超时 | 等待后重试，通常下一次尝试就会成功 |

## 快速参考：完整同步命令

```powershell
cd D:\MyCoding\MagicCommander\MagicCommander3
git add -A
git commit -m "vX.Y.Z: <描述>"
git push -u origin main
```

如果推送失败，先确认远程是 SSH 协议：
```powershell
git remote get-url origin
# 应为 git@github.com:bangbang8000-cell/MagicCommander.git
# 如果不是，切换：
git remote set-url origin git@github.com:bangbang8000-cell/MagicCommander.git
git push -u origin main
```

## GitHub Actions Release 工作流（重要经验）

### 触发方式

推送 `v*` 格式的 tag 会自动触发三平台编译和 Release 发布。

**Tag 创建策略**：仅在 MAJOR/MINOR/PATCH 版本号变更时创建 tag，Build 号变化不打 tag。

```powershell
# 语义化版本变更时打 tag（例如 v3.0.1 → v3.0.2）
git tag -a v3.0.2 -m "v3.0.2: 修复 XX 问题"
git push origin v3.0.2

# Build 号变化时（如 26071409 → 26071410）直接推送到 main 分支即可，不打 tag
git add -A
git commit -m "v3.0.1: 更新 build 号"
git push -u origin main
```

### 关键避坑：artifact 上传路径

**❌ 错误写法**（会上传解包目录中的松散文件）：
```yaml
# upload-artifact
path: release/*              # 会匹配到 release/win-unpacked/ 等目录

# action-gh-release
files: release/**/*          # 递归上传所有子目录文件
```

**✅ 正确写法**（只上传实际的安装包文件）：
```yaml
# upload-artifact — 只匹配安装包扩展名
path: |
  release/*.exe
  release/*.dmg
  release/*.AppImage
  release/*.deb
  release/*.blockmap
  release/*.yml

# action-gh-release — 精确匹配（download-artifact 会按 artifact 名创建子目录）
files: |
  release/*/*.exe
  release/*/*.dmg
  release/*/*.AppImage
  release/*/*.deb
  release/*/*.blockmap
  release/*/*.yml
draft: false                  # 直接发布，不要草稿
```

### 问题排查

| 症状 | 原因 | 解决 |
|------|------|------|
| Release 页面显示 120 个松散文件 (af.pak, app.asar, base.py 等) | `upload-artifact` 用了 `release/*` 通配符，匹配了 win-unpacked/ 等解包目录 | 改用扩展名精确匹配（见上方正确写法） |
| Release 创建失败（403 / rate limit） | `files: release/**/*` 递归上传所有文件，触发 API 频率限制 | 改用 `release/*/*.ext` 精确匹配 |
| 构建失败 (Package 步骤 0s) | 缺少 `icon.ico` 或 Node.js 版本过低 | 生成 `public/icons/icon.ico`（用 Python Pillow）并确保 `node-version: '20'` |
| Windows .exe 不出现在 Release | artifact 名和路径模式不匹配 | 确认 `upload-artifact` 的 `path` 和 `action-gh-release` 的 `files` 都包含 `.exe` 扩展名 |

### 完整工作流文件参考

参见 `.github/workflows/build.yml`，关键配置：
- Node.js: `'20'`（不要用 18，已弃用）
- Python: `'3.11'`（用于 Jinja2 后端依赖）
- 构建矩阵：`windows-latest / macos-latest / ubuntu-latest`
- electron-builder 参数：`--publish=never`（避免自动发布冲突）
- Release 由 `softprops/action-gh-release@v2` 自动创建，生成 release notes
# AI Agent 长期记忆

## 项目备份规则

### 备份目录
- **位置**: `D:\MyCoding\MagicCommander\mc-backup`
- **命名格式**: `backup-{版本号}`（例如：`backup-2.2.0`）
- **触发时机**: 每次发布新版本前，必须先归档当前版本

### 备份流程
1. 检查目标目录 `D:\MyCoding\MagicCommander\mc-backup` 是否存在，不存在则创建
2. 在 `mc-backup` 目录下创建 `backup-{版本号}` 子目录
3. 排除以下目录后复制项目文件到备份目录：
   - `node_modules/`
   - `dist/`
   - `dist-electron/`
   - `.trae/`
   - `mc-backup/` 自身
   - 同目录的旧 `backup-*` 目录（如有需要排除）
4. 更新 `package.json` 中的版本号
5. 验证备份内容完整性

### 注意事项
- 备份前应确认项目处于稳定可发布状态
- 备份完成后需向用户报告备份位置和版本号
- 长期保留历史备份，不主动清理

---

## 项目信息

- **项目名称**: MagicCommander
- **项目类型**: Electron + React 桌面应用
- **项目根目录**: `D:\MyCoding\MagicCommander\MagicCommander3`
- **技术栈**: Electron 28.x + React 18.x + TypeScript 5.x + Vite 5.x + TailwindCSS 3.x

---

## 版本号长期规则

### 推荐格式
- **对外显示**: `MagicCommander V{MAJOR}.{MINOR}.{PATCH} Build {YYMMDDNN}`
- **示例**: `MagicCommander V3.0.0 Build 26071401`
- **package.json version**: 只保留标准语义化版本，例如 `3.0.0`
- **Git Tag**: 使用 `v{MAJOR}.{MINOR}.{PATCH}`，例如 `v3.0.0`。仅在 MAJOR/MINOR/PATCH 版本号发生变化时创建 tag，Build 号变化不打 tag，避免频繁创建 tag 污染 Release 列表
- **安装包名**: 使用 `MagicCommander-Setup-{version}-build.{build}.{ext}` 或在发布说明中标明 Build 号

### 字段含义
- `MAJOR`: 大版本，架构级升级、产品方向变化、重大 UI/功能升级时递增
- `MINOR`: 中版本，新增重要模块或明显功能增强时递增
- `PATCH`: 修订版本，bug 修复、小功能优化、体验改进时递增
- `YYMMDDNN`: 日期型构建号，`YY` 年、`MM` 月、`DD` 日、`NN` 当天构建序号，从 `01` 开始

### 注意事项
- 不要把正式版写成 `3.0.0-26071401`，因为连字符后缀会被语义化版本识别为预发布版本，可能影响 Electron 自动更新和版本比较。
- Build 号用于精确追踪构建批次，不替代语义化版本。
- 用户反馈时优先记录完整版本，例如 `V3.0.0 Build 26071401`。

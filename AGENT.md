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

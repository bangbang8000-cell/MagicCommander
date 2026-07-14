# MagicCommander -- 正式发布

**发布日期：** 2026 年 7 月 7 日  
**下载地址：** [GitHub Releases](https://github.com/bangbang8000-cell/MagicCommander/releases/latest)  
**许可证：** [MIT](https://github.com/bangbang8000-cell/MagicCommander/blob/main/LICENSE)

## MagicCommander 是什么？

MagicCommander（MC）是一款**跨平台桌面应用**，专为网络工程师和 IT 运维团队设计，用于**批量生成网络设备配置文件**。如果你管理着 50 台、200 台甚至 500 台交换机、路由器和防火墙，MagicCommander 能将繁琐的手动配置流程转化为高效的模板驱动工作流。

**工作原理：** 你在 Excel 表格中维护设备参数（主机名、IP 地址、VLAN ID、接口描述等），用 Jinja2 语法定义配置模板，MagicCommander 一键为每台设备生成标准化的配置文件。

## 核心功能

### 模板驱动渲染

用 **Jinja2 语法** 编写网络设备配置模板，为每台设备传入不同参数批量渲染：

- 支持变量、循环、条件判断和过滤器
- 支持模板继承和包含
- 支持自定义 Jinja2 过滤器和扩展
- 模板一次编写，所有项目、所有设备永久复用

```jinja2
interface {{ interface_name }}
 description {{ description }}
 switchport mode access
 switchport access vlan {{ vlan_id }}
 no shutdown
```

### 内置 Excel 编辑器

设备参数天然适合表格管理。MagicCommander **内建 Excel 编辑器**，直接在软件内编辑 connection、hostname、ipaddress、parameter 等参数表，无需切换工具。

### 一键批量渲染

选好模板和参数，点击渲染，MagicCommander 逐项目生成配置文件和 YAML 中间文件：

- 渲染进度实时可见
- 详细日志记录每台设备的处理结果
- YAML 中间文件便于调试排查

### 设备标签自动生成

从 Excel 数据中自动提取设备名、序列号、型号、机柜位置、管理 IP 等信息，生成 **Word 格式标签文档**，直接打印：

- A4 / A5 纸张规格
- 横向 / 纵向打印
- 每页标签数可自定义

### 多语言国际化

MagicCommander 开箱即用支持 **13 种语言**，全球运维团队无缝协作：

- 简体中文、**繁体中文**、English、日本語、한국어
- Français、Deutsch、Español、Português
- Русский、العربية（含从右到左 RTL 布局）、Tiếng Việt、ไทย

### 离线桌面应用

所有数据保存在本地。MagicCommander 基于 Electron + React + TypeScript 构建，完全离线运行，不上传任何数据到云端。企业网络配置数据安全可控。

### 专业 Jinja2 编辑器

内置代码编辑器基于 **Monaco Editor**（与 VS Code 同款引擎）：

- Jinja2 语法高亮
- 代码自动补全和提示
- 多标签页编辑
- 不输专业 IDE 的编辑体验

### 终端命令系统

内置终端面板，为高级用户提供命令行交互能力：

- 输入 `help` 查看所有可用命令
- `list` / `ls` 列出所有项目
- `select <项目名>` 切换当前项目
- `render` 触发配置渲染
- `theme <dark|light>` 切换主题

## 安装与使用

1. **下载** 最新版本：[GitHub Releases](https://github.com/bangbang8000-cell/MagicCommander/releases/latest)

2. **安装** 对应平台 -- 内置嵌入式 Python 运行时，无需单独安装 Python

3. **创建项目** -- MagicCommander 自动生成 `templates/`、`excel/`、`output/`、`yaml/`、`output-label/` 五个目录

4. **编写 Jinja2 模板** -- 在 `templates/` 目录下创建 `.j2` 文件

5. **填写设备参数** -- 在 `excel/` 目录下编辑参数表

6. **点击"渲染"** -- 配置文件即刻生成到 `output/` 目录

7. **生成设备标签**（可选）-- Word 文档生成到 `output-label/` 目录

### 支持平台

| 平台 | 格式 | 文件名格式 |
|---|---|---|
| Windows | NSIS 安装包 | `MagicCommander-Setup-*.exe` |
| macOS (Apple Silicon) | ZIP | `MagicCommander-*-mac-arm64.zip` |
| macOS (Intel) | ZIP | `MagicCommander-*-mac-x64.zip` |
| Linux | AppImage | `MagicCommander-*-linux-x86_64.AppImage` |
| Linux | deb | `MagicCommander-*-linux-amd64.deb` |

## 项目结构

```
项目名称/
├── templates/       # Jinja2 模板 (.j2)
├── excel/           # 设备参数表 (.xlsx)
├── output/          # 生成的配置文件 (.txt)
├── yaml/            # 生成的 YAML 中间文件
└── output-label/    # 生成的设备标签文档 (.docx)
```

## 技术栈

| 组件 | 技术 |
|---|---|
| 桌面框架 | Electron 28 |
| 前端 | React 18 + TypeScript 5 + Vite 5 |
| UI 样式 | TailwindCSS 3 |
| 状态管理 | Zustand 4 |
| 代码编辑器 | Monaco Editor 4 |
| 模板引擎 | Python 3 + Jinja2 |
| CI/CD | GitHub Actions |

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+J` | 切换底部面板 |
| `Ctrl+S` | 保存当前文件 |
| `Ctrl+W` | 关闭当前标签页 |
| `Ctrl+Shift+T` | 重新打开最近关闭的标签 |
| `Ctrl+Shift+E` | 切换到项目浏览器 |
| `Ctrl+Shift+F` | 切换到搜索面板 |
| `Ctrl+Shift+R` | 切换到工作台 |

## 近期更新亮点

| 版本 | 日期 | 主要更新 |
|---|---|---|
| **最新版** | 2026-07 | 全面国际化覆盖（资源管理器、标签打印、渲染面板），终端 help 命令支持实时语言切换，新增繁体中文（zh-TW） |
| 2.9.5 | 2026-07-02 | Workspace 迁移至用户数据目录、全平台 Python 嵌入、macOS ZIP 打包、右键菜单国际化 |
| 2.9.3 | 2026-07-01 | 嵌入式 Python（Windows）、示例项目打包、跨平台 CI/CD |
| 2.9.2 | 2026-07-01 | 跨平台构建支持（Windows / macOS / Linux） |
| 2.9.1 | 2026-07-01 | 13 种语言国际化、RTL 布局、UI 优化 |
| 2.0.0 | -- | 重构为 Electron + React 架构 |

## 参与贡献

欢迎提交 Issue 和 Pull Request。如有功能建议或问题反馈，请在 [GitHub Issues](https://github.com/bangbang8000-cell/MagicCommander/issues) 中提出。

MagicCommander is released under the [MIT License](https://github.com/bangbang8000-cell/MagicCommander/blob/main/LICENSE).

<p align="center">
  <img src="public/icons/icon.svg" alt="MagicCommander" width="120" />
</p>

<h1 align="center">MagicCommander</h1>

<p align="center">
  <strong>告别重复劳动，让网络设备配置生成一触即发</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.9.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/platform-Windows%20x64-lightgrey" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/electron-28.x-9cf" alt="Electron" />
  <img src="https://img.shields.io/badge/react-18.x-61dafb" alt="React" />
</p>

---

## 它是什么

MagicCommander 是一款专为网络工程师打造的桌面工具，它将 **Jinja2 模板** 与 **Excel 参数表** 深度结合，让你在几分钟内完成几百台设备的配置生成——而不是花一整天机械地复制粘贴。

想象一下：你维护着 200 台交换机，每台配置大同小异——接口描述、VLAN 划分、ACL 规则、路由策略……逐台手工编写不仅耗时，更致命的是 **出错率极高**。MagicCommander 的核心理念只有一条：**定义一次模板，填写一次参数，剩下的交给工具。**

---

## 核心优势

<table>
<tr>
<td width="50%">

### 模板驱动，一次定义，无限复用

编写 Jinja2 模板定义配置骨架，将设备差异抽象为变量。新增设备只需追加一行 Excel 数据，无需触碰模板。

</td>
<td width="50%">

### Excel 管理参数，直观高效

所有设备参数集中在 Excel 表格中管理。过滤、排序、批量修改——用你最熟悉的工具完成最繁琐的工作。

</td>
</tr>
<tr>
<td width="50%">

### 专业级编辑体验

集成 Monaco Editor（VS Code 同款内核），支持 Jinja2 语法高亮、多标签页、分屏编辑、快捷键操作。就像在 IDE 里写配置。

</td>
<td width="50%">

### 端到端工作流

从模板编写、参数录入、配置渲染，到标签打印——一个工具覆盖完整链路，告别多工具切换。

</td>
</tr>
</table>

---

## 工作流程

```
  Excel 参数表                 Jinja2 模板
  ┌──────────────┐           ┌──────────────┐
  │ hostname     │           │ interface {{ │
  │ ipaddress    │           │   if_name }} │
  │ vlan_id      │           │  vlan {{     │
  │ description  │           │   vlan_id }} │
  └──────┬───────┘           └──────┬───────┘
         │                          │
         └──────────┬───────────────┘
                    ▼
         ┌──────────────────┐
         │  MagicCommander   │
         │  Python 渲染引擎  │
         └────────┬─────────┘
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
   TXT 配置    YAML 中间    Word 标签
   output/     yaml/        output-label/
```

三步完成配置生成：

1. **创建项目** — 自动生成 `templates/`、`excel/`、`output/` 目录结构
2. **编辑模板和参数** — 用 Jinja2 语法写模板，用 Excel 填参数
3. **一键渲染** — 选中模板和参数文件，点击开始，批量生成

---

## 功能全景

| 模块 | 能力 |
|------|------|
| **项目管理** | 创建/删除/切换项目，自动生成目录骨架，收藏夹与最近项目记录 |
| **模板编辑器** | Monaco Editor 内核，Jinja2 语法高亮，多标签页，水平/垂直分屏 |
| **Excel 编辑器** | 内置表格查看与编辑，支持 `.xlsx` / `.xls`，单元格编辑自动标记脏状态 |
| **文件查看器** | 文本文件（`.txt` `.yaml` `.md` `.json` `.log`）、Word 文档、Excel 表格 |
| **配置渲染** | Jinja2 + Excel 批量生成，实时进度反馈，支持 `device_name` 和 `device_sn` 两种输出模式 |
| **标签生成** | 从配置生成设备标签 Word 文档，自定义纸张大小与标签尺寸，批量打印 |
| **主题切换** | 亮色 / 暗色主题，适配长时间工作场景 |
| **快捷键** | 12+ 快捷键覆盖高频操作，内置速查表（`Ctrl+K`） |

---

## 技术架构

```
┌────────────────────────────────────────────┐
│            Electron 桌面壳                  │
│  ┌──────────────────────────────────────┐  │
│  │         React 前端 (TypeScript)       │  │
│  │  Monaco Editor  │  TailwindCSS       │  │
│  │  Zustand 状态管理 │  xlsx 表格引擎    │  │
│  └──────────────┬───────────────────────┘  │
│                 │ IPC (contextBridge)       │
│  ┌──────────────▼───────────────────────┐  │
│  │     Electron 主进程 (安全隔离)        │  │
│  │  文件系统  │  进程管理  │  自动更新   │  │
│  └──────────────┬───────────────────────┘  │
│                 │ spawn                     │
│  ┌──────────────▼───────────────────────┐  │
│  │        Python 渲染引擎                │  │
│  │  pandas  │  Jinja2  │  openpyxl      │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

| 层级 | 技术选型 |
|------|---------|
| 桌面框架 | Electron 28 |
| 前端框架 | React 18 + TypeScript 5 |
| 构建工具 | Vite 5 |
| UI 样式 | TailwindCSS 3 |
| 状态管理 | Zustand 4（含 localStorage 持久化） |
| 代码编辑器 | Monaco Editor 4 |
| 后端语言 | Python 3.8+ |
| 模板引擎 | Jinja2 |
| 数据处理 | pandas + openpyxl |
| 打包分发 | electron-builder（NSIS 安装包） |

---

## 快速开始

### 环境要求

- **Node.js** >= 18.0.0
- **Python** >= 3.8
- **npm** >= 9.0.0

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/bangbang8000-cell/MagicCommander.git
cd MagicCommander

# 安装前端依赖
npm install

# 安装 Python 依赖（渲染功能必需）
cd backend
pip install -r requirements.txt
cd ..

# 启动开发模式
npm run dev:all

# 构建 Windows 安装包
npm run dist:win
```

---

## 项目结构

```
MagicCommander/
├── src/                     # React 前端
│   ├── components/          # 组件
│   │   ├── common/          # 通用组件（日志、Markdown 查看、项目浏览器）
│   │   ├── editor/          # 编辑器（Monaco、Excel、Word）
│   │   ├── layout/          # 布局（活动栏、标题栏、侧边栏、状态栏）
│   │   ├── sidebar/         # 侧边栏面板（资源管理器、搜索、工作台）
│   │   ├── terminal/        # 终端面板
│   │   └── ui/              # 基础 UI 组件（按钮、弹窗、右键菜单）
│   ├── stores/              # Zustand 状态管理（项目/编辑器/UI/渲染/日志）
│   ├── services/            # 业务服务层
│   ├── types/               # TypeScript 类型定义
│   └── hooks/               # 自定义 Hooks（快捷键、版本信息）
├── electron/                # Electron 主进程
│   ├── ipc/                 # IPC 处理器（文件/项目/渲染）
│   ├── services/            # 主进程服务（Python 进程管理、环境检测、自动更新）
│   └── utils/               # 工具函数（安全校验、日志、菜单）
├── backend/                 # Python 渲染引擎
│   ├── main.py              # 命令行入口
│   ├── base.py              # 数据解析 + Jinja2 渲染
│   ├── pre_processing.py    # 预处理核心逻辑
│   ├── ExcelToLabel.py      # 标签文档生成
│   └── requirements.txt     # Python 依赖
└── workspace/               # 示例工作区（模板、参数、输出）
```

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + B` | 切换侧边栏 |
| `Ctrl + J` | 切换底部面板 |
| `Ctrl + S` | 保存当前文件 |
| `Ctrl + W` | 关闭当前标签 |
| `Ctrl + Shift + T` | 重新打开最近关闭的标签 |
| `Ctrl + K` | 快捷键速查表 |
| `Ctrl + Shift + E` | 项目浏览器 |
| `Ctrl + Shift + F` | 全局搜索 |
| `Ctrl + Shift + R` | 工作台（渲染） |
| `Ctrl + Shift + O` | 输出面板 |
| `F5` | 刷新应用 |

---

## 常见问题

<details>
<summary><strong>渲染失败怎么办？</strong></summary>

请依次检查：
1. Python 是否已安装（`python --version`）
2. Python 依赖是否已安装（`pip install -r backend/requirements.txt`）
3. Excel 参数文件列名是否与模板变量一致
4. 模板 Jinja2 语法是否正确
</details>

<details>
<summary><strong>Excel 文件打不开？</strong></summary>

确保文件格式为 `.xlsx` 或 `.xls`，且未被其他程序（如 WPS、Office）占用。
</details>

<details>
<summary><strong>如何恢复之前的项目数据？</strong></summary>

项目状态通过 Zustand persist 持久化在浏览器 localStorage 中。如果在 `backend/` 目录下存在项目文件夹，应用会自动识别并加载。
</details>

---

## 开发

```bash
# 类型检查
npm run typecheck

# 运行测试
npm run test

# 监听模式
npm run test:watch

# 代码覆盖率
npm run test:coverage
```

编码规范：TypeScript 严格模式、函数式组件 + React Hooks、Zustand 状态管理、TailwindCSS utility-first 样式。

---

## 许可证

[MIT License](LICENSE)

---

<p align="center">
  <sub>Made with ❤️ by Magic Commander Team</sub>
</p>
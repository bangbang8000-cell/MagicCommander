# MagicCommander

> 网络设备配置管理工具 - 基于模板和参数批量生成网络设备配置

MagicCommander 是一款桌面应用程序，用于管理网络设备配置模板和参数，支持通过 Excel 参数表和 Jinja2 模板批量生成网络设备配置文件。

---

## 功能特性

### 📁 项目管理
- 创建、删除、切换项目
- 项目目录结构自动生成（templates / excel / output / yaml）
- 项目状态持久化保存

### 📝 模板编辑器
- 支持 Jinja2 模板语法（`.j2` 文件）
- 语法高亮和智能提示
- 代码编辑与实时预览

### 📊 Excel 管理
- Excel 文件查看和编辑
- 支持 `.xlsx`、`.xls` 格式
- 参数表管理（connection、hostname、ipaddress、parameter）

### 📄 文件查看器
- **文本编辑器**：支持 `.txt`、`.yaml`、`.yml`、`.md` 等格式
- **Word 查看器**：支持 `.docx` 文件只读查看
- **Excel 查看器**：支持表格数据查看和单元格编辑

### 🔧 配置渲染
- 基于 Jinja2 模板和 Excel 参数批量生成配置
- 生成 YAML 中间文件和 TXT 配置文件
- 支持渲染进度跟踪和日志查看

### 🖨️ 标签生成
- 从配置生成设备标签文档（Word 格式）
- 支持批量打印标签

### ⌨️ 快捷键支持
- `Ctrl+B` - 切换侧边栏
- `Ctrl+J` - 切换面板
- `Ctrl+S` - 保存文件
- `Ctrl+W` - 关闭标签
- `Ctrl+Shift+T` - 重新打开最近关闭的标签

---

## 技术栈

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | Electron | 28.x |
| 前端 | React | 18.x |
| 前端 | TypeScript | 5.x |
| 构建工具 | Vite | 5.x |
| 样式 | TailwindCSS | 3.x |
| 状态管理 | Zustand | 4.x |
| 代码编辑器 | Monaco Editor | 4.x |
| Excel 处理 | xlsx | 0.18.x |
| Word 解析 | mammoth | 1.x |
| 后端 | Python | 3.x |
| 模板引擎 | Jinja2 | - |

---

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- Python >= 3.8
- npm >= 9.0.0

### 安装依赖

```bash
# 安装前端依赖
npm install

# 安装 Python 依赖（可选，用于渲染功能）
cd backend
pip install -r requirements.txt
```

### 开发模式

```bash
# 方式一：同时启动前端和 Electron
npm run dev:all

# 方式二：分别启动
# 终端 1：启动 Vite 开发服务器
npm run dev

# 终端 2：启动 Electron
npm run dev:electron
```

### 构建生产版本

```bash
# 构建渲染器和主进程
npm run build

# 打包为安装包（Windows）
npm run dist:win

# 打包为安装包（通用）
npm run dist
```

---

## 项目结构

```
MagicCommander/
├── src/                    # React 前端源码
│   ├── components/         # 组件目录
│   │   ├── common/         # 通用组件
│   │   ├── editor/         # 编辑器组件（MonacoEditor、ExcelViewer、WordViewer）
│   │   ├── layout/         # 布局组件（Header、ActivityBar、Sidebar、StatusBar）
│   │   ├── panel/          # 面板组件
│   │   ├── sidebar/        # 侧边栏面板（Explorer、Search、Workbench 等）
│   │   ├── terminal/       # 终端组件
│   │   └── ui/             # UI 组件（Button、Modal、Toast 等）
│   ├── hooks/              # 自定义 Hooks
│   ├── services/           # 业务服务层
│   ├── stores/             # Zustand 状态管理
│   ├── styles/             # 全局样式
│   ├── types/              # TypeScript 类型定义
│   ├── App.tsx             # 应用主组件
│   └── main.tsx            # 入口文件
├── electron/               # Electron 主进程
│   ├── ipc/                # IPC 处理器
│   ├── services/           # 主进程服务
│   ├── utils/              # 工具函数
│   ├── main.ts             # 主进程入口
│   └── preload.ts          # 预加载脚本
├── backend/                # Python 后端脚本
│   ├── main.py             # 渲染主脚本
│   ├── ExcelToLabel.py     # Excel 转标签
│   ├── pre_processing.py   # 预处理脚本
│   └── requirements.txt    # Python 依赖
├── public/                 # 静态资源
├── dist/                   # 前端构建产物
├── dist-electron/          # Electron 构建产物
└── release/                # 安装包输出目录
```

---

## 使用指南

### 创建项目

1. 点击左侧活动栏的「项目浏览器」图标
2. 点击「新建项目」按钮
3. 输入项目名称并确认

项目创建后会自动生成以下目录结构：

```
backend/项目名/
├── templates/              # Jinja2 模板文件
├── excel/                  # Excel 参数文件
├── output/                 # 生成的配置文件
├── yaml/                   # 生成的 YAML 文件
└── output-label/           # 生成的标签文档
```

### 编辑模板

1. 在项目浏览器中展开 `templates` 目录
2. 点击 `.j2` 文件打开编辑器
3. 使用 Jinja2 语法编写模板

**模板示例（ASW.j2）**：

```jinja2
interface {{ interface_name }}
 description {{ description }}
 switchport mode access
 switchport access vlan {{ vlan_id }}
 no shutdown
```

### 管理参数

1. 在项目浏览器中展开 `excel` 目录
2. 点击 `.xlsx` 文件打开 Excel 查看器
3. 点击单元格进行编辑
4. 编辑完成后会自动标记为未保存状态

### 渲染配置

1. 点击左侧活动栏的「工作台」图标
2. 选择要渲染的模板和参数文件
3. 点击「开始渲染」按钮
4. 查看渲染进度和日志

渲染完成后，配置文件会输出到：
- `output/` - TXT 格式配置文件
- `yaml/` - YAML 格式中间文件
- `output-label/` - Word 格式标签文档

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+B` | 切换侧边栏显示 |
| `Ctrl+J` | 切换底部面板显示 |
| `Ctrl+S` | 保存当前文件 |
| `Ctrl+W` | 关闭当前标签 |
| `Ctrl+Shift+T` | 重新打开最近关闭的标签 |
| `Ctrl+Shift+E` | 切换到项目浏览器 |
| `Ctrl+Shift+F` | 切换到搜索面板 |
| `Ctrl+Shift+P` | 切换到配置面板 |
| `Ctrl+Shift+L` | 切换到标签面板 |
| `Ctrl+Shift+R` | 切换到工作台 |
| `Ctrl+Shift+O` | 切换到输出面板 |
| `F5` | 刷新应用 |

---

## 配置文件

### 应用配置

应用配置文件存储在用户数据目录下，包含：
- 项目状态（已打开项目、最近项目）
- 编辑器状态（打开的标签、活动标签）
- UI 状态（主题、侧边栏显示、面板显示）

### 项目配置

每个项目包含以下配置文件：
- `excel/connection.xlsx` - 设备连接参数
- `excel/hostname.xlsx` - 主机名参数
- `excel/ipaddress.xlsx` - IP 地址参数
- `excel/parameter.xlsx` - 自定义参数

---

## 常见问题

### Q: 应用启动后无法加载项目？

A: 请确保 `backend` 目录存在且包含项目文件夹。首次启动时需要至少创建一个项目。

### Q: Excel 文件无法打开？

A: 请确保文件格式为 `.xlsx` 或 `.xls`，且文件未被其他程序占用。

### Q: 渲染失败？

A: 请检查：
1. Python 是否已安装且配置正确
2. Python 依赖是否已安装（`pip install -r requirements.txt`）
3. Excel 参数文件格式是否正确
4. 模板语法是否有误

### Q: 如何恢复备份？

A: 将 `backup-xxx` 目录下的内容复制回项目根目录，并执行 `npm install` 安装依赖。

---

## 开发指南

### 目录规范

```
src/
├── components/             # 组件（首字母大写的 PascalCase）
├── hooks/                  # 自定义 Hooks（use 前缀）
├── services/               # 服务层（业务逻辑）
├── stores/                 # 状态管理（Zustand stores）
├── types/                  # 类型定义（TypeScript interfaces）
└── styles/                 # 全局样式
```

### 编码规范

- 使用 TypeScript，所有组件和函数必须有类型定义
- 组件使用函数式组件和 React Hooks
- 状态管理使用 Zustand，避免全局状态滥用
- 样式使用 TailwindCSS，优先使用 utility classes
- 代码格式化使用 Prettier

### 测试

```bash
# 运行所有测试
npm run test

# 运行测试并监听变化
npm run test:watch

# 生成测试覆盖率报告
npm run test:coverage
```

---

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## 版本历史

| 版本 | 日期 | 描述 |
|------|------|------|
| 2.1.0 | 2026-06-22 | 修复文件显示问题，优化布局 |
| 2.0.0 | - | 重构为 Electron + React 架构 |

# MagicCommander

**批量生成网络设备配置 | Network Device Configuration Automation**

[![Version](https://img.shields.io/badge/version-2.9.2-blue)](https://github.com/bangbang8000-cell/MagicCommander)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Windows](https://img.shields.io/badge/Windows-NSIS-blue)](https://github.com/bangbang8000-cell/MagicCommander/releases)
[![macOS](https://img.shields.io/badge/macOS-DMG-silver)](https://github.com/bangbang8000-cell/MagicCommander/releases)
[![Linux](https://img.shields.io/badge/Linux-AppImage%20%7C%20deb-orange)](https://github.com/bangbang8000-cell/MagicCommander/releases)
[![Languages](https://img.shields.io/badge/languages-12-orange)](https://github.com/bangbang8000-cell/MagicCommander)

---

## 下载

| 平台 | 安装包 | 说明 |
|------|--------|------|
| 🪟 Windows | [MagicCommander-Setup-2.9.1.exe](https://github.com/bangbang8000-cell/MagicCommander/releases) | NSIS 安装向导，支持自定义安装路径 |
| 🍎 macOS (Intel) | [MagicCommander-2.9.1-mac-x64.dmg](https://github.com/bangbang8000-cell/MagicCommander/releases) | DMG 安装包，拖拽到 Applications 即可 |
| 🍎 macOS (Apple Silicon) | [MagicCommander-2.9.1-mac-arm64.dmg](https://github.com/bangbang8000-cell/MagicCommander/releases) | DMG 安装包，Apple M 系列芯片原生支持 |
| 🐧 Linux (AppImage) | [MagicCommander-2.9.1-linux-x86_64.AppImage](https://github.com/bangbang8000-cell/MagicCommander/releases) | 下载后 `chmod +x` 赋予执行权限，双击运行 |
| 🐧 Linux (deb) | [MagicCommander-2.9.1-linux-amd64.deb](https://github.com/bangbang8000-cell/MagicCommander/releases) | 通过 `sudo dpkg -i` 或包管理器安装 |

> 所有平台均需安装 Python 3.8+。安装包下载请访问 [GitHub Releases](https://github.com/bangbang8000-cell/MagicCommander/releases) 页面。

---

## 你还在手动配置每一台交换机吗？

运维团队管理着 50 台、200 台甚至 500 台网络设备。每次上新设备、变更 VLAN、调整接口描述，都要逐台登录、逐行敲命令。配置格式不统一，参数容易写错，一个项目下来，光配置交换机就要花掉一整天。

设备标签呢？手写、贴纸、Excel 打印……标签丢失、信息不全、格式混乱，运维交接时面对一堆"无名设备"无从下手。

**MagicCommander 就是为解决这个问题而生的。**

---

## 三步完成批量配置，从一天到一分钟

MagicCommander 将你的网络设备参数（Excel 表格）和设备配置模板（Jinja2 语法）结合起来，一键生成所有设备的标准化配置文件，同时自动生成可打印的设备标签。

![MagicCommander 主界面](snapshot/软件说明0.png)

**工作原理**：你在 Excel 里维护设备参数（主机名、IP 地址、VLAN ID、接口描述等），用 Jinja2 模板定义配置格式，MagicCommander 自动完成拼接和渲染，输出可直接使用的设备配置文件。

![MagicCommander 标签生成](snapshot/软件说明1.png)

---

## 为什么选择 MagicCommander

### 模板一次编写，永久复用

用 Jinja2 语法编写一次配置模板，后续所有项目、所有设备都基于同一套模板生成配置。模板改了，重新渲染即可，不必逐台修改。

```jinja2
interface {{ interface_name }}
 description {{ description }}
 switchport mode access
 switchport access vlan {{ vlan_id }}
 no shutdown
```

### Excel 管理参数，所见即所得

设备参数天然适合用表格管理。MagicCommander 内建 Excel 编辑器，直接在软件里编辑 connection、hostname、ipaddress、parameter 等参数表，无需来回切换工具。

### 一键批量渲染，可追踪进度

选好模板和参数，点击渲染，MagicCommander 逐项目生成配置文件和 YAML 中间文件。渲染进度实时可见，日志清晰记录每一步处理结果。

### 设备标签自动生成，直接打印

从 hostname 表格自动提取设备名、SN、型号、机柜位置、管理 IP 等信息，生成 Word 格式的标签文档，支持 A4/A5 纸张、横纵向打印、自定义每页标签数量。

### 12 种语言，全球团队可用

MagicCommander 支持简体中文、English、日本語、한국어、Français、Deutsch、Español、Português、Русский、العربية（含从右到左布局）、Tiếng Việt、ไทย 共 12 种语言，多语言运维团队无缝协作。

### 离线桌面应用，数据安全可控

MagicCommander 是本地桌面软件（Electron + React + TypeScript），所有数据存放在你的电脑上，无需联网，不上传云端，企业数据安全有保障。

### 专业 Jinja2 编辑器

内建 Monaco Editor（VS Code 同款编辑器），支持 Jinja2 语法高亮、代码补全、多标签页管理，模板编写体验不输专业 IDE。

---

## 三分钟上手

### 1. 安装

从 [GitHub Releases](https://github.com/bangbang8000-cell/MagicCommander/releases) 下载对应平台的安装包，双击运行安装向导即可。请确保你的电脑已安装 Python 3.8+。

如果想从源码运行：

```bash
git clone https://github.com/bangbang8000-cell/MagicCommander.git
cd MagicCommander
npm install
npm run dev:all
```

### 2. 创建项目

打开 MagicCommander，点击左侧活动栏的项目浏览器图标，新建一个项目。项目会自动生成 `templates / excel / output / yaml` 四个目录。

### 3. 编写模板 + 填写参数 + 一键渲染

在 `templates` 目录下创建 `.j2` 模板文件，在 `excel` 目录下填写设备参数，切换到工作台面板，点击"开始渲染"——配置文件即刻生成到 `output` 目录。

---

## 项目结构

```
项目名称/
├── templates/       # Jinja2 模板 (.j2)
├── excel/           # 设备参数表 (.xlsx)
├── output/          # 生成的配置文件 (.txt)
├── yaml/            # 生成的 YAML 中间文件
└── output-label/    # 生成的设备标签文档 (.docx)
```

---

## 技术栈

Electron 28 · React 18 · TypeScript 5 · Vite 5 · TailwindCSS 3 · Zustand 4 · Monaco Editor 4 · Python 3 · Jinja2

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+J` | 切换底部面板 |
| `Ctrl+S` | 保存当前文件 |
| `Ctrl+W` | 关闭当前标签页 |
| `Ctrl+Shift+T` | 重新打开最近关闭的标签 |
| `Ctrl+Shift+E` | 切换到项目浏览器 |
| `Ctrl+Shift+F` | 切换到搜索面板 |
| `Ctrl+Shift+R` | 切换到工作台 |

---

## 常见问题

**Q: 渲染失败怎么办？**

检查 Python 是否已安装（`python --version`），确认已执行 `pip install -r backend/requirements.txt` 安装依赖，再检查 Excel 参数表格式和模板语法是否正确。

**Q: Excel 文件打不开？**

确认文件格式为 `.xlsx` 或 `.xls`，且未被其他程序（如 Microsoft Excel）占用。

**Q: 如何恢复项目数据？**

所有项目数据存储在本地 `backend/` 目录下，备份该目录即可。删除项目前会有二次确认弹窗，避免误操作。

---

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| 2.9.2 | 2026-07-01 | 跨平台编译支持：Windows (NSIS) / macOS (DMG x64+arm64) / Linux (AppImage+deb) |
| 2.9.1 | 2026-07-01 | 多语言国际化支持（12 种语言）、RTL 布局支持、UI 优化 |
| 2.1.0 | 2026-06-22 | 修复文件显示问题，优化布局 |
| 2.0.0 | - | 重构为 Electron + React 架构 |

---

## 参与贡献

欢迎提交 Issue 和 Pull Request。如有功能建议或问题反馈，请在 GitHub Issues 中提出。

**搜索引擎关键词**：网络设备配置批量生成、交换机配置自动生成、Jinja2 网络配置工具、网络运维自动化、设备标签打印、批量生成设备配置

---

## 许可证

[MIT License](LICENSE)
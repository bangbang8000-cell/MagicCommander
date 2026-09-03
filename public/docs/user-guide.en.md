# MagicCommander User Guide

> Applies to MagicCommander v3.6.0

## Introduction

MagicCommander is a professional network device configuration management tool. It combines device parameters (Excel spreadsheets) with configuration templates (Jinja2 syntax) to batch-generate standardized device configuration files in one click, and automatically produces printable device labels. It supports AI-powered conversational operations and cloud collaboration, while running fully offline with data security under your control.

---

## Quick Start

### 1. Create a Project

1. Click the **Explorer** icon in the left activity bar (`Ctrl+Shift+E`)
2. Click **New Project** and enter a project name
3. The project is auto-created with `templates / excel / output / yaml` directories
4. Beginners: use the **Template Center** to create from a built-in sample template

### 2. Fill in Device Parameters

1. In the explorer, expand the `excel` directory and open `hostname.xlsx` (built-in Excel editor)
2. Fill in device name, role, management IP, interfaces, VLANs, etc.
3. Use `para.xlsx` to declare which Excel sheets the pipeline should read and how
4. Save (`Ctrl+S`)

### 3. Write a Configuration Template

1. Create a `.j2` file under `templates`
2. Reference parameters with Jinja2: `{{ info['field_name'] }}`
3. **Smart completion**: type `info['` to get field suggestions extracted from your project's Excel sheets; control blocks (if/for) and filters are also completed
4. The editor (Monaco) supports syntax highlighting and multi-tab switching without losing undo history

### 4. Render Configuration

1. Switch to the **Workbench** panel (`Ctrl+Shift+W`)
2. Select projects and choose output format (config / YAML, with or without SN)
3. Click **Start Render** — progress is shown live
4. Output files land in `output/` (or `yaml/`); browse them in the **Output** panel (`Ctrl+Shift+O`)

> 💡 **Render cache**: when parameters and templates are unchanged, re-rendering reuses the previous result in seconds. It invalidates automatically when any input changes.

---

## Interface Overview

### Activity Bar (left icons, top to bottom)

| # | Function | Description | Shortcut |
|---|----------|-------------|----------|
| 1 | Search | Search by filename/content, single or all projects | `Ctrl+Shift+F` |
| 2 | Cloud | Cloud Connect collaboration (template market / sync) | `Ctrl+Shift+C` |
| 3 | AI Chat | AI assistant | `Ctrl+Shift+H` |
| 4 | Explorer | Projects, file tree, template center | `Ctrl+Shift+E` |
| 5 | Workbench | Render, labels, dry-run, validation | `Ctrl+Shift+W` |
| 6 | Output | Browse rendered outputs, batch export | `Ctrl+Shift+O` |
| 7 | Settings | App / AI / Platform / Advanced | `Ctrl+,` |

### Menu Bar

- **File**: new project, open project dir, save as template, exit
- **Edit**: undo, redo, copy, paste
- **View**: toggle sidebar/bottom panel, theme (light/dark/system)
- **Tools**: check updates, terminal, log viewer
- **Help**: user guide, shortcut list, about

---

## Core Features

### Project Management

- Create / open / delete projects (delete requires confirmation)
- Create from template (Template Center)
- Save a project as a reusable template
- Open project directory in file manager
- Render output is undoable (last 5 backups auto-kept)

### Template Center

1. Open the template center tab inside **Explorer**
2. Each template shows a **quality badge (A/B/C/D)**
   - Scored automatically from variable complexity, Excel data quality, and cross-references
   - Hover for the score
3. Click **Create Project from Template** to generate a standard project
4. Save any project as a template for your team

### Sample Projects (AIDC)

MagicCommander ships with 4 AIDC (AI Data Center) sample projects covering 64 / 128-node H100 clusters over two fabric options — **IB (InfiniBand)** and **RoCE (RoCEv2)** — each with an integrated four-network design (business & management / fabric / storage / out-of-band):

| Sample | Scale | Fabric | Convergence | Devices |
|--------|-------|--------|-------------|---------|
| 64H100-IB | 64× H100 | InfiniBand (NVIDIA Quantum) | 1:1 | 22 |
| 64H100-RoCE | 64× H100 | RoCEv2 (H3C S9827) | 3:1 | 22 |
| 128H100-IB | 128× H100 | InfiniBand (NVIDIA Quantum) | 1:1 | 24 |
| 128H100-RoCE | 128× H100 | RoCEv2 (H3C S9827) | 3:1 | 24 |

- **IB vs RoCE**: IB uses NVIDIA Quantum lossless switches for a dedicated compute fabric at 1:1 convergence, ideal for low-latency, high-throughput HPC/AI training; RoCE runs over Ethernet (H3C S9827 etc.) with PFC/CNP lossless queues at 3:1 convergence, balancing cost and versatility
- Each sample ships 8 role templates (SPINE / LEAF / STO_SPINE / STO_LEAF / BIZ_AGG / BIZ_ACCESS / OOB_AGG / OOB_ACCESS), a full excel four-table set, and global parameters (PFC/CNP queues, BGP, IP segments, naming)
- Pick a sample in the **Template Center** → **Create Project from Template** to spawn an independent copy, then render, dry-run, or export/import it as a project package

> 💡 The sample assets also validate the "AL planning → MC rendering" loop: a plan:table exported from the AL side is imported to produce this project structure, which can be opened, rendered, exported, and re-imported.

### Parameters (Excel Editor)

Supported formats:
- `.xlsx` (Excel 2007+) / `.xls` (Excel 97-2003)

The built-in Excel editor supports multi-sheet switching, inline cell editing, row add/remove, and saving back to the project. The `project_para` sheet in `para.xlsx` declares the workbook/sheet mapping used by the render pipeline.

### Template Rendering

Example template:

```jinja2
sysname {{ info['device_name'] }}
#
interface {{ info['gateway_interface'] }}
 description {{ info['remark'] }}
 ip address {{ info['gateway_ip'] }} {{ info['gateway_mask'] }}
#
{% if info['ssh_enabled'] == 'yes' %}
ssh server enable
{% endif %}
```

Supported syntax:
- `{{ info['field'] }}` - variable reference
- `{% for ... %}...{% endfor %}` - loops
- `{% if ... %}...{% endif %}` - conditionals
- Filters: `| default`, `| length`, `| join`, etc.

### Dry-Run & Validation

- **Dry-run**: preview rendered config without writing files
- **Template validation**: parse all `.j2` files to catch syntax errors early
- **Excel validation**: check missing files, empty sheets, and column issues
- **Diff compare**: one-click diff between dry-run results and existing outputs (green=new, red=removed)

### Output Types

| Type | Directory | Description |
|------|-----------|-------------|
| Config | `output/<timestamp>/` | Standard config files (.txt) |
| SN config | `output-sn/<timestamp>/` | SN-named files (.cfg) |
| YAML | `yaml/<timestamp>/` | YAML intermediate data |
| YAML+SN | `yaml-sn/<timestamp>/` | SN-named YAML |

### Search & Filter

- Search **by filename** or **by content**
- **All projects** toggle: cross-project full-text search (results prefixed with project name)
- File type filters: template / excel / output / text / YAML / markdown
- Results open directly in the editor

### Label Printing

Auto-generate device labels from the hostname table:

1. In the **Workbench** label tab, select projects
2. Click **Generate Labels** to produce Markdown (`output-label-md/`) and Word (`output-label/`) formats
3. Export to Word (.docx) or PDF, preview in-app
4. Customize A4/A5 paper, orientation, and labels per page

---

## AI Assistant

MagicCommander ships with an AI Hub for conversational project management, rendering, and analysis.

### Configure AI

1. Open **Settings** (`Ctrl+,`) → **AI** tab
2. Choose a provider: DeepSeek / OpenAI / Claude / Gemini / Qwen / GLM / Grok / Ollama / custom
3. Enter API key and base URL (**Ollama needs no key**)
4. Click **Test Connection**; use **Fetch Models** to pick a model
5. Advanced settings control AI Hub port and auto-start

### Smart Routing

When enabled, the optimal model is chosen by task type:
- **Coding tasks** (create project, render) → coding-oriented model
- **Analysis tasks** (template quality) → analysis-oriented model
- **Q&A tasks** (help, guide) → Q&A-oriented model
- **Reasoning tasks** (optimization advice) → reasoning-oriented model

### Use the AI Chat

1. Click **AI Chat** in the activity bar (`Ctrl+Shift+H`)
2. AI Hub starts automatically (first start installs dependencies, ~30s)
3. Type natural language, e.g.:
   - "List all projects"
   - "Render the test1 project"
   - "Analyze template quality of test1"
   - "Clear the render output of test1"
   - "Reverse-engineer a template from this config"
4. AI invokes built-in tools and shows progress live

### Tool Permission Levels

AI tools are gated by risk:

| Level | Behavior | Examples |
|-------|----------|----------|
| Auto | Executes directly | list projects, analyze, validate, dry-run |
| Notify | Executes then notifies | create project, write files, generate labels |
| Confirm | Requires your reply "confirm" | delete project, render config |

### Project Analysis

AI assesses project quality: template complexity (variable count, nesting depth), Excel data quality (empty rows, duplicate columns, type issues), and template↔Excel cross-references (missing/unused columns), then suggests improvements.

---

## Cloud Connect

Connect a self-hosted MagicCommander Platform for team collaboration.

### Connect

1. **Settings** → **Platform** tab
2. Enter the server URL (e.g. `http://evergreenzhou.com`)
3. Click **Test Connection**
4. Click the cloud icon in the activity bar to log in

### Features

| Feature | Description |
|---------|-------------|
| QR login | Feishu / QQ / WeChat scan, JWT auto-refresh |
| Template market | Browse/search/install cloud templates, category filter |
| Project sync | Push / Pull / conflict detection |
| Notifications | Platform announcements and version updates |
| Profile | User info and account binding |

---

## Shortcuts

| Shortcut | Function |
|----------|----------|
| `Ctrl+Shift+F` | Search |
| `Ctrl+Shift+E` | Explorer |
| `Ctrl+Shift+W` | Workbench |
| `Ctrl+Shift+O` | Output |
| `Ctrl+Shift+H` | AI Chat |
| `Ctrl+Shift+C` | Cloud |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+J` | Toggle bottom panel |
| `Ctrl+S` | Save file |
| `Ctrl+W` | Close tab |
| `Ctrl+Shift+T` | Reopen closed tab |
| `Ctrl+,` | Settings |
| `Ctrl+K Ctrl+S` | Shortcut list |

---

## FAQ

**Q: How do I import device parameters?**
Edit the `.xlsx` files in `excel/` (built-in editor) and declare the mapping in `para.xlsx`.

**Q: Where do templates go?**
In the project's `templates` folder, with a `.j2` extension.

**Q: Where are outputs?**
In the **Output** panel, under `output`, `output-sn`, `yaml`, `yaml-sn` directories (timestamped).

**Q: How do I configure the AI assistant?**
Settings → AI tab → choose provider → enter API key → test connection. Ollama needs no key.

**Q: AI Hub fails to start?**
The Windows build embeds Python. From source, ensure Python 3.8+ and `pip install -r backend/requirements.txt`.

**Q: Which AI models are supported?**
DeepSeek, OpenAI, Claude, Gemini, Qwen, GLM, Grok, local Ollama, and any OpenAI-compatible custom provider.

**Q: Where is my data?**
All project data lives in the local `workspace/` directory. AI runs locally; API keys are stored encrypted.

---

## Support

For issues, please check [GitHub Issues](https://github.com/bangbang8000-cell/MagicCommander/issues).

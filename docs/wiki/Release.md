# MagicCommander -- Official Release

**Release Date:** July 7, 2026  
**Download:** [GitHub Releases](https://github.com/bangbang8000-cell/MagicCommander/releases/latest)  
**License:** [MIT](https://github.com/bangbang8000-cell/MagicCommander/blob/main/LICENSE)

## What is MagicCommander?

MagicCommander (MC) is a **cross-platform desktop application** designed for network engineers and IT operations teams to **batch-generate network device configurations**. If you manage 50, 200, or even 500 switches, routers, and firewalls, MagicCommander eliminates the tedious manual configuration process and replaces it with a streamlined, template-driven workflow.

**How it works:** You maintain device parameters in Excel spreadsheets (hostname, IP address, VLAN ID, interface description, etc.), define configuration templates using Jinja2 syntax, and MagicCommander automatically renders standardized configuration files for every device with a single click.

## Key Features

### Template-Driven Rendering

Write your network device configurations once as **Jinja2 templates**, then render them in bulk with different parameters for each device:

- Variables, loops, conditionals, and filters
- Template inheritance and includes
- Custom Jinja2 filters and extensions
- Write once, reuse forever across all projects and devices

```jinja2
interface {{ interface_name }}
 description {{ description }}
 switchport mode access
 switchport access vlan {{ vlan_id }}
 no shutdown
```

### Built-in Excel Editor

Device parameters naturally fit in spreadsheets. MagicCommander includes a **built-in Excel editor** so you can manage connection, hostname, IP address, and custom parameter tables directly inside the application -- no switching between tools.

### One-Click Batch Rendering

Select your template and parameter file, click render, and MagicCommander generates configuration files and YAML intermediate files for every device:

- Real-time progress tracking
- Detailed render logs for each device
- YAML intermediate files for debugging

### Automatic Device Label Generation

Extract device name, serial number, model, rack position, management IP, and more from your Excel data, then generate **Word-format label documents** ready for printing:

- A4 / A5 paper sizes
- Horizontal / vertical orientation
- Customizable labels per page

### Multi-Language Internationalization

MagicCommander supports **13 languages** out of the box, enabling seamless collaboration for global operations teams:

- Simplified Chinese, **Traditional Chinese**, English, Japanese, Korean
- French, German, Spanish, Portuguese
- Russian, Arabic (with RTL layout), Vietnamese, Thai

### Offline Desktop Application

All data stays on your local machine. MagicCommander is built with Electron + React + TypeScript, runs entirely offline, and never uploads your data to any cloud service. Your enterprise network configurations remain secure and under your full control.

### Professional Jinja2 Editor

The built-in code editor is powered by **Monaco Editor** (the same engine behind VS Code):

- Jinja2 syntax highlighting
- Code completion and suggestions
- Multi-tab editing
- Professional IDE-level editing experience

### Terminal & Command System

Built-in terminal panel with a command-line interface for power users:

- Type `help` to see all available commands
- `list` / `ls` to list projects
- `select <project>` to switch active project
- `render` to trigger configuration rendering
- `theme <dark|light>` to switch appearance

## Install and Run

1. **Download** the latest version from [GitHub Releases](https://github.com/bangbang8000-cell/MagicCommander/releases/latest)

2. **Install** for your platform -- embedded Python runtime is included, no separate Python installation needed

3. **Create a project** -- MagicCommander generates `templates/`, `excel/`, `output/`, `yaml/`, and `output-label/` directories

4. **Write Jinja2 templates** in the `templates/` directory

5. **Fill in device parameters** in the `excel/` directory

6. **Click "Render"** -- configuration files are generated to `output/`

7. **Generate labels** (optional) -- Word documents are created in `output-label/`

### Supported Platforms

| Platform | Format | File Pattern |
|---|---|---|
| Windows | NSIS Installer | `MagicCommander-Setup-*.exe` |
| macOS (Apple Silicon) | ZIP | `MagicCommander-*-mac-arm64.zip` |
| macOS (Intel) | ZIP | `MagicCommander-*-mac-x64.zip` |
| Linux | AppImage | `MagicCommander-*-linux-x86_64.AppImage` |
| Linux | deb | `MagicCommander-*-linux-amd64.deb` |

## Project Structure

```
Project/
├── templates/       # Jinja2 templates (.j2)
├── excel/           # Device parameter tables (.xlsx)
├── output/          # Generated configuration files (.txt)
├── yaml/            # Generated YAML intermediate files
└── output-label/    # Generated device label documents (.docx)
```

## Technology Stack

| Component | Technology |
|---|---|
| Desktop Framework | Electron 28 |
| Frontend | React 18 + TypeScript 5 + Vite 5 |
| UI Styling | TailwindCSS 3 |
| State Management | Zustand 4 |
| Code Editor | Monaco Editor 4 |
| Template Engine | Python 3 + Jinja2 |
| CI/CD | GitHub Actions |

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+J` | Toggle bottom panel |
| `Ctrl+S` | Save current file |
| `Ctrl+W` | Close current tab |
| `Ctrl+Shift+T` | Reopen recently closed tab |
| `Ctrl+Shift+E` | Switch to project explorer |
| `Ctrl+Shift+F` | Switch to search panel |
| `Ctrl+Shift+R` | Switch to workspace |

## Recent Highlights

| Version | Date | Highlights |
|---|---|---|
| **Latest** | 2026-07 | Full i18n coverage (Resource Explorer, Label Print, Render panels), Terminal command help with live language switching, Traditional Chinese (zh-TW) support |
| 2.9.5 | 2026-07-02 | Workspace migration to user data dir, full-platform Python embedding, macOS ZIP packaging, context menu i18n |
| 2.9.3 | 2026-07-01 | Embedded Python (Windows), workspace examples, cross-platform CI/CD |
| 2.9.2 | 2026-07-01 | Cross-platform build support (Windows / macOS / Linux) |
| 2.9.1 | 2026-07-01 | 13-language internationalization, RTL layout, UI optimization |
| 2.0.0 | -- | Complete rewrite with Electron + React architecture |

## Contributing

Issues and Pull Requests are welcome. Please submit feature requests or bug reports through [GitHub Issues](https://github.com/bangbang8000-cell/MagicCommander/issues).

MagicCommander is released under the [MIT License](https://github.com/bangbang8000-cell/MagicCommander/blob/main/LICENSE).

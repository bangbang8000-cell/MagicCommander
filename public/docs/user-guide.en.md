# MagicCommander User Guide

## Introduction

MagicCommander is a professional network device configuration management tool that helps you efficiently manage network device configuration files. It supports Excel parameter import, Jinja2 template rendering, batch configuration output, and more.

---

## Quick Start

### 1. Create a New Project

1. Click **File → New Project** in the menu
2. Enter a project name
3. Click Confirm to create

### 2. Configure Parameters

1. Open the `para.xlsx` file in the project explorer
2. Fill in device parameter information (name, IP, port, etc.)
3. Save the file

### 3. Create Templates

1. Create Jinja2 template files in the `templates` folder
2. Use `{{variable_name}}` syntax to reference parameters

### 4. Execute Rendering

1. Switch to the **Rendering Operations** panel
2. Select the project to render
3. Configure output format (Config/YAML, include SN or not)
4. Click **Execute Rendering**

---

## Interface Overview

### Activity Bar (Left Icons)

| Icon | Function | Shortcut |
|------|----------|----------|
| Search | Global Search | Ctrl+Shift+F |
| Explorer | Project File Browser | Ctrl+Shift+E |
| Render Operations | Execute Rendering Tasks | Ctrl+Shift+R |
| Label Print | Batch Print Labels | Ctrl+Shift+L |
| Output Results | View Rendering Output | Ctrl+Shift+O |

### Menu Bar

- **File** - Project management, refresh
- **View** - Toggle panels, theme switch
- **Help** - User Guide, About

---

## Core Features

### Project Management

- Create new projects
- Create from template (Template Center)
- Open/delete projects
- Open project directory in file manager
- Save project as template

### Template Center

The Template Center provides built-in example templates to help you quickly start projects:

1. Click the activity bar to switch to **Template Center**
2. Browse available templates (e.g. ASW/PSW/DOA switch configuration templates)
3. Click "Create Project from Template" and enter a project name
4. The system automatically generates the standard directory structure (templates / excel / output / yaml)

You can also save existing projects as templates for team reuse:
- Right-click a project → **Save as Template**

### Parameter Configuration

Supported Excel file formats:
- `.xlsx` - Excel 2007+ format
- `.xls` - Excel 97-2003 format

### Template Rendering

Template syntax example:

```jinja2
# Device Configuration Template
system-view
device-name {{device_name}}
ip address {{ip_address}} {{subnet_mask}}
port {{port}}
```

Supported variables:
- `{{variable_name}}` - Simple variable
- `{% for item in list %}...{% endfor %}` - Loop
- `{% if condition %}...{% endif %}` - Conditional

### Dry-Run Preview

Preview generated results before actual rendering:

1. In the **Workbench** panel, click the **eye icon** next to a project
2. The system renders templates without writing files, showing the configuration content for each device in real-time
3. After confirming, click **Start Rendering** for actual output

### Template & Data Validation

Check template and data quality before rendering:

- **Jinja2 Template Validation**: Click the **Validate Template** button in the Workbench. The system parses all `.j2` template files to detect syntax errors early
- **Excel Data Validation**: Click **Validate Parameters** to check Excel file existence, empty sheets, and column naming
- Results are color-coded: green (pass) / yellow (warning) / red (error)

### Diff Comparison

Compare dry-run results with existing output files:

1. After running dry-run, expand device entries in the results
2. Click the **Diff** button
3. The system displays differences in unified diff format (green=added, red=deleted)

### Output Types

| Type | Description |
|------|-------------|
| Config Output | Standard configuration file |
| SN Config | Configuration with serial number |
| YAML Output | YAML format configuration |
| YAML+SN | YAML format with serial number |

### Search & Filtering

- **Global Search** (Ctrl+Shift+F): Search project files by name and content
- **File Type Filtering**: Filter by output files (.txt/.cfg), text files (.csv/.json/.html/.py/.log), etc.
- Search results support click-to-navigate to file editing

### Label Printing

Automatically generate device labels from parameter tables:

1. Switch to the **Label Print** panel
2. Select the project for label generation
3. Click **Generate Labels**, the system outputs:
   - Markdown format labels (`output-label-md/`)
   - Word format labels (`output-label/`)
4. Supports exporting to Word (.docx) and PDF formats

---

## Shortcuts

| Shortcut | Function |
|----------|----------|
| Ctrl+Shift+E | Open Project Explorer |
| Ctrl+Shift+F | Global Search |
| Ctrl+Shift+R | Open Rendering Operations |
| Ctrl+Shift+L | Open Label Print |
| Ctrl+Shift+O | Open Output Results |
| Ctrl+B | Toggle Sidebar |
| F5 | Refresh Page |

---

## FAQ

### Q: How to import device parameters?
A: Edit the `para.xlsx` file in the project root directory. Each row represents a device, and columns represent different parameters.

### Q: Where should template files be placed?
A: Template files should be placed in the `templates` folder of the project.

### Q: Where to view output files?
A: Rendered files are saved in `output`, `output-sn`, `yaml`, `yaml-sn` folders. You can view them in the Output Results panel.

---

## Technical Support

If you have any questions or suggestions, please contact the development team.

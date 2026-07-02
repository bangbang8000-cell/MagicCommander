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
- Open/delete projects
- Open project directory in file manager

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

### Output Types

| Type | Description |
|------|-------------|
| Config Output | Standard configuration file |
| SN Config | Configuration with serial number |
| YAML Output | YAML format configuration |
| YAML+SN | YAML format with serial number |

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

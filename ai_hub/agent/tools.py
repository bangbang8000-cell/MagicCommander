"""
Agent Tool 定义
将现有 Python CLI 功能包装为标准 Tool 接口，供 LLM 调用
"""
import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# 工具注册表
_tools: dict[str, dict] = {}


def register_tool(name: str, description: str, parameters: dict, handler: callable):
    """注册一个 Agent Tool"""
    _tools[name] = {
        "name": name,
        "description": description,
        "parameters": parameters,
        "handler": handler,
    }


def get_tool_definitions() -> list[dict]:
    """获取所有工具定义（JSON Schema 格式），供 LLM function calling 使用"""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            },
        }
        for t in _tools.values()
    ]


async def execute_tool(name: str, arguments: dict) -> dict:
    """执行指定工具"""
    tool = _tools.get(name)
    if not tool:
        return {"success": False, "error": f"未知工具: {name}"}
    try:
        result = await tool["handler"](arguments)
        return {"success": True, "result": result}
    except Exception as e:
        logger.error(f"Tool '{name}' execution failed: {e}")
        return {"success": False, "error": str(e)}


def _run_python_cli(args: list[str]) -> str:
    """运行 Python CLI 命令并返回输出"""
    workspace = _workspace_dir or ""
    backend_dir = _backend_dir or str(Path(__file__).parent.parent.parent / "backend")

    env = {}
    if workspace:
        env["MC_WORKSPACE"] = workspace

    try:
        result = subprocess.run(
            [sys.executable, str(Path(backend_dir) / "main.py")] + args,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=backend_dir,
            env={**__import__("os").environ, **env},
        )
        return result.stdout.strip() or result.stderr.strip()
    except subprocess.TimeoutExpired:
        return "命令执行超时"
    except Exception as e:
        return f"命令执行失败: {e}"


_workspace_dir = ""
_backend_dir = ""


def set_workspace_dir(path: str):
    global _workspace_dir
    _workspace_dir = path


def set_backend_dir(path: str):
    global _backend_dir
    _backend_dir = path


# ====== 注册所有工具 ======


async def _list_projects(args: dict) -> str:
    return _run_python_cli(["project", "list"])


async def _create_project(args: dict) -> str:
    project_name = args["projectName"]
    cmd = ["project", "create", project_name]
    if args.get("templateName"):
        cmd.extend(["--template", args["templateName"]])
    return _run_python_cli(cmd)


async def _render_config(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["render", "project", project_name])


async def _dry_run(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["render", "dry-run", project_name])


async def _validate_template(args: dict) -> str:
    template_name = args["templateName"]
    return _run_python_cli(["validate", "template", template_name])


async def _validate_excel(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["validate", "excel", project_name])


async def _diff_compare(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["diff", "compare", project_name])


async def _read_file(args: dict) -> str:
    project_name = args["projectName"]
    file_path = args["filePath"]
    return _run_python_cli(["file", "read", project_name, file_path])


async def _search_files(args: dict) -> str:
    query = args["query"]
    cmd = ["search", query]
    if args.get("projectName"):
        cmd.extend(["--project", args["projectName"]])
    return _run_python_cli(cmd)


async def _create_template(args: dict) -> str:
    source = args["sourceProject"]
    name = args["templateName"]
    return _run_python_cli(["template", "save", source, name])


async def _update_template(args: dict) -> str:
    name = args["templateName"]
    file_path = args["filePath"]
    content = args["content"]
    return _run_python_cli(["template", "update", name, file_path, content])


async def _create_project_intelligent(args: dict) -> str:
    """智能创建项目：根据设备类型和需求自动生成模板和参数表"""
    project_name = args["projectName"]
    device_type = args.get("deviceType", "switch")
    vendor = args.get("vendor", "huawei")
    config_description = args.get("configDescription", "")

    ws = _workspace_dir or "workspace"
    project_dir = Path(ws) / project_name

    if project_dir.exists():
        return json.dumps({
            "error": f"项目 '{project_name}' 已存在",
            "status": "exists",
        }, ensure_ascii=False)

    # 创建目录结构
    (project_dir / "templates").mkdir(parents=True, exist_ok=True)
    (project_dir / "excel").mkdir(parents=True, exist_ok=True)
    (project_dir / "output").mkdir(parents=True, exist_ok=True)
    (project_dir / "output-label").mkdir(parents=True, exist_ok=True)
    (project_dir / "yaml").mkdir(parents=True, exist_ok=True)

    # 生成 Jinja2 模板
    template_content = _generate_template(device_type, vendor, config_description)
    template_name = f"{device_type.upper()}.j2"
    template_path = project_dir / "templates" / template_name
    template_path.write_text(template_content, encoding="utf-8")

    # 生成 Excel 参数文件（使用 openpyxl 直接创建）
    _create_excel_from_template(project_dir, device_type, vendor)

    result = {
        "status": "created",
        "projectName": project_name,
        "structure": {
            "templates": [template_name],
            "directories": ["templates", "excel", "output", "output-label", "yaml"],
        },
        "templatePreview": template_content[:500],
        "message": f"项目 '{project_name}' 已创建，包含 {device_type} 类型的 {vendor} 配置模板。",
    }
    return json.dumps(result, ensure_ascii=False)


def _generate_template(device_type: str, vendor: str, description: str) -> str:
    """根据设备类型和厂商生成 Jinja2 模板"""
    vendor_upper = vendor.upper()

    templates = {
        ("switch", "huawei"): _TPL_HUAWEI_SWITCH,
        ("switch", "cisco"): _TPL_CISCO_SWITCH,
        ("router", "huawei"): _TPL_HUAWEI_ROUTER,
        ("router", "cisco"): _TPL_CISCO_ROUTER,
        ("firewall", "huawei"): _TPL_HUAWEI_FIREWALL,
        ("switch", "h3c"): _TPL_H3C_SWITCH,
    }

    tpl = templates.get((device_type, vendor.lower()))
    if not tpl:
        tpl = _TPL_GENERIC.format(
            device_type=device_type,
            vendor=vendor_upper,
            description=description or f"{vendor_upper} {device_type} 配置模板",
        )

    return tpl


def _create_excel_from_template(project_dir: Path, device_type: str, vendor: str):
    """使用 openpyxl 创建基础 Excel 参数文件"""
    try:
        import openpyxl
    except ImportError:
        logger.warning("openpyxl not available, skipping Excel creation")
        return

    excel_path = project_dir / "excel" / "parameter.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "主机表"

    # 根据设备类型定义列
    columns = {
        "switch": ["设备名", "管理IP", "掩码", "管理接口", "VLAN", "网关IP", "网关掩码", "网关接口",
                    "SNMP团体名", "SNMP地址", "NTP地址", "LOGHOST地址",
                    "AAA名称", "AAA地址", "NAS_IP", "AAA认证密钥",
                    "domain名称", "本地用户名", "本地用户密钥"],
        "router": ["设备名", "管理IP", "掩码", "管理接口", "路由协议", "AS号",
                    "SNMP团体名", "SNMP地址", "NTP地址", "LOGHOST地址",
                    "AAA名称", "AAA地址", "NAS_IP", "AAA认证密钥",
                    "本地用户名", "本地用户密钥"],
        "firewall": ["设备名", "管理IP", "掩码", "管理接口", "安全域", "策略名称",
                      "SNMP团体名", "SNMP地址", "NTP地址", "LOGHOST地址",
                      "AAA名称", "AAA地址", "本地用户名", "本地用户密钥"],
    }

    headers = columns.get(device_type, columns["switch"])
    for col, header in enumerate(headers, 1):
        ws.cell(row=1, column=col, value=header)

    # 添加示例行
    sample_row = [f"示例设备-{i}" for i in range(1, len(headers) + 1)]
    for col, val in enumerate(sample_row, 1):
        ws.cell(row=2, column=col, value=val)

    wb.save(str(excel_path))
    logger.info(f"Created Excel parameter file: {excel_path}")


# ====== 预置模板 ======

_TPL_HUAWEI_SWITCH = """{# Huawei Switch Template - 自动生成 #}
sysname {{ info['设备名'] }}

{# 管理接口 #}
interface {{ info.get('管理接口', 'M-GigabitEthernet0/0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}

{# VLAN 配置 #}
vlan {{ info.get('VLAN', '100') }}
 description Management_VLAN

interface {{ info.get('网关接口', 'Vlanif100') }}
 description gateway_ip_of_vlan_{{ info.get('VLAN', '100') }}
 ip address {{ info['网关IP'] }} {{ info['网关掩码'] }}

{# SNMP #}
snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}
snmp-agent sys-info version v2c
snmp-agent trap enable
snmp-agent target-host trap address udp-domain {{ info['SNMP地址'] }} params securityname {{ info['SNMP团体名'] }}

{# NTP #}
ntp-service enable
ntp-service unicast-server {{ info.get('NTP地址', 'ntp.example.com') }}

{# 日志 #}
info-center enable
info-center loghost {{ info['LOGHOST地址'] }}

{# AAA #}
hwtacacs scheme {{ info['AAA名称'] }}
 primary authentication {{ info['AAA地址'] }}
 primary authorization {{ info['AAA地址'] }}
 primary accounting {{ info['AAA地址'] }}
 key authentication simple {{ info['AAA认证密钥'] }}
 key authorization simple {{ info['AAA认证密钥'] }}
 key accounting simple {{ info['AAA认证密钥'] }}
 user-name-format without-domain
 nas-ip {{ info['NAS_IP'] }}

domain {{ info['domain名称'] }}
 authentication login hwtacacs-scheme {{ info['AAA名称'] }} local
 authorization login hwtacacs-scheme {{ info['AAA名称'] }} local
 accounting login hwtacacs-scheme {{ info['AAA名称'] }} local

domain default enable {{ info['domain名称'] }}

{# 本地用户 #}
local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
 authorization-attribute user-role network-admin

ssh server enable
line vty 0 63
 authentication-mode scheme
 user-role network-admin
"""

_TPL_CISCO_SWITCH = """{# Cisco Switch Template - 自动生成 #}
hostname {{ info['设备名'] }}

{# 管理接口 #}
interface {{ info.get('管理接口', 'GigabitEthernet0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}
 no shutdown

{# VLAN 配置 #}
vlan {{ info.get('VLAN', '100') }}
 name Management_VLAN

interface Vlan{{ info.get('VLAN', '100') }}
 description gateway_ip_of_vlan_{{ info.get('VLAN', '100') }}
 ip address {{ info['网关IP'] }} {{ info['网关掩码'] }}

{# SNMP #}
snmp-server community {{ info['SNMP团体名'] }} RO
snmp-server host {{ info['SNMP地址'] }} version 2c {{ info['SNMP团体名'] }}

{# NTP #}
ntp server {{ info.get('NTP地址', 'ntp.example.com') }}

{# 日志 #}
logging host {{ info['LOGHOST地址'] }}

{# AAA #}
aaa new-model
tacacs-server host {{ info['AAA地址'] }} key {{ info['AAA认证密钥'] }}
aaa authentication login default group tacacs+ local
aaa authorization exec default group tacacs+ local
aaa accounting exec default start-stop group tacacs+

{# 本地用户 #}
username {{ info['本地用户名'] }} privilege 15 secret {{ info['本地用户密钥'] }}

line vty 0 15
 login authentication default
 transport input ssh
"""

_TPL_HUAWEI_ROUTER = """{# Huawei Router Template - 自动生成 #}
sysname {{ info['设备名'] }}

{# 管理接口 #}
interface {{ info.get('管理接口', 'GigabitEthernet0/0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}

{# 路由协议 #}
{% if info.get('路由协议', 'OSPF') == 'OSPF' %}
ospf 1 router-id {{ info['管理IP'] }}
 area 0.0.0.0
{% elif info.get('路由协议') == 'BGP' %}
bgp {{ info.get('AS号', '65001') }}
 router-id {{ info['管理IP'] }}
{% endif %}

{# SNMP #}
snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}
snmp-agent sys-info version v2c

{# NTP #}
ntp-service enable
ntp-service unicast-server {{ info.get('NTP地址', 'ntp.example.com') }}

{# AAA #}
hwtacacs scheme {{ info['AAA名称'] }}
 primary authentication {{ info['AAA地址'] }}
 key authentication simple {{ info['AAA认证密钥'] }}
 nas-ip {{ info['NAS_IP'] }}

local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
 authorization-attribute user-role network-admin

ssh server enable
"""

_TPL_CISCO_ROUTER = """{# Cisco Router Template - 自动生成 #}
hostname {{ info['设备名'] }}

interface {{ info.get('管理接口', 'GigabitEthernet0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}
 no shutdown

{% if info.get('路由协议', 'OSPF') == 'OSPF' %}
router ospf 1
 router-id {{ info['管理IP'] }}
{% elif info.get('路由协议') == 'BGP' %}
router bgp {{ info.get('AS号', '65001') }}
 bgp router-id {{ info['管理IP'] }}
{% endif %}

snmp-server community {{ info['SNMP团体字'] }} RO
ntp server {{ info.get('NTP地址', 'ntp.example.com') }}

aaa new-model
tacacs-server host {{ info['AAA地址'] }} key {{ info['AAA认证密钥'] }}
username {{ info['本地用户名'] }} privilege 15 secret {{ info['本地用户密钥'] }}

line vty 0 15
 transport input ssh
"""

_TPL_HUAWEI_FIREWALL = """{# Huawei Firewall Template - 自动生成 #}
sysname {{ info['设备名'] }}

interface {{ info.get('管理接口', 'GigabitEthernet0/0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}

firewall zone {{ info.get('安全域', 'Trust') }}
 set priority 85
 add interface {{ info.get('管理接口', 'GigabitEthernet0/0/0') }}

security-policy
 rule name {{ info.get('策略名称', 'default-policy') }}

snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}

hwtacacs scheme {{ info['AAA名称'] }}
 primary authentication {{ info['AAA地址'] }}
 key authentication simple {{ info['AAA认证密钥'] }}

local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
"""

_TPL_H3C_SWITCH = """{# H3C Switch Template - 自动生成 #}
sysname {{ info['设备名'] }}

interface {{ info.get('管理接口', 'M-GigabitEthernet0/0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}

vlan {{ info.get('VLAN', '100') }}
 description Management

interface Vlan-interface{{ info.get('VLAN', '100') }}
 ip address {{ info['网关IP'] }} {{ info['网关掩码'] }}

snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}
snmp-agent sys-info version v2c

ntp-service enable
ntp-service unicast-server {{ info.get('NTP地址', 'ntp.example.com') }}

info-center enable
info-center loghost {{ info['LOGHOST地址'] }}

hwtacacs scheme {{ info['AAA名称'] }}
 primary authentication {{ info['AAA地址'] }}
 key authentication simple {{ info['AAA认证密钥'] }}
 nas-ip {{ info['NAS_IP'] }}

local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
 authorization-attribute user-role network-admin

ssh server enable
line vty 0 63
 authentication-mode scheme
"""

_TPL_GENERIC = """{# {vendor} {device_type} Template - 自动生成 #}
{description}

sysname {{ info['设备名'] }}

interface {{ info.get('管理接口', 'GigabitEthernet0/0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}

snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}

local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal

ssh server enable
"""


def init_tools():
    """初始化所有 Agent Tools"""
    register_tool(
        "list_projects",
        "列出所有项目及其结构",
        {
            "type": "object",
            "properties": {},
            "required": [],
        },
        _list_projects,
    )

    register_tool(
        "create_project",
        "创建新的配置项目，指定项目名称和可选的模板来源",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
                "templateName": {"type": "string", "description": "模板名称（可选）"},
            },
            "required": ["projectName"],
        },
        _create_project,
    )

    register_tool(
        "create_template",
        "将现有项目保存为可复用模板",
        {
            "type": "object",
            "properties": {
                "sourceProject": {"type": "string", "description": "源项目名称"},
                "templateName": {"type": "string", "description": "新模板名称"},
            },
            "required": ["sourceProject", "templateName"],
        },
        _create_template,
    )

    register_tool(
        "update_template",
        "修改模板文件内容",
        {
            "type": "object",
            "properties": {
                "templateName": {"type": "string", "description": "模板名称"},
                "filePath": {"type": "string", "description": "文件相对路径"},
                "content": {"type": "string", "description": "新内容"},
            },
            "required": ["templateName", "filePath", "content"],
        },
        _update_template,
    )

    register_tool(
        "render_config",
        "执行配置渲染，生成设备配置文件",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _render_config,
    )

    register_tool(
        "dry_run",
        "预演渲染，预览结果但不写入文件",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _dry_run,
    )

    register_tool(
        "validate_template",
        "校验 Jinja2 模板语法",
        {
            "type": "object",
            "properties": {
                "templateName": {"type": "string", "description": "模板名称"},
            },
            "required": ["templateName"],
        },
        _validate_template,
    )

    register_tool(
        "validate_excel",
        "校验 Excel 参数文件",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _validate_excel,
    )

    register_tool(
        "diff_compare",
        "对比渲染结果与已有输出差异",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _diff_compare,
    )

    register_tool(
        "read_file",
        "读取项目中的文件内容",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
                "filePath": {"type": "string", "description": "文件相对路径"},
            },
            "required": ["projectName", "filePath"],
        },
        _read_file,
    )

    register_tool(
        "search_files",
        "按名称或内容搜索项目文件",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索关键词"},
                "projectName": {"type": "string", "description": "限定项目（可选）"},
            },
            "required": ["query"],
        },
        _search_files,
    )

    register_tool(
        "create_project_intelligent",
        "智能创建项目：根据设备类型（switch/router/firewall）和厂商（huawei/cisco/h3c）自动生成 Jinja2 模板和 Excel 参数表。创建项目后可用 update_template 微调模板内容",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称（英文，如 my_switch_project）"},
                "deviceType": {"type": "string", "description": "设备类型：switch（交换机）、router（路由器）、firewall（防火墙）", "enum": ["switch", "router", "firewall"]},
                "vendor": {"type": "string", "description": "厂商：huawei（华为）、cisco（思科）、h3c（H3C）", "enum": ["huawei", "cisco", "h3c"]},
                "configDescription": {"type": "string", "description": "配置需求描述（可选，用于自定义模板）"},
            },
            "required": ["projectName", "deviceType", "vendor"],
        },
        _create_project_intelligent,
    )

    logger.info(f"Initialized {len(_tools)} Agent tools")
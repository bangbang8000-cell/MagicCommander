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
    return _run_python_cli(["project", "read-file", project_name, file_path])


async def _search_files(args: dict) -> str:
    """搜索项目文件：通过 list-files + grep 实现"""
    query = args["query"]
    project_name = args.get("projectName", "")
    ws = _workspace_dir or "workspace"
    import glob as _glob

    results = []
    if project_name:
        search_dirs = [str(Path(ws) / project_name)]
    else:
        search_dirs = [str(Path(ws) / d) for d in os.listdir(ws)
                       if os.path.isdir(os.path.join(ws, d)) and not d.startswith('.')]

    for search_dir in search_dirs:
        for root, dirs, files in os.walk(search_dir):
            dirs[:] = [d for d in dirs if not d.startswith('.') and d != '__pycache__']
            for fname in files:
                if query.lower() in fname.lower():
                    results.append(os.path.relpath(os.path.join(root, fname), ws))
                else:
                    fpath = os.path.join(root, fname)
                    try:
                        with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                            for i, line in enumerate(f, 1):
                                if query.lower() in line.lower():
                                    results.append(f"{os.path.relpath(fpath, ws)}:{i}: {line.strip()[:200]}")
                                    break
                    except Exception:
                        pass

    if not results:
        return json.dumps({"status": "ok", "message": f"未找到匹配 '{query}' 的文件或内容", "data": []}, ensure_ascii=False)
    return json.dumps({"status": "ok", "message": f"找到 {len(results)} 个匹配项", "data": results[:50]}, ensure_ascii=False)


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


async def _reverse_engineer_config(args: dict) -> str:
    """从已有网络设备配置反推模板和参数表"""
    config_text = args["configText"]
    project_name = args["projectName"]
    vendor = args.get("vendor", "huawei")
    device_type = args.get("deviceType", "switch")

    ws = _workspace_dir or "workspace"
    project_dir = Path(ws) / project_name

    if project_dir.exists():
        return json.dumps({
            "error": f"项目 '{project_name}' 已存在，请使用其他名称",
            "status": "exists",
        }, ensure_ascii=False)

    # 提取变量
    import re
    extracted = {}

    # 提取设备名
    hostname_patterns = [
        (r'^sysname\s+(\S+)', '设备名'),
        (r'^hostname\s+(\S+)', '设备名'),
    ]
    for pattern, key in hostname_patterns:
        m = re.search(pattern, config_text, re.MULTILINE)
        if m:
            extracted[key] = m.group(1)
            break

    # 提取 IP 地址（管理接口）
    ip_pattern = r'interface\s+\S+\s*\n\s*ip\s+address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)'
    m = re.search(ip_pattern, config_text)
    if m:
        extracted["管理IP"] = m.group(1)
        extracted["掩码"] = m.group(2)

    # 提取 VLAN
    vlan_pattern = r'vlan\s+(\d+)'
    m = re.search(vlan_pattern, config_text, re.IGNORECASE)
    if m:
        extracted["VLAN"] = m.group(1)

    # 提取网关 IP
    gw_pattern = r'Vlanif\d+\s*\n.*\n\s*ip\s+address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)'
    m = re.search(gw_pattern, config_text)
    if not m:
        gw_pattern = r'interface\s+Vlan\S*\s*\n.*\n\s*ip\s+address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)'
        m = re.search(gw_pattern, config_text)
    if m:
        extracted["网关IP"] = m.group(1)
        extracted["网关掩码"] = m.group(2)

    # 提取 SNMP
    snmp_patterns = [
        r'snmp-agent\s+community\s+read\s+(\S+)',
        r'snmp-server\s+community\s+(\S+)\s+RO',
        r'snmp-server\s+community\s+(\S+)',
    ]
    for p in snmp_patterns:
        m = re.search(p, config_text)
        if m:
            extracted["SNMP团体名"] = m.group(1)
            break

    snmp_host_patterns = [
        r'snmp-agent\s+target-host\s+trap\s+address\s+udp-domain\s+(\S+)',
        r'snmp-server\s+host\s+(\S+)',
    ]
    for p in snmp_host_patterns:
        m = re.search(p, config_text)
        if m:
            extracted["SNMP地址"] = m.group(1)
            break

    # 提取 NTP
    ntp_patterns = [
        r'ntp-service\s+unicast-server\s+(\S+)',
        r'ntp\s+server\s+(\S+)',
    ]
    for p in ntp_patterns:
        m = re.search(p, config_text)
        if m:
            extracted["NTP地址"] = m.group(1)
            break

    # 提取日志服务器
    log_patterns = [
        r'info-center\s+loghost\s+(\S+)',
        r'logging\s+host\s+(\S+)',
    ]
    for p in log_patterns:
        m = re.search(p, config_text)
        if m:
            extracted["LOGHOST地址"] = m.group(1)
            break

    # 提取 AAA
    tacacs_patterns = [
        r'hwtacacs\s+scheme\s+(\S+)',
        r'tacacs-server\s+host\s+(\S+)',
    ]
    for p in tacacs_patterns:
        m = re.search(p, config_text)
        if m:
            if "AAA名称" not in extracted:
                extracted["AAA名称"] = m.group(1)
            else:
                extracted.setdefault("AAA地址", m.group(1))

    aaa_key_pattern = r'key\s+\S+\s+simple\s+(\S+)'
    m = re.search(aaa_key_pattern, config_text)
    if m:
        extracted["AAA认证密钥"] = m.group(1)

    aaa_ip_pattern = r'primary\s+\S+\s+(\S+)'
    m = re.search(aaa_ip_pattern, config_text)
    if m:
        extracted["AAA地址"] = m.group(1)

    nas_pattern = r'nas-ip\s+(\S+)'
    m = re.search(nas_pattern, config_text)
    if m:
        extracted["NAS_IP"] = m.group(1)

    # 提取 domain
    domain_pattern = r'domain\s+(\S+)\s*\n'
    m = re.search(domain_pattern, config_text)
    if m:
        extracted["domain名称"] = m.group(1)

    # 提取本地用户
    user_patterns = [
        r'local-user\s+(\S+)\s+class\s+manage',
        r'username\s+(\S+)\s+privilege',
    ]
    for p in user_patterns:
        m = re.search(p, config_text)
        if m:
            extracted["本地用户名"] = m.group(1)
            break

    pass_patterns = [
        r'password\s+simple\s+(\S+)',
        r'password\s+(\S+)',
        r'secret\s+(\S+)',
    ]
    for p in pass_patterns:
        m = re.search(p, config_text)
        if m:
            extracted["本地用户密钥"] = m.group(1)
            break

    # 提取管理接口
    mgmt_pattern = r'interface\s+(\S+)\s*\n\s*ip\s+address\s+'
    m = re.search(mgmt_pattern, config_text)
    if m:
        extracted["管理接口"] = m.group(1)

    # 提取 VLAN 网关接口
    gw_if_pattern = r'interface\s+(Vlanif\d+|Vlan\d+)\s*\n'
    m = re.search(gw_if_pattern, config_text)
    if m:
        extracted["网关接口"] = m.group(1)

    if not extracted:
        return json.dumps({
            "status": "error",
            "error": "未能从配置文本中提取到有效参数。请确认配置文本格式正确。",
        }, ensure_ascii=False)

    # 创建项目目录
    (project_dir / "templates").mkdir(parents=True, exist_ok=True)
    (project_dir / "excel").mkdir(parents=True, exist_ok=True)
    (project_dir / "output").mkdir(parents=True, exist_ok=True)
    (project_dir / "output-label").mkdir(parents=True, exist_ok=True)
    (project_dir / "yaml").mkdir(parents=True, exist_ok=True)

    # 生成模板（替换提取的值为 Jinja2 变量）
    template_content = config_text
    variable_map = []

    # 按长度降序排序，避免短字符串先替换导致长字符串被破坏
    replacements = []
    for key, value in sorted(extracted.items(), key=lambda x: -len(x[1])):
        var_name = key
        if value and value in template_content:
            template_content = template_content.replace(value, f"{{{{ info['{var_name}'] }}}}")
            replacements.append({"变量名": var_name, "原值": value})

    # 写模板文件
    template_name = f"{device_type.upper()}_reversed.j2"
    template_path = project_dir / "templates" / template_name
    template_path.write_text(
        f"{{# 从配置反向生成 - {project_name} #}}\n{template_content}",
        encoding="utf-8",
    )

    # 创建 Excel 参数表
    try:
        import openpyxl
        excel_path = project_dir / "excel" / "parameter.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "主机表"

        keys = list(extracted.keys())
        for col, key in enumerate(keys, 1):
            ws.cell(row=1, column=col, value=key)
        for col, key in enumerate(keys, 1):
            ws.cell(row=2, column=col, value=extracted.get(key, ""))

        # 反向生成替换明细表
        ws2 = wb.create_sheet("替换明细")
        ws2.cell(row=1, column=1, value="变量名")
        ws2.cell(row=1, column=2, value="原值")
        for row, item in enumerate(replacements, 2):
            ws2.cell(row=row, column=1, value=item["变量名"])
            ws2.cell(row=row, column=2, value=item["原值"])

        wb.save(str(excel_path))
    except ImportError:
        logger.warning("openpyxl not available, skipping Excel creation")

    result = {
        "status": "created",
        "projectName": project_name,
        "extractedVariables": {k: v for k, v in list(extracted.items())[:10]},
        "totalVariables": len(extracted),
        "templateName": template_name,
        "message": f"从配置文本反向生成了项目 '{project_name}'，提取了 {len(extracted)} 个变量。模板已保存为 {template_name}。",
    }
    return json.dumps(result, ensure_ascii=False)


async def _recommend_template(args: dict) -> str:
    """根据项目特征推荐合适的模板"""
    device_type = args.get("deviceType", "")
    vendor = args.get("vendor", "")
    project_name = args.get("projectName", "")

    # 预置模板目录
    template_catalog = {
        "华为交换机": {
            "deviceType": "switch", "vendor": "huawei",
            "template": "HUAWEI_SWITCH", "description": "华为交换机基础配置模板，包含管理接口、VLAN、SNMP、NTP、AAA、本地用户",
            "features": ["VLAN配置", "聚合接口", "SNMP", "NTP", "AAA/TACACS", "SSH"],
        },
        "思科交换机": {
            "deviceType": "switch", "vendor": "cisco",
            "template": "CISCO_SWITCH", "description": "思科交换机基础配置模板，包含管理接口、VLAN、SNMP、NTP、AAA、本地用户",
            "features": ["VLAN配置", "SNMP", "NTP", "TACACS+", "SSH"],
        },
        "H3C交换机": {
            "deviceType": "switch", "vendor": "h3c",
            "template": "H3C_SWITCH", "description": "H3C交换机基础配置模板，包含管理接口、VLAN、SNMP、NTP、AAA、本地用户",
            "features": ["VLAN配置", "SNMP", "NTP", "AAA/TACACS", "SSH"],
        },
        "华为路由器": {
            "deviceType": "router", "vendor": "huawei",
            "template": "HUAWEI_ROUTER", "description": "华为路由器基础配置模板，支持OSPF/BGP路由协议",
            "features": ["OSPF", "BGP", "SNMP", "NTP", "AAA", "SSH"],
        },
        "思科路由器": {
            "deviceType": "router", "vendor": "cisco",
            "template": "CISCO_ROUTER", "description": "思科路由器基础配置模板，支持OSPF/BGP路由协议",
            "features": ["OSPF", "BGP", "SNMP", "NTP", "AAA", "SSH"],
        },
        "华为防火墙": {
            "deviceType": "firewall", "vendor": "huawei",
            "template": "HUAWEI_FIREWALL", "description": "华为防火墙基础配置模板，包含安全域、安全策略",
            "features": ["安全域", "安全策略", "SNMP", "AAA", "SSH"],
        },
    }

    # 根据用户输入匹配
    recommendations = []
    for name, info in template_catalog.items():
        score = 0
        if device_type and info["deviceType"] == device_type:
            score += 3
        if vendor and info["vendor"] == vendor:
            score += 3
        if not device_type and not vendor:
            score += 1  # 如果没有指定条件，显示所有模板

        if score > 0:
            recommendations.append({
                "name": name,
                "score": score,
                "deviceType": info["deviceType"],
                "vendor": info["vendor"],
                "description": info["description"],
                "features": info["features"],
            })

    # 按匹配度排序
    recommendations.sort(key=lambda x: -x["score"])

    # 如果指定了项目名，分析项目现有模板
    project_analysis = None
    if project_name:
        ws = _workspace_dir or "workspace"
        project_dir = Path(ws) / project_name
        if project_dir.exists():
            templates_dir = project_dir / "templates"
            if templates_dir.exists():
                existing = list(templates_dir.glob("*.j2"))
                if existing:
                    project_analysis = {
                        "existingTemplates": [f.name for f in existing],
                        "suggestion": "现有模板可基于推荐模板进行对比和优化",
                    }

    result = {
        "status": "ok",
        "recommendations": recommendations[:5],
        "totalAvailable": len(template_catalog),
        "projectAnalysis": project_analysis,
        "message": f"找到 {len(recommendations)} 个匹配的模板推荐" if recommendations else "未找到匹配的模板，请尝试指定设备类型和厂商",
    }
    return json.dumps(result, ensure_ascii=False)


# ====== 新增工具：补齐 CLI 能力 ======

async def _delete_project(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["project", "delete", "--force", project_name])


async def _get_project_info(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["project", "info", "--format", "json", project_name])


async def _render_yaml(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["render", "yaml", project_name])


async def _undo_render(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["render", "undo", project_name])


async def _generate_labels(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["label", "print", project_name])


async def _generate_label_md(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["label", "md", project_name])


async def _delete_labels(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["label", "delete", project_name])


async def _delete_files(args: dict) -> str:
    """删除项目输出文件（清空渲染结果）"""
    project_name = args["projectName"]
    file_type = args.get("fileType", "output")
    return _run_python_cli(["file", "delete", "--force", file_type, project_name])


async def _list_project_files(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["project", "list-files", project_name])


async def _read_excel(args: dict) -> str:
    project_name = args["projectName"]
    file_name = args["fileName"]
    cmd = ["project", "read-excel", project_name, file_name]
    if args.get("sheetName"):
        cmd.extend(["--sheet", args["sheetName"]])
    return _run_python_cli(cmd)


async def _write_excel(args: dict) -> str:
    project_name = args["projectName"]
    file_name = args["fileName"]
    data = json.dumps(args["data"], ensure_ascii=False)
    return _run_python_cli(["project", "write-excel", project_name, file_name, data])


async def _write_text_file(args: dict) -> str:
    project_name = args["projectName"]
    file_path = args["filePath"]
    content = args["content"]
    return _run_python_cli(["project", "write-file", project_name, file_path, content])


async def _analyze_project(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["analyze", "project", project_name])


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

    register_tool(
        "reverse_engineer_config",
        "从已有网络设备配置文本反推 Jinja2 模板和 Excel 参数表。粘贴完整的设备配置（如 show run 输出），自动识别并提取变量（IP、主机名、VLAN、SNMP、AAA 等），生成模板和参数文件",
        {
            "type": "object",
            "properties": {
                "configText": {"type": "string", "description": "完整的设备配置文本（如 show running-config 或 display current-configuration 的输出）"},
                "projectName": {"type": "string", "description": "新项目名称"},
                "vendor": {"type": "string", "description": "厂商：huawei/cisco/h3c", "enum": ["huawei", "cisco", "h3c"]},
                "deviceType": {"type": "string", "description": "设备类型：switch/router/firewall", "enum": ["switch", "router", "firewall"]},
            },
            "required": ["configText", "projectName"],
        },
        _reverse_engineer_config,
    )

    register_tool(
        "recommend_template",
        "根据设备类型和厂商推荐合适的配置模板。可以查询所有可用模板，也可以根据项目名称分析现有模板并给出优化建议。支持华为/思科/H3C 的交换机/路由器/防火墙模板",
        {
            "type": "object",
            "properties": {
                "deviceType": {"type": "string", "description": "设备类型：switch/router/firewall（可选）", "enum": ["switch", "router", "firewall"]},
                "vendor": {"type": "string", "description": "厂商：huawei/cisco/h3c（可选）", "enum": ["huawei", "cisco", "h3c"]},
                "projectName": {"type": "string", "description": "项目名称（可选，用于分析现有模板）"},
            },
            "required": [],
        },
        _recommend_template,
    )

    # ====== 新增工具注册 ======

    register_tool(
        "delete_project",
        "删除指定项目及其所有文件（不可恢复，请谨慎使用）",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _delete_project,
    )

    register_tool(
        "get_project_info",
        "获取项目详细信息：目录结构、文件列表、各子目录是否存在",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _get_project_info,
    )

    register_tool(
        "render_yaml",
        "渲染项目的 YAML 文件",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _render_yaml,
    )

    register_tool(
        "undo_render",
        "撤销最近一次渲染，恢复备份的输出文件",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _undo_render,
    )

    register_tool(
        "generate_labels",
        "生成 Word 格式的设备标签文件",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _generate_labels,
    )

    register_tool(
        "generate_label_md",
        "生成 Markdown 格式的设备标签文件，可在程序内直接查看",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _generate_label_md,
    )

    register_tool(
        "delete_labels",
        "删除指定项目的标签文件",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _delete_labels,
    )

    register_tool(
        "delete_files",
        "删除项目输出文件（清空渲染结果）。fileType 可选: output（设备配置）、yaml（YAML文件）、output-sn（SN模式）、yaml-sn（SN模式YAML）",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
                "fileType": {"type": "string", "description": "文件类型", "enum": ["output", "yaml", "output-sn", "yaml-sn"]},
            },
            "required": ["projectName"],
        },
        _delete_files,
    )

    register_tool(
        "list_project_files",
        "列出项目目录下的所有文件和子目录结构",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _list_project_files,
    )

    register_tool(
        "read_excel",
        "读取项目中的 Excel 文件内容（指定工作表），返回表头和数据行",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
                "fileName": {"type": "string", "description": "Excel 文件名（如 parameter.xlsx）"},
                "sheetName": {"type": "string", "description": "工作表名称（可选，默认第一个）"},
            },
            "required": ["projectName", "fileName"],
        },
        _read_excel,
    )

    register_tool(
        "write_excel",
        "向项目中的 Excel 文件写入数据",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
                "fileName": {"type": "string", "description": "Excel 文件名"},
                "data": {"type": "object", "description": "写入数据: {sheet, headers, rows}"},
            },
            "required": ["projectName", "fileName", "data"],
        },
        _write_excel,
    )

    register_tool(
        "write_text_file",
        "在项目中创建或覆盖文本文件（模板、配置等）",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
                "filePath": {"type": "string", "description": "相对于项目根目录的文件路径"},
                "content": {"type": "string", "description": "文件内容"},
            },
            "required": ["projectName", "filePath", "content"],
        },
        _write_text_file,
    )

    register_tool(
        "analyze_project",
        "分析项目：检查模板复杂度、变量使用、Excel 数据质量、模板与参数表的交叉引用，生成优化建议报告",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _analyze_project,
    )

    logger.info(f"Initialized {len(_tools)} Agent tools")
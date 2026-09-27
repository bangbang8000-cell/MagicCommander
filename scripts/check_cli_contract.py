#!/usr/bin/env python3
"""MC-CLI-A5：CLI 契约守卫（check_cli_contract.py）

背景与目的
----------
MC 的 CLI（`backend/main.py`）与 AL 的 CLI（`backend/cli.py`）在
「文档 ↔ 代码」以及「退出码 / 输出流」两份契约上都曾长期漂移：

  - AL `docs/cli.md` 声称 18 域 37 action，实测 **23 域 67 action**，漏 29 条；
  - MC `--version` 硬编码 `3.0.0`，产品实际 `5.4.1`（落后 2 个大版本）；
  - MC 退出码只有 0/1 两档，非法输入 `render bogus 1` 曾返回 0；
  - MC `print_error` 写 stdout，失败时把 `✗ ...` 混入下游 JSON 管道。

这些都不是笔误，而是**缺守卫**：真值在代码里，文档/常量在别处手工维护，
结构上必然漂移。本脚本把三件事钉成 CI 可执行的门禁。

校验项
------
  C1  退出码常量存在且取值符合契约（0/1/2/3）
  C2  无裸 `sys.exit(<数字>)`（除守卫自身白名单：130 = SIGINT 惯例）
  C3  `--version` 不硬编码版本号字面量（须运行时读取）
  C4  `print_error` / `print_warning` 走 stderr
  C5  epilog 不含已移除的命令（如 render project-sn / yaml-sn）
  C6  docs/cli.md 的命令表与真实命令树对账（若文档存在）
  C7  stdout JSON 顶层 `status` 取值在契约白名单内（P2-6 收拢）

用法
----
    python scripts/check_cli_contract.py            # 校验（CI 用）
    python scripts/check_cli_contract.py --verbose  # 打印全部项

退出码：0 = 通过，1 = 有违例。
"""
from __future__ import annotations

import argparse
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)
MAIN_PY = os.path.join(ROOT, 'backend', 'main.py')
CLI_DOC = os.path.join(ROOT, 'docs', 'cli.md')

# C2 白名单：允许的裸数字退出码（键=数字，值=理由）
ALLOWED_RAW_EXITS = {
    130: 'SIGINT 惯例（128+2），Ctrl-C 中断',
}

# C5：已从命令树移除、不得出现在 epilog 里的命令形态
REMOVED_COMMANDS = ('project-sn', 'yaml-sn')

# C7：stdout JSON 顶层 `status` 白名单（MC-CLI-A6 契约，P2-6 收拢）
#   _emit_progress 的 complete / progress 属渲染流水线终态/流式事件，一并允许。
STATUS_WHITELIST = ('success', 'error', 'warning', 'progress', 'complete')

# status 字面量扫描范围：**仅 CLI 输出路径**（main.py 顶层 + pre_processing.py
#  渲染流水线 stdout）。bridge_server.py（HTTP 端点）、_deps.py（依赖报告结构）
#  各自有独立 status 语义，**不属于 CLI stdout 契约**，故不纳入扫描。
STATUS_SCAN_FILES = ('backend/main.py', 'backend/pre_processing.py')


class Violation:
    def __init__(self, check: str, line: int, message: str):
        self.check = check
        self.line = line
        self.message = message

    def __str__(self) -> str:
        loc = f'L{self.line}' if self.line else '-'
        return f'[{self.check}] {loc}: {self.message}'


def _read(path: str) -> str:
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


# ---------------------------------------------------------------- C1
def check_exit_constants(src: str) -> list[Violation]:
    """退出码常量必须存在且取值符合双端统一契约（0/1/2/3）。"""
    expected = {
        'EXIT_OK': 0,
        'EXIT_INTERNAL': 1,
        'EXIT_USAGE': 2,
        'EXIT_EXEC': 3,
    }
    out: list[Violation] = []
    for name, want in expected.items():
        m = re.search(rf'^{name}\s*=\s*(\d+)', src, re.MULTILINE)
        if not m:
            out.append(Violation('C1', 0, f'缺少退出码常量 {name}（契约要求 {want}）'))
            continue
        got = int(m.group(1))
        if got != want:
            line = src[:m.start()].count('\n') + 1
            out.append(Violation('C1', line, f'{name} = {got}，契约要求 {want}'))
    return out


# ---------------------------------------------------------------- C2
def check_raw_exits(src: str) -> list[Violation]:
    """禁止裸 sys.exit(<数字>)——必须用语义化常量（130 例外）。

    跳过注释行（如说明性文字 `# 此前 MC 只有 0/1 两档（sys.exit(1) 硬编码）`）。
    """
    out: list[Violation] = []
    for m in re.finditer(r'sys\.exit\(\s*(\d+)\s*\)', src):
        num = int(m.group(1))
        if num in ALLOWED_RAW_EXITS:
            continue
        line_start = src.rfind('\n', 0, m.start()) + 1
        raw_line = src[line_start:src.find('\n', m.start())]
        if raw_line.lstrip().startswith('#'):
            continue  # 注释中的示例代码，非真实调用
        line = src[:m.start()].count('\n') + 1
        out.append(Violation('C2', line,
                             f'裸 sys.exit({num}) —— 请改用语义化常量（EXIT_OK/INTERNAL/USAGE/EXEC）'))
    return out


# ---------------------------------------------------------------- C3
def check_version_literal(src: str) -> list[Violation]:
    """`--version` 不得硬编码版本号字面量，须运行时读取。"""
    out: list[Violation] = []
    m = re.search(r"add_argument\(\s*['\"]--version['\"].*?version\s*=\s*(.+)", src, re.DOTALL)
    if not m:
        return out
    line = src[:m.start()].count('\n') + 1
    # 允许：f'%(prog)s {_product_version()} ...'
    if '_product_version()' in m.group(1):
        return out
    # 检测形如 '%(prog)s 3.0.0' 的硬编码
    if re.search(r"\d+\.\d+\.\d+", m.group(1)):
        out.append(Violation('C3', line,
                             '`--version` 硬编码版本号字面量 —— 请改用 _product_version() 运行时读取'))
    return out


# ---------------------------------------------------------------- C4
def check_error_stream(src: str) -> list[Violation]:
    """print_error / print_warning 必须走 stderr（不污染 stdout JSON 管道）。"""
    out: list[Violation] = []
    for fn in ('print_error', 'print_warning'):
        m = re.search(rf'def {fn}\(.*?\n(.*?)(?=\ndef |\nclass |\Z)', src, re.DOTALL)
        if not m:
            out.append(Violation('C4', 0, f'未找到 {fn} 定义'))
            continue
        body = m.group(1)
        line = src[:m.start()].count('\n') + 1
        if 'file=sys.stderr' not in body:
            out.append(Violation('C4', line,
                                 f'{fn} 未显式写 stderr —— 错误信息会污染 stdout（JSON 管道被破坏）'))
    return out


# ---------------------------------------------------------------- C5
def check_epilog_stale(src: str) -> list[Violation]:
    """epilog 不得残留已移除的命令。"""
    out: list[Violation] = []
    m = re.search(r'def _build_epilog\(\).*?return\s+(f?)(\'{3}|"{3})(.*?)\2', src, re.DOTALL)
    epilog_body = m.group(3) if m else ''
    if not epilog_body:
        # 兼容手写 epilog 常量
        m2 = re.search(r"epilog\s*=\s*(f?)(\'{3}|\"{3})(.*?)\2", src, re.DOTALL)
        epilog_body = m2.group(3) if m2 else ''
    for cmd in REMOVED_COMMANDS:
        if cmd in epilog_body:
            out.append(Violation('C5', 0,
                                 f'epilog 残留已移除的命令 `{cmd}` —— 会误导使用者'))
    return out


# ---------------------------------------------------------------- C6
def check_doc_consistency(src: str, doc_path: str) -> list[Violation]:
    """docs/cli.md 的**顶层命令**表 ↔ 真实顶层命令树对账。

    真值源 = `main.py` 里挂在**顶层 subparsers** 上的 `add_parser` 名字
    （即 `subparsers = parser.add_subparsers(...)` 之后的 `X = subparsers.add_parser(...)`）。
    子命令（`plan_parser.add_subparsers()` 之后）**不纳入**——它们由各域
    `--help` 与文档表格自行描述。

    文档侧：命令出现在下列任一形态即视为「已收录」——
      - 反引号命令：`mc <cmd>`
      - Markdown 表格单元：表格里的反引号命令名
      - 缩进清单：两空格以上缩进 + 命令 + 说明
      - 反引号代码段：任意反引号包裹的命令名
    """
    out: list[Violation] = []
    if not os.path.exists(doc_path):
        return out  # 文档不存在则不判定（由其他门禁负责新建）

    # 真值：顶层命令名 —— 定位顶层 add_subparsers 后的 add_parser
    #   形如：subparsers = parser.add_subparsers(...)  → subparsers.add_parser('x')
    #   子命令用 <domain>_subparsers = <domain>_parser.add_subparsers()
    top_names: set[str] = set()
    # 先找所有 add_subparsers 的变量名到「是否顶层」的映射
    top_sub_vars: set[str] = set()
    for m in re.finditer(r'(\w+)\s*=\s*parser\.add_subparsers\(', src):
        top_sub_vars.add(m.group(1))
    for m in re.finditer(r'(\w+)\s*=\s*subparsers\.add_parser\(\s*[\'"]([a-z0-9_-]+)[\'"]', src):
        # `subparsers` 若是顶层变量则记名
        if m.group(1) in top_sub_vars or 'subparsers' in src[:m.start()].split('\n')[-1]:
            pass
    # 更稳妥：直接抓「在顶层 subparsers 作用域内」的 add_parser
    for m in re.finditer(r'^\s{0,8}(\w+)\s*=\s*subparsers\.add_parser\(\s*[\'"]([a-z0-9_-]+)[\'"]',
                         src, re.MULTILINE):
        var, name = m.group(1), m.group(2)
        # 顶层 subparsers 变量即名字恰为 `subparsers`（子命令用 <x>_subparsers）
        line = src[m.start():src.find('\n', m.start())]
        if re.search(r'(?<!_)subparsers\.add_parser', line):
            top_names.add(name)
    if not top_names:
        # 回退：旧逻辑（全部 add_parser）
        top_names = set(re.findall(r"subparsers\.add_parser\(\s*['\"]([a-z0-9_-]+)['\"]", src))

    doc = _read(doc_path)
    doc_cmds: set[str] = set()
    doc_cmds |= set(re.findall(r'`mc\s+([a-z0-9_-]+)', doc))          # `mc cmd`
    doc_cmds |= set(re.findall(r'`([a-z0-9_-]+)`', doc))              # 任意反引号命令段
    doc_cmds |= set(re.findall(r'^\s{2,}([a-z0-9_-]+)\s{2,}', doc, re.MULTILINE))  # 缩进清单

    missing = sorted(c for c in top_names if c not in doc_cmds)
    if missing:
        out.append(Violation('C6', 0,
                             f'docs/cli.md 未收录 {len(missing)} 个已注册顶层命令: {", ".join(missing)}'))
    return out


# ---------------------------------------------------------------- C7
def check_status_whitelist() -> list[Violation]:
    """stdout JSON 顶层 `status` 取值必须在契约白名单内（MC-CLI-A6 / P2-6）。

    背景：此前 stdlib `status` 有 6 种取值（success/error/warning +
    complete/pass/progress/fail），而 Electron `render.handler.ts:394`
    只认 success/complete/error —— `warning` 会被误判为「输出格式不正确」。
    本检查扫描 `backend/**/*.py` 中形如 `'status': '<值>'` 的字面量：

      - 若该字面量在 `{'status': ...}` 且不是 `results[]` 嵌套项 → 必须白名单；
      - `results[]` 内的 per-item 状态（pass/fail/warn）不属于顶层契约，
        通过 `_NESTED_STATUS_CONTEXT` 行上下文（`project`/`file` 等键同现）豁免。

    简化实现：只按白名单直接判定顶层字面量；对已知嵌套状态（pass/fail/warn）
    在 __pycache__/tests 之外出现时，检查其是否位处 `results.append` 块内。
    """
    out: list[Violation] = []
    nested_ok = {'pass', 'fail', 'warn', 'ok', 'missing', 'error', 'success'}
    for rel in STATUS_SCAN_FILES:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            continue
        try:
            lines = _read(path).splitlines()
        except (OSError, UnicodeDecodeError):
            continue
        for i, line in enumerate(lines, 1):
            m = re.search(r"['\"]status['\"]\s*:\s*['\"]([a-z_]+)['\"]", line)
            if not m:
                continue
            val = m.group(1)
            if val in STATUS_WHITELIST:
                continue
            # 嵌套项（results[] 内）豁免：向上回溯是否在 results/errors 追加块
            ctx = '\n'.join(lines[max(0, i - 12):i])
            if val in nested_ok and re.search(
                r"results\.append|errors\.append|warnings\.append|'project'\s*:", ctx
            ):
                continue
            out.append(Violation(
                'C7', i,
                f"{rel}: status='{val}' 不在契约白名单 {STATUS_WHITELIST} 内"
                f"（顶层输出契约见 main.py MC-CLI-A6）",
            ))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description='MC CLI 契约守卫')
    ap.add_argument('--verbose', '-V', action='store_true', help='打印全部检查项')
    args = ap.parse_args()

    if not os.path.exists(MAIN_PY):
        print(f'错误: 未找到 {MAIN_PY}', file=sys.stderr)
        return 1

    src = _read(MAIN_PY)
    violations: list[Violation] = []
    checks = [
        ('C1 退出码常量', lambda: check_exit_constants(src)),
        ('C2 无裸 sys.exit(数字)', lambda: check_raw_exits(src)),
        ('C3 版本不硬编码', lambda: check_version_literal(src)),
        ('C4 错误走 stderr', lambda: check_error_stream(src)),
        ('C5 epilog 无残留命令', lambda: check_epilog_stale(src)),
        ('C6 文档与命令树对账', lambda: check_doc_consistency(src, CLI_DOC)),
        ('C7 status 取值白名单', lambda: check_status_whitelist()),
    ]

    for name, fn in checks:
        found = fn()
        violations.extend(found)
        if args.verbose:
            mark = 'FAIL' if found else 'ok'
            print(f'  {mark:4s}  {name}')

    if violations:
        print(f'\nMC CLI 契约守卫：发现 {len(violations)} 项违例\n')
        for v in violations:
            print(f'  {v}')
        print()
        return 1

    print('MC CLI 契约守卫：✅ 通过（C1-C7 全部符合）')
    return 0


if __name__ == '__main__':
    sys.exit(main())

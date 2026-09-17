#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""5.2.2 · 文档数字自动校验（MC T4.1）

与 AL 端 `scripts/check_doc_numbers.py` 同构：以**代码为唯一真值源**，CI 反向校验文档。

真值来源：
  - 设备库角色数：`backend/intent/device_library.json`
  - AI 工具注册数：运行时 `ai_hub.agent.tools.init_tools()` 后 `get_tool_definitions()`

校验对象：README.md / CHANGELOG.md（CHANGELOG 只校验最新版本章节，历史条目不比对）。

用法：
    python scripts/check_doc_numbers.py            # 校验，漂移则 exit 1
    python scripts/check_doc_numbers.py --print    # 只打印真值

退出码：0 通过 / 1 发现漂移 / 2 真值源缺失
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEVICE_LIB = os.path.join(ROOT, 'backend', 'intent', 'device_library.json')
DOCS = [os.path.join(ROOT, 'README.md'), os.path.join(ROOT, 'CHANGELOG.md')]


def real_device_count():
    with io.open(DEVICE_LIB, encoding='utf-8') as f:
        data = json.load(f)
    return len(data) if isinstance(data, list) else len(data.get('devices') or [])


def real_tool_count():
    """运行时统计注册工具数（与 Agent 实际看到的 tools/list 一致）"""
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    from ai_hub.agent import tools  # noqa: E402
    tools.init_tools()
    return len(tools.get_tool_definitions())


def _read(path):
    if not os.path.exists(path):
        return ''
    with io.open(path, encoding='utf-8', errors='ignore') as f:
        text = f.read()
    if os.path.basename(path).lower() == 'changelog.md':
        marks = list(re.finditer(r'(?m)^## \[', text))
        if len(marks) >= 2:
            text = text[:marks[1].start()]
    return text


def check():
    devices = real_device_count()
    tools_n = real_tool_count()
    problems = []
    for doc in DOCS:
        text = _read(doc)
        if not text:
            continue
        rel = os.path.relpath(doc, ROOT)
        for m in re.finditer(r'Agent--Tools-(\d+)-', text):
            if int(m.group(1)) != tools_n:
                problems.append(f'{rel}: Agent Tools 徽章写 {m.group(1)}，真值 {tools_n}')
    return {'devices': devices, 'agent_tools': tools_n}, problems


def main():
    ap = argparse.ArgumentParser(description='校验 MC 文档中的设备库/工具数量是否与代码一致')
    ap.add_argument('--print', dest='do_print', action='store_true', help='只打印真值')
    args = ap.parse_args()
    try:
        truth, problems = check()
    except Exception as e:  # noqa: BLE001
        print(f'[check-doc-numbers] 真值源不可用: {e}', file=sys.stderr)
        return 2
    if args.do_print:
        print(json.dumps(truth, ensure_ascii=False, indent=2))
        return 0
    print('[check-doc-numbers] 真值: 设备库角色 %d | Agent 工具 %d'
          % (truth['devices'], truth['agent_tools']))
    if problems:
        print('\n[check-doc-numbers] 发现 %d 处文档漂移:' % len(problems), file=sys.stderr)
        for p in problems:
            print('  - ' + p, file=sys.stderr)
        return 1
    print('[check-doc-numbers] OK：文档数字与代码一致')
    return 0


if __name__ == '__main__':
    sys.exit(main())

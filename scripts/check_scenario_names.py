# -*- coding: utf-8 -*-
"""W5.2（V5.3.0-640-m）：双端目录同名校验（AL `template/<名>` ↔ MC `example/<名>` 6 对）。

6 场景目录名来自 PRD §3.4 裁定（统一中文语义，双端同名）。
返回缺失清单；两侧均存在才通过（验收：6/6 同名，AL 侧由 W6.2 生成）。
"""
import os
import sys
from pathlib import Path

AL_TEMPLATE = Path(r'D:\MyCoding\MC-AL\AIDC AutoLink-Client\template')
MC_EXAMPLE = Path(r'D:\MyCoding\MC-AL\MagicCommander-Client\example')

SCENARIO_DIRS = [
    '万卡-H200-QM9700-三层-IB',
    '万卡-H200-Q3400-二层-IB',
    '万卡-H200-X400-三层-RoCE',
    '二层最大-2048卡-QM9700-IB',
    '二层最大-8192卡-X400-RoCE',
    '万卡-B300-Q3400-二层-IB',
]


def check_names(al_root: Path = AL_TEMPLATE, mc_root: Path = MC_EXAMPLE) -> list[str]:
    problems = []
    for name in SCENARIO_DIRS:
        a = (al_root / name).is_dir()
        m = (mc_root / name).is_dir()
        if not a and not m:
            problems.append(f'{name}: 双侧均缺')
        elif not a:
            problems.append(f'{name}: 缺 AL template（W6.2 生成）')
        elif not m:
            problems.append(f'{name}: 缺 MC example（W5.1 生成）')
    return problems


def main() -> int:
    problems = check_names()
    if problems:
        print('同名校验失败：')
        for p in problems:
            print(f'  - {p}')
        return 1
    print(f'同名校验通过：{len(SCENARIO_DIRS)}/6 双端同名')
    return 0


if __name__ == '__main__':
    sys.exit(main())

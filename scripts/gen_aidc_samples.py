"""4.9.0（49-b）：AIDC 示例资产生成与注册 CLI。

用法：
  python scripts/gen_aidc_samples.py            # 生成并注册 4 个示例到 example/
  python scripts/gen_aidc_samples.py --list     # 仅列出示例定义
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from aidc_samples import EXAMPLE_DIR, SAMPLE_DEFS, build_all_plans, register_samples  # noqa: E402


def main():
    if '--list' in sys.argv:
        print(json.dumps(
            [{'key': d['key'], 'site': d['site'], 'gpuCount': d['gpuCount'],
              'spines': d['spines'], 'fabric': d['fabric'],
              'convergence': d['convergence'], 'vendor': d['vendor']}
             for d in SAMPLE_DEFS],
            ensure_ascii=False, indent=2))
        return 0

    os.makedirs(EXAMPLE_DIR, exist_ok=True)
    created = register_samples()
    print(f'示例已注册到 {EXAMPLE_DIR}：')
    for key, target in created:
        plan = build_all_plans()[key]
        print(f'  - {key} → {os.path.relpath(target, EXAMPLE_DIR)}'
              f'（设备 {len(plan["deviceList"])} / 接线 {len(plan["connections"])}'
              f' / 终端 {len(plan["terminals"])}）')
    return 0


if __name__ == '__main__':
    sys.exit(main())

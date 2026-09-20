# -*- coding: utf-8 -*-
"""W5.1（V5.3.0-640-m）：MC example 6 场景目录骨架生成。

形态（裁定 3/19 模板项目合一）：templates/ + para.xlsx + template.meta.json + README.md。
templates/ 占位（.gitkeep）；IB 4 套最终无 fabric j2、RoCE 2 套有 SONiC 族由 W6.4 填充。
"""
import json
import os
from pathlib import Path

from openpyxl import Workbook

MC = Path(r'D:\MyCoding\MC-AL\MagicCommander-Client')
EXAMPLE = MC / 'example'

SCENARIOS = [
    ('万卡-H200-QM9700-三层-IB', '万卡集群 A：1250 台 H200 / 10000 卡，NVIDIA QM9700（64×400G）k=64，IB 三层，不渲染'),
    ('万卡-H200-Q3400-二层-IB', '万卡集群 B：1250 台 H200 / 10000 卡，NVIDIA Q3400-RA（72×1.6T）k=288，IB 二层，不渲染'),
    ('万卡-H200-X400-三层-RoCE', '万卡集群 C：1250 台 H200 / 10000 卡，浪潮 X400（128×400G）k=128，RoCE 三层，需渲染'),
    ('二层最大-2048卡-QM9700-IB', '二层最大 A：256 台 H200 / 2048 卡，NVIDIA QM9700 k=64，IB 二层（恰为上限），不渲染'),
    ('二层最大-8192卡-X400-RoCE', '二层最大 B：1024 台 H200 / 8192 卡，浪潮 X400 k=128，RoCE 二层（恰为上限），需渲染'),
    ('万卡-B300-Q3400-二层-IB', '万卡集群 D：1250 台 DGX B300 / 10000 卡，NVIDIA Q3400（72×1.6T→144×800G）k=144，IB 二层，不渲染'),
]

PARA_HEADERS = ['工作簿名称', '工作表名称', '工作表类型', '对称列数', 'key列数']


def make_para_xlsx(path: Path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = 'project_para'
    ws.append(PARA_HEADERS)
    wb.save(path)


def make_meta(name: str, scenario: str) -> dict:
    return {
        'name': name,
        'status': 'skeleton',
        'note': 'W5.1 骨架：templates/para.xlsx/template.meta.json/README.md 就位；'
                'plan.json 与渲染产物（IB 无 fabric j2 / RoCE SONiC 族）由 W6.4 导入 AL 交付包填充',
        'source': 'autolink',
        'license': 'private',
        'planes': ['参数网', '存储网', '业务&管理网', '带外网'],
        'roles': ['SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF', 'BIZ_AGG', 'BIZ_ACCESS', 'OOB_AGG', 'OOB_ACCESS'],
        'scenario': scenario,
        'generator': 'intent.project_single.SingleProjectGenerator',
        'version': '0.3',
    }


def make_readme(name: str, scenario: str) -> str:
    return (
        f'# {name}\n\n'
        f'{scenario}（6 场景内容建设）。\n'
        f'状态：**骨架**（W5.1）。内容建设（AL plan.json + para.xlsx + 渲染产物）随 W6.4 导入。\n'
    )


def main() -> None:
    for name, scenario in SCENARIOS:
        d = EXAMPLE / name
        (d / 'templates').mkdir(parents=True, exist_ok=True)
        (d / 'templates' / '.gitkeep').write_text('', encoding='utf-8')
        make_para_xlsx(d / 'para.xlsx')
        (d / 'template.meta.json').write_text(
            json.dumps(make_meta(name, scenario), ensure_ascii=False, indent=2), encoding='utf-8')
        (d / 'README.md').write_text(make_readme(name, scenario), encoding='utf-8')
        print(f'OK {name}')


if __name__ == '__main__':
    main()

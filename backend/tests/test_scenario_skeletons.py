# -*- coding: utf-8 -*-
"""W5.1/W5.2（V5.3.0-640-m）：MC example 6 场景骨架 + 双端同名校验测试。"""
import importlib.util
import json
import os
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent.parent
CHECK_SCRIPT = REPO / 'scripts' / 'check_scenario_names.py'

EXAMPLE = REPO / 'example'

SCENARIO_DIRS = [
    '万卡-H200-QM9700-三层-IB',
    '万卡-H200-Q3400-二层-IB',
    '万卡-H200-X400-三层-RoCE',
    '二层最大-2048卡-QM9700-IB',
    '二层最大-8192卡-X400-RoCE',
    '万卡-B300-Q3400-二层-IB',
]


def _load_check():
    spec = importlib.util.spec_from_file_location('mc_check_scenario_names', CHECK_SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestScenarioSkeletons:
    """W5.1：6 场景 example 目录骨架（templates/ + para.xlsx + template.meta.json + README.md）。"""

    def test_six_skeletons_exist_with_skeleton_files(self):
        assert len(SCENARIO_DIRS) == 6
        for name in SCENARIO_DIRS:
            d = EXAMPLE / name
            assert d.is_dir(), f'缺 example/{name}'
            assert (d / 'templates').is_dir(), f'{name}/templates 缺'
            assert (d / 'para.xlsx').is_file(), f'{name}/para.xlsx 缺'
            assert (d / 'template.meta.json').is_file(), f'{name}/template.meta.json 缺'
            assert (d / 'README.md').is_file(), f'{name}/README.md 缺'
            meta = json.loads((d / 'template.meta.json').read_text(encoding='utf-8'))
            assert meta['name'] == name
            # W6.4 导入完成 → status=ready（S5 骨架 → S6 内容建设落地）
            assert meta['status'] in ('skeleton', 'ready')

    def test_skeleton_para_xlsx_has_project_para_header(self):
        import pandas as pd
        d = EXAMPLE / SCENARIO_DIRS[0]
        with pd.ExcelFile(d / 'para.xlsx') as xf:
            df = xf.parse('project_para')
            assert list(df.columns) == ['工作簿名称', '工作表名称', '工作表类型', '对称列数', 'key列数']


class TestScenarioNamesCheck:
    """W5.2：双端目录同名校验（6/6 同名，AL 侧 W6.2 生成）。"""

    def test_check_script_flags_missing_sides(self, tmp_path):
        mod = _load_check()
        al = tmp_path / 'al'; mc = tmp_path / 'mc'
        (al / SCENARIO_DIRS[0]).mkdir(parents=True)
        (mc / SCENARIO_DIRS[0]).mkdir(parents=True)
        (mc / SCENARIO_DIRS[1]).mkdir(parents=True)
        problems = mod.check_names(al, mc)
        texts = ' | '.join(problems)
        assert f'{SCENARIO_DIRS[0]}: 双侧均缺' not in texts  # 第一套两侧都有 → 不报
        assert f'{SCENARIO_DIRS[1]}' in texts and '缺 AL template' in texts
        assert f'{SCENARIO_DIRS[2]}' in texts and '双侧均缺' in texts

    def test_check_script_full_pass(self, tmp_path):
        mod = _load_check()
        al = tmp_path / 'al'; mc = tmp_path / 'mc'
        for name in SCENARIO_DIRS:
            (al / name).mkdir(parents=True)
            (mc / name).mkdir(parents=True)
        assert mod.check_names(al, mc) == []

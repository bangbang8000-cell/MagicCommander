"""5.0.4（504-a）项目分享只读快照测试。

覆盖：结构/关键配置/渲染结果摘要、JSON 可序列化、≤2MB 上限、只读安全（不含配置原文）。
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd  # noqa: E402

from intent.share import (  # noqa: E402
    SHARE_SNAPSHOT_MAX_BYTES,
    SHARE_SNAPSHOT_SCHEMA,
    build_share_snapshot,
)


def _rendered_project(project_dir):
    """带渲染批次 + 交付清单的健康项目。"""
    os.makedirs(os.path.join(project_dir, 'excel'), exist_ok=True)
    os.makedirs(os.path.join(project_dir, 'templates'), exist_ok=True)
    pd.DataFrame({
        '工作簿名称': ['hostname.xlsx'], '工作表名称': ['主机表'], '工作表类型': ['赋值表'],
        '对称列数': [0], 'key列数': [1],
    }).to_excel(os.path.join(project_dir, 'para.xlsx'), sheet_name='project_para', index=False)
    pd.DataFrame({
        '设备名': ['SW-01'], '型号': ['H3C S5560X'], '角色': ['ASW'], '管理IP': ['192.168.1.1'],
    }).to_excel(os.path.join(project_dir, 'excel', 'hostname.xlsx'), sheet_name='主机表', index=False)
    with open(os.path.join(project_dir, 'templates', 'ASW.j2'), 'w', encoding='utf-8') as f:
        f.write('hostname {{ info["设备名"] }}\n')
    with open(os.path.join(project_dir, 'plan.json'), 'w', encoding='utf-8') as f:
        json.dump({'meta': {'name': 'share-demo'}}, f)
    base = os.path.join(project_dir, 'output', '2026_09_02_10_00_00', 'ASW')
    os.makedirs(base, exist_ok=True)
    with open(os.path.join(base, 'SW-01.txt'), 'w', encoding='utf-8') as f:
        f.write('hostname SW-01\n')
    from intent.delivery import write_batch_manifest
    write_batch_manifest(project_dir, 'output', '2026_09_02_10_00_00')
    return project_dir


class TestShareSnapshot:
    def test_schema_and_identity(self, tmp_path):
        proj = _rendered_project(str(tmp_path / 'p'))
        snap = build_share_snapshot(proj)
        assert snap['schema'] == SHARE_SNAPSHOT_SCHEMA
        assert snap['kind'] == 'share-snapshot'
        assert snap['project'] == 'p'
        assert snap['generated_at']

    def test_structure_summary(self, tmp_path):
        proj = _rendered_project(str(tmp_path / 'p'))
        snap = build_share_snapshot(proj)
        s = snap['summary']['structure']
        assert s['para'] is True
        assert s['excel'] is True
        assert s['templates'] is True
        assert s['output'] is True
        assert snap['summary']['template_count'] >= 1

    def test_render_result_summary(self, tmp_path):
        proj = _rendered_project(str(tmp_path / 'p'))
        snap = build_share_snapshot(proj)
        r = snap['render']
        assert r['has_batch'] is True
        assert r['rendered_at'] == '2026_09_02_10_00_00'
        assert r['file_count'] >= 1
        assert r['render_hash']

    def test_no_render_manifest(self, tmp_path):
        proj = str(tmp_path / 'empty')
        os.makedirs(proj, exist_ok=True)
        snap = build_share_snapshot(proj)
        assert snap['render']['has_batch'] is False

    def test_json_serializable_and_small(self, tmp_path):
        proj = _rendered_project(str(tmp_path / 'p'))
        snap = build_share_snapshot(proj)
        dumped = json.dumps(snap, ensure_ascii=False)
        json.loads(dumped)  # 可反序列化
        assert len(dumped.encode('utf-8')) <= SHARE_SNAPSHOT_MAX_BYTES

    def test_readonly_no_file_content(self, tmp_path):
        proj = _rendered_project(str(tmp_path / 'p'))
        snap = build_share_snapshot(proj)
        dumped = json.dumps(snap, ensure_ascii=False)
        # 只读安全：快照不含模板/渲染正文（hostname 命令不应出现在快照中）
        assert 'hostname {{' not in dumped
        assert 'hostname SW-01' not in dumped

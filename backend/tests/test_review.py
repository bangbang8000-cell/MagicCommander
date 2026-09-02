"""4.8.0（F8-4 / 48-d）项目评审包测试：聚合校验报告 + 核对矩阵 + 项目摘要 + 交付清单 → zip/Markdown。"""
import json
import os
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd  # noqa: E402

from intent.review import (  # noqa: E402
    build_review_package,
    build_review_report,
    render_review_markdown,
    write_review_markdown_file,
)


def _rendered_project(project_dir):
    """带渲染批次的健康项目。"""
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
    base = os.path.join(project_dir, 'output', '2026_09_02_10_00_00', 'ASW')
    os.makedirs(base, exist_ok=True)
    with open(os.path.join(base, 'SW-01.txt'), 'w', encoding='utf-8') as f:
        f.write('hostname SW-01\n')
    # 交付清单
    from intent.delivery import write_batch_manifest
    write_batch_manifest(project_dir, 'output', '2026_09_02_10_00_00')
    return project_dir


class TestReview:
    def test_report_aggregates_sections(self, tmp_path):
        proj = _rendered_project(str(tmp_path / 'p'))
        r = build_review_report(proj)
        assert r['schema'] == 'mc.review/1'
        assert r['project'] == 'p'
        assert r['summary']['structure']['para'] is True
        assert 'validation' in r and 'summary' in r['validation']
        assert 'verify' in r
        assert r['delivery']['schema'] == 'mc.render-manifest/1'
        assert r['delivery']['summary']['file_count'] == 1

    def test_report_captures_identity(self, tmp_path):
        proj = _rendered_project(str(tmp_path / 'p'))
        with open(os.path.join(proj, 'template.meta.json'), 'w', encoding='utf-8') as f:
            json.dump({'originProjectId': 'al-1', 'planHash': 'abc123'}, f)
        r = build_review_report(proj)
        assert r['summary']['identity']['originProjectId'] == 'al-1'
        assert r['summary']['identity']['planHash'] == 'abc123'

    def test_markdown_includes_sections(self, tmp_path):
        proj = _rendered_project(str(tmp_path / 'p'))
        r = build_review_report(proj)
        md = render_review_markdown(r)
        assert '项目评审报告' in md
        assert '校验汇总' in md
        assert '渲染命令核对矩阵' in md
        assert '交付清单' in md
        assert 'SW-01' in md

    def test_package_zip_contents(self, tmp_path):
        proj = _rendered_project(str(tmp_path / 'p'))
        out = str(tmp_path / 'review.zip')
        result = build_review_package(proj, out)
        assert os.path.exists(out)
        with zipfile.ZipFile(out) as zf:
            names = zf.namelist()
            assert 'report.json' in names
            assert 'review.md' in names
            assert 'manifest.json' in names
        report = json.loads(zipfile.ZipFile(out).read('report.json').decode('utf-8'))
        assert report['schema'] == 'mc.review/1'

    def test_write_markdown_file(self, tmp_path):
        proj = _rendered_project(str(tmp_path / 'p'))
        md_path = str(tmp_path / 'review.md')
        r = write_review_markdown_file(proj, md_path)
        assert r['ok'] is True
        assert os.path.exists(md_path)
        assert '# 项目评审报告' in open(md_path, encoding='utf-8').read()

"""5.0.4（504-a）项目分享只读快照生成。

供云端分享预览页（/share/<token>）展示，参考 AL exporter.generate_snapshot 思路：
聚合「项目结构 / 关键配置 / 渲染结果摘要」，输出可 JSON 序列化的只读快照（≤2MB）。
只读安全：不含模板正文与渲染配置原文，仅摘要统计。
"""

import datetime
import json
import os

SHARE_SNAPSHOT_SCHEMA = 'mc.share-snapshot/1'
SHARE_SNAPSHOT_VERSION = 1
SHARE_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024  # ≤2MB

# 渲染输出目录（快照仅摘要，不读原文）
_RENDER_DIRS = ('output', 'output-sn', 'yaml', 'yaml-sn', 'output-label', 'output-label-md', 'output-label-pdf')


def _now_utc() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')


def _excel_summary(project_dir: str) -> dict:
    """关键配置摘要：para 存在性 + excel 工作簿清单（文件名/条数，截断防超大）。"""
    excel_dir = os.path.join(project_dir, 'excel')
    files = []
    if os.path.isdir(excel_dir):
        files = sorted(
            f for f in os.listdir(excel_dir)
            if f.lower().endswith(('.xlsx', '.xls')) and not f.startswith('~$')
        )
    return {
        'para': os.path.exists(os.path.join(project_dir, 'para.xlsx')),
        'plan': os.path.exists(os.path.join(project_dir, 'plan.json')),
        'excel_files': files[:200],
        'excel_count': len(files),
    }


def _render_summary(project_dir: str) -> dict:
    """渲染结果摘要：最近一批次 manifest（rendered_at / file_count / total_bytes / render_hash）。"""
    from intent.delivery import read_batch_manifest
    manifest = read_batch_manifest(project_dir, 'output')
    if not manifest:
        return {
            'has_batch': False,
            'rendered_at': '',
            'file_count': 0,
            'total_bytes': 0,
            'render_hash': '',
        }
    batch = manifest.get('batch', {})
    summary = manifest.get('summary', {})
    return {
        'has_batch': True,
        'rendered_at': str(batch.get('rendered_at', '')),
        'file_count': int(summary.get('file_count', 0)),
        'total_bytes': int(summary.get('total_bytes', 0)),
        'render_hash': str(summary.get('render_hash', '')),
    }


def build_share_snapshot(project_dir: str) -> dict:
    """生成项目只读分享快照 dict（可 JSON 序列化，≤2MB）。"""
    from intent.review import _project_summary

    summary = _project_summary(project_dir)
    snapshot = {
        'schema': SHARE_SNAPSHOT_SCHEMA,
        'version': SHARE_SNAPSHOT_VERSION,
        'kind': 'share-snapshot',
        'project': os.path.basename(project_dir.rstrip('/\\')),
        'generated_at': _now_utc(),
        'summary': summary,
        'config': _excel_summary(project_dir),
        'render': _render_summary(project_dir),
    }
    # 防御性大小上限：若序列化超限则剥离 excel 文件名清单（仅保留计数）
    if len(json.dumps(snapshot, ensure_ascii=False).encode('utf-8')) > SHARE_SNAPSHOT_MAX_BYTES:
        snapshot['config']['excel_files'] = []
    return snapshot

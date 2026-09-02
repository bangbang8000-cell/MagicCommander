"""4.8.0（F8-5 / 48-e）交付物清单与校验测试：渲染批次 manifest 生成 + 缺失/漂移/哈希不符报告。"""
import hashlib
import json
import os
import tempfile

from intent.delivery import (
    RENDER_MANIFEST_SCHEMA,
    read_batch_manifest,
    verify_batch_manifest,
    write_batch_manifest,
    latest_batch_dir,
)


def _batch(project_dir, ts='2026_09_02_10_00_00', files=None):
    base = os.path.join(project_dir, 'output', ts)
    os.makedirs(base, exist_ok=True)
    for name, content in (files or {'ASW/SW-01.txt': 'config a\n', 'ASW/SW-02.txt': 'config b\n'}).items():
        p = os.path.join(base, name)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as f:
            f.write(content)
    return base


class TestBatchManifest:
    def test_write_manifest_schema_and_entries(self, tmp_path):
        proj = str(tmp_path / 'p')
        _batch(proj)
        m = write_batch_manifest(proj, 'output', '2026_09_02_10_00_00')
        assert m['schema'] == RENDER_MANIFEST_SCHEMA
        assert m['batch']['rendered_at'] == '2026_09_02_10_00_00'
        assert m['summary']['file_count'] == 2
        paths = {f['path'] for f in m['files']}
        assert paths == {'ASW/SW-01.txt', 'ASW/SW-02.txt'}
        assert all(f['sha256'] and f['size'] > 0 for f in m['files'])
        assert m['summary']['render_hash']
        # manifest.json 不在自身清单中
        assert not any(f['path'].endswith('manifest.json') for f in m['files'])

    def test_latest_batch_dir_picks_newest(self, tmp_path):
        proj = str(tmp_path / 'p')
        _batch(proj, ts='2026_09_01_00_00_00')
        _batch(proj, ts='2026_09_02_00_00_00')
        latest = latest_batch_dir(proj)
        assert os.path.basename(latest) == '2026_09_02_00_00_00'

    def test_verify_healthy(self, tmp_path):
        proj = str(tmp_path / 'p')
        _batch(proj)
        write_batch_manifest(proj, 'output', '2026_09_02_10_00_00')
        r = verify_batch_manifest(proj, 'output', '2026_09_02_10_00_00')
        assert r['ok'] is True
        assert r['missing'] == [] and r['hash_mismatch'] == [] and r['drifted'] == []

    def test_verify_missing_and_drift(self, tmp_path):
        proj = str(tmp_path / 'p')
        _batch(proj)
        write_batch_manifest(proj, 'output', '2026_09_02_10_00_00')
        # 删除一个文件 → missing；新增多余文件 → drifted
        os.remove(os.path.join(proj, 'output', '2026_09_02_10_00_00', 'ASW', 'SW-02.txt'))
        with open(os.path.join(proj, 'output', '2026_09_02_10_00_00', 'ASW', 'EXTRA.txt'), 'w') as f:
            f.write('extra')
        r = verify_batch_manifest(proj, 'output', '2026_09_02_10_00_00')
        assert r['ok'] is False
        assert 'ASW/SW-02.txt' in r['missing']
        assert 'ASW/EXTRA.txt' in r['drifted']

    def test_verify_hash_mismatch(self, tmp_path):
        proj = str(tmp_path / 'p')
        _batch(proj)
        write_batch_manifest(proj, 'output', '2026_09_02_10_00_00')
        with open(os.path.join(proj, 'output', '2026_09_02_10_00_00', 'ASW', 'SW-01.txt'), 'a') as f:
            f.write('tampered')
        r = verify_batch_manifest(proj, 'output', '2026_09_02_10_00_00')
        assert r['ok'] is False
        assert 'ASW/SW-01.txt' in r['hash_mismatch']

    def test_verify_missing_manifest(self, tmp_path):
        proj = str(tmp_path / 'p')
        _batch(proj)
        r = verify_batch_manifest(proj, 'output', '2026_09_02_10_00_00')
        assert r['ok'] is False
        assert 'manifest.json' in r['error']

    def test_read_manifest_roundtrip(self, tmp_path):
        proj = str(tmp_path / 'p')
        _batch(proj)
        write_batch_manifest(proj, 'output', '2026_09_02_10_00_00')
        m = read_batch_manifest(proj, 'output', '2026_09_02_10_00_00')
        assert m['batch']['project'] == 'p'

"""4.8.0（F8-3 / 48-c）设备库可移植导入/导出测试：JSON/zip 打包 + 合并/去重/冲突提示。"""
import json
import os
import tempfile
import zipfile

import pytest

try:
    from intent.device_library import (
        export_device_library,
        import_device_library,
        load_devices_from,
        DEVICE_LIBRARY_SCHEMA,
    )
    OK = True
except ImportError:  # pragma: no cover
    OK = False


def _sample_devices():
    return [
        {'id': 'h3c_s9827', 'vendor': 'H3C', 'model': 'S9827', 'port_count': 128},
        {'id': 'h3c_s6850_56hf', 'vendor': 'H3C', 'model': 'S6850-56HF', 'port_count': 48},
    ]


def _write_pkg(path, bundle, as_zip):
    if as_zip:
        with zipfile.ZipFile(path, 'w') as zf:
            zf.writestr('manifest.json', json.dumps(bundle, ensure_ascii=False, indent=2))
            zf.writestr('devices.json', json.dumps({'devices': bundle['devices']}, ensure_ascii=False, indent=2))
    else:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(bundle, f, ensure_ascii=False, indent=2)


@pytest.mark.skipif(not OK, reason='device_library 模块不可用')
class TestDeviceLibraryIO:
    def test_export_json_bundle(self, tmp_path):
        out = str(tmp_path / 'dev.json')
        bundle = export_device_library(out)
        assert bundle['schema'] == DEVICE_LIBRARY_SCHEMA
        assert bundle['version'] == 1
        assert bundle['count'] == len(bundle['devices']) > 0
        assert all(d.get('id') for d in bundle['devices'])
        saved = json.load(open(out, encoding='utf-8'))
        assert saved['schema'] == DEVICE_LIBRARY_SCHEMA

    def test_export_zip_bundle(self, tmp_path):
        out = str(tmp_path / 'dev.zip')
        bundle = export_device_library(out)
        assert os.path.exists(out)
        with zipfile.ZipFile(out) as zf:
            assert 'manifest.json' in zf.namelist()
            assert 'devices.json' in zf.namelist()
        with zipfile.ZipFile(out) as zf:
            m = json.loads(zf.read('manifest.json').decode('utf-8'))
        assert m['schema'] == DEVICE_LIBRARY_SCHEMA
        assert m['count'] == bundle['count']

    def test_import_new_added(self, tmp_path):
        target = str(tmp_path / 'lib.json')
        json.dump([], open(target, 'w', encoding='utf-8'))
        pkg = str(tmp_path / 'in.json')
        _write_pkg(pkg, {'schema': DEVICE_LIBRARY_SCHEMA, 'version': 1,
                         'count': 2, 'devices': _sample_devices()}, as_zip=False)
        r = import_device_library(pkg, target_path=target)
        assert len(r['added']) == 2 and r['updated'] == [] and r['skipped'] == []
        assert len(load_devices_from(target)) == 2

    def test_import_dedupe_and_conflict(self, tmp_path):
        target = str(tmp_path / 'lib.json')
        json.dump([{'id': 'h3c_s9827', 'vendor': 'H3C', 'model': 'S9827'}],
                  open(target, 'w', encoding='utf-8'))
        same = {'id': 'h3c_s9827', 'vendor': 'H3C', 'model': 'S9827'}
        diff = {'id': 'h3c_s9827', 'vendor': 'H3C', 'model': 'S9827-NEW'}
        pkg = str(tmp_path / 'in.json')
        _write_pkg(pkg, {'schema': DEVICE_LIBRARY_SCHEMA, 'version': 1, 'count': 2,
                         'devices': [same, diff]}, as_zip=False)
        r = import_device_library(pkg, target_path=target)
        # 同内容 → skipped 去重；同 id 不同内容 → updated（冲突提示）
        assert r['skipped'] == ['h3c_s9827']
        assert r['updated'] == ['h3c_s9827']
        assert r['conflicts'] == ['h3c_s9827']
        merged = load_devices_from(target)
        assert merged['h3c_s9827']['model'] == 'S9827-NEW'  # last-wins 覆盖

    def test_import_zip_and_invalid(self, tmp_path):
        target = str(tmp_path / 'lib.json')
        json.dump([], open(target, 'w', encoding='utf-8'))
        pkg = str(tmp_path / 'in.zip')
        _write_pkg(pkg, {'schema': DEVICE_LIBRARY_SCHEMA, 'version': 1,
                         'count': 1, 'devices': _sample_devices()[:1]}, as_zip=True)
        r = import_device_library(pkg, target_path=target)
        assert len(r['added']) == 1
        # 非法 schema
        bad = str(tmp_path / 'bad.json')
        _write_pkg(bad, {'schema': 'wrong', 'count': 0, 'devices': []}, as_zip=False)
        with pytest.raises(ValueError):
            import_device_library(bad, target_path=str(tmp_path / 't2.json'))

    def test_import_zip_slip_rejected(self, tmp_path):
        evil = str(tmp_path / 'evil.zip')
        with zipfile.ZipFile(evil, 'w') as zf:
            zf.writestr('manifest.json', json.dumps({'schema': DEVICE_LIBRARY_SCHEMA, 'devices': []}))
            zf.writestr('../evil.txt', 'x')
        with pytest.raises(ValueError):
            import_device_library(evil, target_path=str(tmp_path / 't.json'))
        assert not os.path.exists(os.path.join(str(tmp_path.parent), 'evil.txt'))

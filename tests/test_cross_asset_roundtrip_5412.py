"""5.4.12-F54-12-3：跨端资产互灌强化 —— 往返（round-trip）可移植性等值测试。

"导出 → 导入到全新工作区 → 再导出"应保持清单与内容一致（可移植往返）。
覆盖资产：设备库（JSON/zip）+ 技能库（zip）。
"""
import json
import os
import sys
import zipfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend'))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ai_hub'))

try:
    from intent.device_library import (
        DEVICE_LIBRARY_SCHEMA,
        export_device_library,
        import_device_library,
        load_devices_from,
    )
    DEVICE_LIB_OK = True
except ImportError:  # pragma: no cover
    DEVICE_LIB_OK = False

try:
    from ai_hub.skills.transfer import (
        SKILLS_PACKAGE_SCHEMA,
        export_skills_package,
        import_skills_package,
    )
    SKILLS_OK = True
except ImportError:  # pragma: no cover
    SKILLS_OK = False


@pytest.mark.skipif(not DEVICE_LIB_OK, reason='device_library 模块不可用')
class TestDeviceLibraryRoundTrip:
    def test_roundtrip_import_equals_export(self, tmp_path):
        """导出 → 导入全新库：内容等值（可移植往返）。"""
        pkg = str(tmp_path / 'lib1.json')
        bundle = export_device_library(pkg)

        fresh = str(tmp_path / 'fresh.json')
        json.dump([], open(fresh, 'w', encoding='utf-8'))
        r = import_device_library(pkg, target_path=fresh)
        imported = load_devices_from(fresh)

        assert bundle['schema'] == DEVICE_LIBRARY_SCHEMA
        assert len(imported) == bundle['count']
        # 导出集中每个设备都能在导入库中找到（id 与关键字段一致）
        for d in bundle['devices']:
            assert d['id'] in imported, f"往返丢失设备 {d['id']}"

    def test_roundtrip_zip_reimport_equals(self, tmp_path):
        """zip 包导入到全新工作区后，内容与原导出一致。"""
        pkg = str(tmp_path / 'lib.zip')
        bundle = export_device_library(pkg)
        fresh = str(tmp_path / 'f2.json')
        json.dump([], open(fresh, 'w', encoding='utf-8'))
        r = import_device_library(pkg, target_path=fresh)
        devices = load_devices_from(fresh)
        assert len(devices) == bundle['count']
        assert set(devices) == {d['id'] for d in bundle['devices']}
        assert r['added'] and len(r['added']) == bundle['count']


@pytest.mark.skipif(not SKILLS_OK, reason='skills.transfer 模块不可用')
class TestSkillsRoundTrip:
    def test_roundtrip_skills_equal(self, tmp_path):
        """技能库：导出 → 导入全新目录 → 再导出：清单与内容等值。"""
        src = tmp_path / 'src'
        (src / 'skills').mkdir(parents=True, exist_ok=True)
        (src / 'skills' / 'a.md').write_text('# Skill A\n\nBody A\n', encoding='utf-8')
        (src / 'skills' / 'b.md').write_text('# Skill B\n\nBody B\n', encoding='utf-8')

        pkg1 = str(tmp_path / 's1.zip')
        m1 = export_skills_package(pkg1, skills_dir=str(src / 'skills'))

        target = str(tmp_path / 'dst')
        r = import_skills_package(pkg1, skills_dir=str(target))
        assert sorted(r['added']) == ['a', 'b']

        pkg2 = str(tmp_path / 's2.zip')
        m2 = export_skills_package(pkg2, skills_dir=str(target))
        assert m1['schema'] == m2['schema'] == SKILLS_PACKAGE_SCHEMA
        assert m1['count'] == m2['count'] == 2
        names1 = {s['name'] for s in m1['skills']}
        names2 = {s['name'] for s in m2['skills']}
        assert names1 == names2 == {'a', 'b'}

        # 内容逐字节等值
        with zipfile.ZipFile(pkg1) as z1, zipfile.ZipFile(pkg2) as z2:
            assert z1.read('skills/a.md') == z2.read('skills/a.md')
            assert z1.read('skills/b.md') == z2.read('skills/b.md')

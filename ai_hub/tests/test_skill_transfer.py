"""4.8.0（F8-3 / 48-c）技能库文件级导入/导出测试：skills/*.md 打包 + 导入安装（合并/去重/冲突）。"""
import json
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest

from ai_hub.skills.transfer import (
    export_skills_package,
    import_skills_package,
    SKILLS_PACKAGE_SCHEMA,
)


def _make_skills_dir(root, entries):
    d = os.path.join(root, 'skills')
    os.makedirs(d, exist_ok=True)
    for name, content in entries.items():
        with open(os.path.join(d, name), 'w', encoding='utf-8') as f:
            f.write(content)
    return d


class TestSkillTransfer:
    def test_export_zip_bundle(self, tmp_path):
        skills_dir = _make_skills_dir(str(tmp_path), {'a.md': '# A', 'b.md': '# B'})
        out = str(tmp_path / 'skills.zip')
        manifest = export_skills_package(out, skills_dir=skills_dir)
        assert manifest['schema'] == SKILLS_PACKAGE_SCHEMA
        assert manifest['count'] == 2
        names = {s['name'] for s in manifest['skills']}
        assert names == {'a', 'b'}
        with zipfile.ZipFile(out) as zf:
            assert 'manifest.json' in zf.namelist()
            assert 'skills/a.md' in zf.namelist()
            assert 'skills/b.md' in zf.namelist()

    def test_export_includes_disabled_marker(self, tmp_path):
        d = _make_skills_dir(str(tmp_path), {'a.md': '# A'})
        with open(os.path.join(d, 'a.md.disabled'), 'w', encoding='utf-8') as f:
            f.write('')
        out = str(tmp_path / 's.zip')
        export_skills_package(out, skills_dir=d)
        with zipfile.ZipFile(out) as zf:
            assert 'skills/a.md.disabled' in zf.namelist()

    def test_import_new_and_skip(self, tmp_path):
        src = _make_skills_dir(str(tmp_path / 'src'), {'a.md': '# A'})
        pkg = str(tmp_path / 's.zip')
        export_skills_package(pkg, skills_dir=src)
        target = str(tmp_path / 'dst')
        r1 = import_skills_package(pkg, skills_dir=target)
        assert r1['added'] == ['a'] and r1['skipped'] == []
        assert os.path.exists(os.path.join(target, 'a.md'))
        r2 = import_skills_package(pkg, skills_dir=target)
        assert r2['skipped'] == ['a'] and r2['added'] == []

    def test_import_conflict_update(self, tmp_path):
        src = _make_skills_dir(str(tmp_path / 'src'), {'a.md': '# A v2'})
        pkg = str(tmp_path / 's.zip')
        export_skills_package(pkg, skills_dir=src)
        target = _make_skills_dir(str(tmp_path / 'dst'), {'a.md': '# A v1'})
        r = import_skills_package(pkg, skills_dir=target)
        assert r['updated'] == ['a'] and r['skipped'] == []
        with open(os.path.join(target, 'a.md'), encoding='utf-8') as f:
            assert f.read() == '# A v2'

    def test_import_restores_disabled_marker(self, tmp_path):
        d = _make_skills_dir(str(tmp_path / 'src'), {'a.md': '# A'})
        with open(os.path.join(d, 'a.md.disabled'), 'w', encoding='utf-8') as f:
            f.write('')
        pkg = str(tmp_path / 's.zip')
        export_skills_package(pkg, skills_dir=d)
        target = str(tmp_path / 'dst')
        import_skills_package(pkg, skills_dir=target)
        assert os.path.exists(os.path.join(target, 'a.md.disabled'))

    def test_import_invalid_and_zip_slip(self, tmp_path):
        # 非法 schema
        bad = str(tmp_path / 'bad.zip')
        with zipfile.ZipFile(bad, 'w') as zf:
            zf.writestr('manifest.json', json.dumps({'schema': 'wrong', 'skills': []}))
        with pytest.raises(ValueError):
            import_skills_package(bad, skills_dir=str(tmp_path / 't'))
        # zip-slip
        evil = str(tmp_path / 'evil.zip')
        with zipfile.ZipFile(evil, 'w') as zf:
            zf.writestr('manifest.json', json.dumps({'schema': SKILLS_PACKAGE_SCHEMA, 'skills': []}))
            zf.writestr('../evil.txt', 'x')
        with pytest.raises(ValueError):
            import_skills_package(evil, skills_dir=str(tmp_path / 't2'))
        assert not os.path.exists(os.path.join(str(tmp_path), 'evil.txt'))

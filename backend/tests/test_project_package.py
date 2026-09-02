"""4.8.0（F8-1 / 48-a）项目包往返测试：导出可移植项目包 + 按身份导入（skip/update/new）。

覆盖：
  - 导出包含 manifest.json（schema/version/projectId/文件清单+sha256）+ 排除运行时目录
  - 导入按 manifest.projectId 匹配既有项目：同内容 → skip；不同 → update 回原目录；未命中 → new（冲突加后缀）
  - 字节级幂等（导出→导入→再导入 同包 → skip，且项目目录 sha256 稳定）
  - zip-slip 防护（恶意条目整体拒绝）
"""
import hashlib
import json
import os
import shutil
import zipfile

import pytest

sys_path_ok = True
try:
    from intent.planner.project_package import (
        build_manifest,
        export_project_package,
        import_project_package,
        read_package_manifest,
        collect_project_files,
    )
except ImportError:  # pragma: no cover
    sys_path_ok = False


def _snapshot(d):
    out = {}
    for root, _, files in os.walk(d):
        for f in files:
            p = os.path.join(root, f)
            out[os.path.relpath(p, d).replace(os.sep, '/')] = hashlib.sha256(
                open(p, 'rb').read()).hexdigest()
    return out


def _make_project(project_dir, name='site-a', extra=''):
    os.makedirs(os.path.join(project_dir, 'excel'), exist_ok=True)
    os.makedirs(os.path.join(project_dir, 'templates'), exist_ok=True)
    os.makedirs(os.path.join(project_dir, 'output', '2026_09_02_10_00_00'), exist_ok=True)
    with open(os.path.join(project_dir, 'para.xlsx'), 'wb') as f:
        f.write(b'PARA')
    with open(os.path.join(project_dir, 'excel', 'hostname.xlsx'), 'wb') as f:
        f.write(b'HOST')
    with open(os.path.join(project_dir, 'templates', 'ASW.j2'), 'w', encoding='utf-8') as f:
        f.write('hostname {{ info["设备名"] }}\n' + extra)
    with open(os.path.join(project_dir, 'output', '2026_09_02_10_00_00', 'conf.txt'), 'w') as f:
        f.write('runtime')
    with open(os.path.join(project_dir, 'template.meta.json'), 'w', encoding='utf-8') as f:
        json.dump({'name': name}, f, ensure_ascii=False)
    return project_dir


def _run(fn, *a, **kw):
    if not sys_path_ok:
        pytest.skip('project_package 模块不可用')
    return fn(*a, **kw)


@pytest.fixture(autouse=True)
def _require_module():
    if not sys_path_ok:
        pytest.skip('project_package 模块不可用')


class TestExport:
    def test_export_builds_manifest_with_hashes(self, tmp_path):
        proj = _make_project(str(tmp_path / 'src'))
        manifest = _run(build_manifest, proj)
        assert manifest['schema'] == 'mc.project-package/1'
        assert manifest['version'] == 1
        assert manifest['kind'] == 'project-package'
        assert manifest['projectId']
        paths = {f['path'] for f in manifest['files']}
        assert 'para.xlsx' in paths
        assert 'excel/hostname.xlsx' in paths
        assert 'templates/ASW.j2' in paths
        assert 'template.meta.json' in paths
        # 运行时目录被排除
        assert not any(p.startswith('output/') for p in paths)
        entry = next(f for f in manifest['files'] if f['path'] == 'para.xlsx')
        assert entry['size'] == 4
        assert entry['sha256'] == hashlib.sha256(b'PARA').hexdigest()
        assert manifest['summary']['file_count'] == len(manifest['files'])

    def test_export_zip_contains_manifest_and_files(self, tmp_path):
        proj = _make_project(str(tmp_path / 'src'))
        out = str(tmp_path / 'pkg.zip')
        manifest = _run(export_project_package, proj, out)
        assert os.path.exists(out)
        with zipfile.ZipFile(out) as zf:
            assert 'manifest.json' in zf.namelist()
            assert 'templates/ASW.j2' in zf.namelist()
            assert not any(n.startswith('output/') for n in zf.namelist())
        reread = _run(read_package_manifest, out)
        assert reread['projectId'] == manifest['projectId']

    def test_identity_is_stable_after_export(self, tmp_path):
        proj = _make_project(str(tmp_path / 'src'))
        m1 = _run(build_manifest, proj)
        m2 = _run(build_manifest, proj)
        assert m1['projectId'] == m2['projectId']  # 身份一致性（持久化于 template.meta.json）

    def test_zip_slip_rejected(self, tmp_path):
        evil = str(tmp_path / 'evil.zip')
        with zipfile.ZipFile(evil, 'w') as zf:
            zf.writestr('manifest.json', json.dumps({'schema': 'mc.project-package/1'}))
            zf.writestr('../evil.txt', 'x')
        with pytest.raises(ValueError):
            _run(import_project_package, evil, str(tmp_path / 'ws'))
        assert not os.path.exists(os.path.join(str(tmp_path), 'evil.txt'))


class TestImport:
    def test_import_new(self, tmp_path):
        src = _make_project(str(tmp_path / 'src'))
        pkg = str(tmp_path / 'pkg.zip')
        manifest = _run(export_project_package, src, pkg)
        ws = str(tmp_path / 'ws')
        os.makedirs(ws)
        r = _run(import_project_package, pkg, ws)
        assert r['matched'] == 'new' and r['ok'] is True
        proj = r['project_dir']
        for f in ('para.xlsx', 'excel/hostname.xlsx', 'templates/ASW.j2', 'template.meta.json'):
            assert os.path.exists(os.path.join(proj, f)), f
        # 运行时产物不入包
        assert not os.path.exists(os.path.join(proj, 'output'))
        assert r['projectId'] == manifest['projectId']

    def test_import_new_conflict_suffix(self, tmp_path):
        src = _make_project(str(tmp_path / 'src'))
        pkg = str(tmp_path / 'pkg.zip')
        _run(export_project_package, src, pkg)
        ws = str(tmp_path / 'ws')
        os.makedirs(os.path.join(ws, 'site-a'), exist_ok=True)  # 占位同名
        r = _run(import_project_package, pkg, ws)
        assert r['matched'] == 'new'
        assert os.path.basename(r['project_dir']).startswith('site-a-')

    def test_import_skip_same_content(self, tmp_path):
        src = _make_project(str(tmp_path / 'src'))
        pkg = str(tmp_path / 'pkg.zip')
        manifest = _run(export_project_package, src, pkg)
        ws = str(tmp_path / 'ws')
        os.makedirs(ws)
        r1 = _run(import_project_package, pkg, ws)
        r2 = _run(import_project_package, pkg, ws)
        assert r1['matched'] == 'new'
        assert r2['matched'] == 'skip'
        assert r2['changed'] is False
        assert _snapshot(r1['project_dir']) == _snapshot(r2['project_dir'])

    def test_import_update_returns_to_original_dir(self, tmp_path):
        src = _make_project(str(tmp_path / 'src'))
        pkg = str(tmp_path / 'pkg.zip')
        _run(export_project_package, src, pkg)
        ws = str(tmp_path / 'ws')
        os.makedirs(ws)
        r1 = _run(import_project_package, pkg, ws)
        # 源项目变更 → 重新导出 → 再导入 → update 回原目录
        with open(os.path.join(src, 'templates', 'ASW.j2'), 'a', encoding='utf-8') as f:
            f.write('ip route 0.0.0.0\n')
        pkg2 = str(tmp_path / 'pkg2.zip')
        _run(export_project_package, src, pkg2)
        r2 = _run(import_project_package, pkg2, ws)
        assert r2['matched'] == 'update'
        assert r2['project_dir'] == r1['project_dir']  # 更新回原目录
        content = open(os.path.join(r2['project_dir'], 'templates', 'ASW.j2'), encoding='utf-8').read()
        assert 'ip route 0.0.0.0' in content

    def test_roundtrip_byte_idempotent(self, tmp_path):
        """导出→导入→（再导出→再导入）→ 项目目录字节级幂等（sha256 比对）。"""
        src = _make_project(str(tmp_path / 'src'))
        pkg = str(tmp_path / 'pkg.zip')
        _run(export_project_package, src, pkg)
        ws = str(tmp_path / 'ws')
        os.makedirs(ws)
        r1 = _run(import_project_package, pkg, ws)
        snap1 = _snapshot(r1['project_dir'])

        pkg2 = str(tmp_path / 'pkg2.zip')
        _run(export_project_package, r1['project_dir'], pkg2)
        r2 = _run(import_project_package, pkg2, ws)
        assert r2['matched'] == 'skip'
        assert _snapshot(r2['project_dir']) == snap1

    def test_identity_from_origin_project_id(self, tmp_path):
        """AL 导入过的项目（template.meta.json 含 originProjectId）导出后身份沿用 originProjectId。"""
        proj = _make_project(str(tmp_path / 'src'))
        meta_path = os.path.join(proj, 'template.meta.json')
        meta = json.load(open(meta_path, encoding='utf-8'))
        meta['originProjectId'] = 'al-pid-123'
        json.dump(meta, open(meta_path, 'w', encoding='utf-8'), ensure_ascii=False)
        manifest = _run(build_manifest, proj)
        assert manifest['projectId'] == 'al-pid-123'

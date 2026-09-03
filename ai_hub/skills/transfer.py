"""4.8.0（F8-3 / 48-c）技能库文件级导入/导出：skills/*.md 打包 + 导入安装。

5.0.3-503-b 升级：技能包支持技能级元数据（反馈统计/修订版本）——
- 导出：manifest 每条目携带可选 meta（feedback/revision）+ 打包 skills/<name>.meta.json
- 版本兼容：schema 保持 'mc.skills/1'（读旧包不破坏），manifest.version 升为 2；
  导入同时接受 'mc.skills/1' / 'mc.skills/2'（旧包无 meta 照常安装，新包还原 meta）。

- 导出：zip = manifest.json（schema/version/条目清单 name+sha256[+meta]）+ skills/*.md（含 .disabled 标记）
- 导入：zip-slip 防护解包 → 逐个安装（同内容 skipped / 新 added / 不同 updated），
  保留 .disabled 标记恢复启用状态；还原伴生 meta 文件。
测试注入 skills_dir 指向临时目录，避免触碰真实技能库。
"""
import hashlib
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

SKILLS_PACKAGE_SCHEMA = 'mc.skills/1'
SKILLS_PACKAGE_SCHEMA_V2 = 'mc.skills/2'
SKILLS_PACKAGE_VERSION = 2


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def _read_meta(base: Path, stem: str) -> dict | None:
    """读取技能伴生 meta（.meta.json）；缺失/损坏返回 None。"""
    meta_path = base / f'{stem}.meta.json'
    if not meta_path.exists():
        return None
    try:
        data = json.loads(meta_path.read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else None
    except (ValueError, OSError):
        return None


def export_skills_package(out_path: str, skills_dir: str | None = None) -> dict:
    """打包 skills/*.md（含 .disabled 标记 + 伴生 meta）为可移植 zip，返回 manifest。"""
    base = Path(skills_dir) if skills_dir else Path(__file__).parent / 'skills'
    items = []
    if base.exists():
        for md in sorted(base.glob('*.md')):
            content = md.read_text(encoding='utf-8')
            entry = {'name': md.stem, 'sha256': _sha(content)}
            # 5.0.3-503-b：技能级元数据（反馈统计/修订版本）随包导出
            meta = _read_meta(base, md.stem)
            if meta is not None:
                entry['meta'] = meta
            items.append(entry)
    manifest = {
        'schema': SKILLS_PACKAGE_SCHEMA,
        'version': SKILLS_PACKAGE_VERSION,
        'kind': 'skills',
        'count': len(items),
        'skills': items,
    }
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        if base.exists():
            for md in sorted(base.glob('*.md')):
                zf.write(str(md), f'skills/{md.name}')
            for marker in sorted(base.glob('*.md.disabled')):
                zf.write(str(marker), f'skills/{marker.name}')
            # 5.0.3-503-b：打包伴生 meta（存在才写，旧包无 meta 兼容）
            for meta in sorted(base.glob('*.meta.json')):
                zf.write(str(meta), f'skills/{meta.name}')
    return manifest


def _extract_safe(zf: zipfile.ZipFile, dest_dir: str) -> None:
    """zip-slip 防护：绝对路径 / .. 穿越整体拒绝。"""
    dest_abs = os.path.abspath(dest_dir)
    for member in zf.infolist():
        name = member.filename.replace('\\', '/')
        if name.startswith('/') or (len(name) > 1 and name[1] == ':') or '..' in name.split('/'):
            raise ValueError(f'技能包条目含不安全路径: {member.filename}')
    zf.extractall(dest_abs)


def import_skills_package(package_path: str, skills_dir: str | None = None) -> dict:
    """导入技能包并安装到技能目录（合并/去重/冲突 + 还原 meta）。返回报告。"""
    base = Path(skills_dir) if skills_dir else Path(__file__).parent / 'skills'
    tmp = tempfile.mkdtemp(prefix='mc_skills_')
    try:
        with zipfile.ZipFile(package_path) as zf:
            names = zf.namelist()
            if 'manifest.json' not in names:
                raise ValueError('技能包缺少 manifest.json')
            try:
                manifest = json.loads(zf.read('manifest.json').decode('utf-8'))
            except ValueError as e:
                raise ValueError(f'技能包 manifest 无效: {e}')
            # 版本兼容：mc.skills/1（旧包）与 mc.skills/2（新包）均接受；其余拒绝
            if manifest.get('schema') not in (SKILLS_PACKAGE_SCHEMA, SKILLS_PACKAGE_SCHEMA_V2):
                raise ValueError(f'技能包 schema 不受支持: {manifest.get("schema")}')
            _extract_safe(zf, tmp)

        base.mkdir(parents=True, exist_ok=True)
        added, updated, skipped = [], [], []
        skills_root = Path(tmp) / 'skills'
        if skills_root.exists():
            for md in sorted(skills_root.glob('*.md')):
                name = md.stem
                content = md.read_text(encoding='utf-8')
                target = base / md.name
                exists = target.exists()
                if exists and target.read_text(encoding='utf-8') == content:
                    skipped.append(name)
                else:
                    target.write_text(content, encoding='utf-8')
                    (updated if exists else added).append(name)
                # 恢复 .disabled 标记（保留启用状态）
                marker = Path(str(md) + '.disabled')
                if marker.exists():
                    (Path(str(target) + '.disabled')).write_text('', encoding='utf-8')
                else:
                    dead = Path(str(target) + '.disabled')
                    if dead.exists():
                        dead.unlink()
                # 5.0.3-503-b：还原伴生 meta（反馈统计/修订版本）
                src_meta = skills_root / f'{name}.meta.json'
                if src_meta.exists():
                    meta_bytes = src_meta.read_bytes()
                    dst_meta = base / f'{name}.meta.json'
                    if not dst_meta.exists() or dst_meta.read_bytes() != meta_bytes:
                        dst_meta.write_bytes(meta_bytes)
        return {
            'ok': True,
            'schema': SKILLS_PACKAGE_SCHEMA,
            'version': SKILLS_PACKAGE_VERSION,
            'total': len(manifest.get('skills', [])),
            'added': added,
            'updated': updated,
            'skipped': skipped,
            'target': str(base),
        }
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

"""4.8.0（F8-1 / 48-a）项目包往返：导出为可移植项目包 + 按身份导入（skip/update/new）。

背景：普通 MC 项目（非 AL 导入）此前无文件级导入导出；本模块提供：
  - 导出：把项目配置/模板/参数文件打包 zip（顶层 manifest.json 含 schema/version/projectId/
    文件清单+sha256），排除运行时产物（output/yaml/label/历史/备份等）。
  - 身份：projectId = template.meta.json.originProjectId（AL 溯源）→ projectId 字段 →
    否则生成并持久化 UUID（身份一致性，重复导出稳定）。
  - 导入：按 manifest.projectId 匹配既有项目（复用 find_mc_project_by_origin 思路，另扫
    projectId 字段）→ 同内容 → skip / 不同 → update 回原目录 / 未命中 → new（冲突加后缀）。
  - 安全：zip-slip 逐条目防护（整体拒绝），与 backend/main.py _safe_extract_zip 同策略。
"""
import datetime
import hashlib
import json
import os
import re
import shutil
import tempfile
import uuid
import zipfile

from .plantable_importer import invalidate_origin_index

PACKAGE_SCHEMA = 'mc.project-package/1'
PACKAGE_VERSION = 1

# 排除运行时/派生目录（不参与打包）
EXCLUDE_TOP_DIRS = {
    'output', 'output-sn', 'yaml', 'yaml-sn',
    'output-label', 'output-label-md', 'output-label-pdf',
    '.mc_history', '.mc_backups', '.template_history', '.output_backups',
    '.render_cache', 'snippets', '__pycache__',
}


def _read_json(path, default=None):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _now_utc() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def _keep_dir(name: str) -> bool:
    return not name.startswith('.') and name not in EXCLUDE_TOP_DIRS and name != '__pycache__'


def collect_project_files(project_dir: str) -> list:
    """项目配置/模板/参数文件清单（排除运行时目录），按相对路径排序。"""
    out = []
    for root, dirs, files in os.walk(project_dir):
        dirs[:] = [d for d in dirs if _keep_dir(d)]
        for f in sorted(files):
            if f == 'manifest.json':
                continue
            p = os.path.join(root, f)
            rel = os.path.relpath(p, project_dir).replace(os.sep, '/')
            out.append({'path': rel, 'size': os.path.getsize(p), 'sha256': file_sha256(p)})
    out.sort(key=lambda x: x['path'])
    return out


def resolve_identity(project_dir: str) -> str:
    """项目身份：originProjectId（AL 溯源）→ projectId → 生成并持久化 UUID（身份一致性）。"""
    meta_path = os.path.join(project_dir, 'template.meta.json')
    meta = _read_json(meta_path, {}) or {}
    for key in ('originProjectId', 'projectId'):
        if meta.get(key):
            return str(meta[key])
    pid = str(uuid.uuid4())
    meta = dict(meta)
    meta['projectId'] = pid
    _write_json(meta_path, meta)
    return pid


def build_manifest(project_dir: str) -> dict:
    """构造项目包 manifest（顶层：schema/version/projectId/文件清单+sha256+统计）。"""
    project_id = resolve_identity(project_dir)
    files = collect_project_files(project_dir)
    meta = _read_json(os.path.join(project_dir, 'template.meta.json'), {}) or {}
    project_name = (meta.get('name') or os.path.basename(project_dir.rstrip('/\\'))).strip()
    return {
        'schema': PACKAGE_SCHEMA,
        'version': PACKAGE_VERSION,
        'kind': 'project-package',
        'projectId': project_id,
        'projectName': project_name,
        'exportedAt': _now_utc(),
        'files': files,
        'summary': {'file_count': len(files), 'total_bytes': sum(f['size'] for f in files)},
    }


def export_project_package(project_dir: str, out_zip_path: str) -> dict:
    """导出可移植项目包（zip：manifest.json + 项目文件）。返回 manifest。"""
    manifest = build_manifest(project_dir)
    os.makedirs(os.path.dirname(os.path.abspath(out_zip_path)), exist_ok=True)
    with zipfile.ZipFile(out_zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        for f in manifest['files']:
            zf.write(os.path.join(project_dir, f['path']), f['path'])
    return manifest


def _extract_safe(zf: zipfile.ZipFile, dest_dir: str) -> None:
    """zip-slip 防护：逐条目校验，绝对路径 / .. 穿越整体拒绝（与 backend/main.py 同策略）。"""
    dest_abs = os.path.abspath(dest_dir)
    for member in zf.infolist():
        name = member.filename.replace('\\', '/')
        if name.startswith('/') or (len(name) > 1 and name[1] == ':'):
            raise ValueError(f'项目包条目含绝对路径: {member.filename}')
        if '..' in name.split('/'):
            raise ValueError(f'项目包条目含路径穿越: {member.filename}')
    zf.extractall(dest_abs)


def read_package_manifest(package_path: str) -> dict:
    """读取项目包顶层 manifest.json 并校验 schema。"""
    with zipfile.ZipFile(package_path) as zf:
        if 'manifest.json' not in zf.namelist():
            raise ValueError('项目包缺少 manifest.json')
        try:
            data = json.loads(zf.read('manifest.json').decode('utf-8'))
        except ValueError as e:
            raise ValueError(f'项目包 manifest 无效: {e}')
    if data.get('schema') != PACKAGE_SCHEMA:
        raise ValueError(f'项目包 schema 不受支持: {data.get("schema")}')
    return data


def find_project_by_identity(project_id: str, workspace_dir: str) -> str | None:
    """复用 find_mc_project_by_origin 思路：扫 workspace 各项目 template.meta.json，
    匹配 originProjectId 或 projectId == project_id，返回目录名或 None。"""
    if not project_id or not workspace_dir or not os.path.isdir(workspace_dir):
        return None
    for name in sorted(os.listdir(workspace_dir)):
        proj_dir = os.path.join(workspace_dir, name)
        if not os.path.isdir(proj_dir):
            continue
        meta = _read_json(os.path.join(proj_dir, 'template.meta.json'), {}) or {}
        if str(meta.get('originProjectId', '')) == project_id or str(meta.get('projectId', '')) == project_id:
            return name
    return None


def _clean_project_name(raw: str) -> str:
    base = re.sub(r'[^\w一-鿿.\-]', '_', (raw or '')).strip('._')
    return base or 'imported_project'


def _same_content(existing_name: str, manifest: dict, workspace_dir: str) -> bool:
    """已有项目与包内容一致（逐文件 size+sha256 比对）。"""
    base = os.path.join(workspace_dir, existing_name)
    for f in manifest.get('files', []):
        p = os.path.join(base, f['path'])
        if not os.path.exists(p) or os.path.getsize(p) != f.get('size'):
            return False
        if file_sha256(p) != f.get('sha256'):
            return False
    return True


def import_project_package(package_path: str, workspace_dir: str,
                           explicit_dir: str | None = None) -> dict:
    """按 manifest.projectId 导入项目包。

    - 命中且同内容 → skip（不重写）
    - 命中且内容不同 → update 回原目录
    - 未命中 → new（目录默认 manifest.projectName，冲突加后缀）
    返回 GUI 摘要 dict（ok/matched/name/project_dir/projectId/file_count/changed）。
    """
    manifest = read_package_manifest(package_path)
    project_id = manifest.get('projectId', '')
    existing = find_project_by_identity(project_id, workspace_dir) if project_id else None
    target = (os.path.join(workspace_dir, existing) if existing
              else (explicit_dir or os.path.join(workspace_dir, _clean_project_name(manifest.get('projectName', '')))))
    name = os.path.basename(target.rstrip('/\\'))

    tmp = tempfile.mkdtemp(prefix='mc_pkg_')
    try:
        with zipfile.ZipFile(package_path) as zf:
            _extract_safe(zf, tmp)

        if existing and _same_content(existing, manifest, workspace_dir):
            return {'ok': True, 'matched': 'skip', 'name': name, 'project_dir': target,
                    'projectId': project_id, 'file_count': len(manifest.get('files', [])),
                    'changed': False}

        # 未命中且目标目录被占用 → 冲突加后缀
        if not existing:
            base = target
            n = 2
            while os.path.exists(base):
                base = os.path.join(workspace_dir, f'{name}-{n}')
                n += 1
            target = base
            name = os.path.basename(target.rstrip('/\\'))

        os.makedirs(target, exist_ok=True)
        for f in manifest.get('files', []):
            rel = f['path']
            src = os.path.join(tmp, rel)
            if not os.path.exists(src):
                continue
            dst = os.path.join(target, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)

        matched = 'update' if existing else 'new'
        if matched == 'new':
            invalidate_origin_index(workspace_dir)
        return {'ok': True, 'matched': matched, 'name': name, 'project_dir': target,
                'projectId': project_id, 'file_count': len(manifest.get('files', [])),
                'changed': True}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

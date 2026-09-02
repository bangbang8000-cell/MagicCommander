"""4.8.0（F8-5 / 48-e）交付物清单与校验：渲染批次 output/{timestamp}/manifest.json。

- write_batch_manifest：渲染后生成批次清单（schema + 批次信息 + 逐文件 name/size/sha256 + 统计 +
  render_hash 强哈希，参考 scripts/gen_golden.py 的 batch_manifest + render_hash 模式）。
- verify_batch_manifest：重算比对 → 缺失 / 哈希不符 / 漂移（清单外多余文件）→ 结构化报告。
manifest.json 不列入自身清单（避免自引用）。
"""
import hashlib
import json
import os

RENDER_MANIFEST_SCHEMA = 'mc.render-manifest/1'
RENDER_MANIFEST_VERSION = 1

MANIFEST_FILE = 'manifest.json'


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def latest_batch_dir(project_dir: str, output_name: str = 'output') -> str | None:
    """最新渲染批次目录（output/{timestamp}/）或 None。"""
    base = os.path.join(project_dir, output_name)
    if not os.path.isdir(base):
        return None
    ts = sorted(os.listdir(base))
    if not ts:
        return None
    return os.path.join(base, ts[-1])


def resolve_batch_dir(project_dir: str, output_name: str = 'output',
                      time_str: str | None = None) -> str | None:
    if time_str:
        d = os.path.join(project_dir, output_name, time_str)
        return d if os.path.isdir(d) else None
    return latest_batch_dir(project_dir, output_name)


def _collect_files(batch_dir: str) -> list:
    """批次内文件清单（排除 manifest.json 自身）。"""
    out = []
    for root, _, files in os.walk(batch_dir):
        for f in sorted(files):
            if f == MANIFEST_FILE:
                continue
            p = os.path.join(root, f)
            rel = os.path.relpath(p, batch_dir).replace(os.sep, '/')
            out.append({'path': rel, 'name': f, 'size': os.path.getsize(p), 'sha256': file_sha256(p)})
    out.sort(key=lambda x: x['path'])
    return out


def _render_hash(files: list) -> str:
    payload = json.dumps([{'path': f['path'], 'sha256': f['sha256']} for f in files],
                         ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()[:16]


def write_batch_manifest(project_dir: str, output_name: str = 'output',
                         time_str: str | None = None) -> dict | None:
    """渲染批次生成/刷新 manifest.json。返回 manifest 或 None（批次目录不存在）。"""
    batch_dir = resolve_batch_dir(project_dir, output_name, time_str)
    if not batch_dir or not os.path.isdir(batch_dir):
        return None
    files = _collect_files(batch_dir)
    manifest = {
        'schema': RENDER_MANIFEST_SCHEMA,
        'version': RENDER_MANIFEST_VERSION,
        'kind': 'render-manifest',
        'batch': {
            'project': os.path.basename(project_dir.rstrip('/\\')),
            'output_name': output_name,
            'rendered_at': os.path.basename(batch_dir.rstrip('/\\')),
        },
        'files': files,
        'summary': {
            'file_count': len(files),
            'total_bytes': sum(f['size'] for f in files),
            'render_hash': _render_hash(files),
        },
    }
    with open(os.path.join(batch_dir, MANIFEST_FILE), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    return manifest


def read_batch_manifest(project_dir: str, output_name: str = 'output',
                        time_str: str | None = None) -> dict | None:
    """读取批次 manifest；不存在 → None。"""
    batch_dir = resolve_batch_dir(project_dir, output_name, time_str)
    if not batch_dir:
        return None
    manifest_path = os.path.join(batch_dir, MANIFEST_FILE)
    if not os.path.exists(manifest_path):
        return None
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def verify_batch_manifest(project_dir: str, output_name: str = 'output',
                          time_str: str | None = None) -> dict:
    """校验批次产物完整性：缺失 / 哈希不符 / 漂移（清单外多余文件）→ 结构化报告。"""
    batch_dir = resolve_batch_dir(project_dir, output_name, time_str)
    if not batch_dir:
        return {'ok': False, 'error': f'无渲染批次目录（{output_name}）', 'rendered_at': '',
                'missing': [], 'hash_mismatch': [], 'drifted': [], 'summary': {}}
    rendered_at = os.path.basename(batch_dir.rstrip('/\\'))
    manifest = read_batch_manifest(project_dir, output_name, time_str)
    if manifest is None:
        return {'ok': False, 'error': f'批次缺少 manifest.json: {rendered_at}',
                'rendered_at': rendered_at, 'missing': [], 'hash_mismatch': [], 'drifted': [],
                'summary': {}}
    missing, hash_mismatch = [], []
    for f in manifest.get('files', []):
        p = os.path.join(batch_dir, f['path'])
        if not os.path.exists(p):
            missing.append(f['path'])
        elif file_sha256(p) != f.get('sha256'):
            hash_mismatch.append(f['path'])
    known = {f['path'] for f in manifest.get('files', [])}
    actual = {f['path'] for f in _collect_files(batch_dir)}
    drifted = sorted(actual - known)
    return {
        'ok': not missing and not hash_mismatch and not drifted,
        'rendered_at': rendered_at,
        'missing': missing,
        'hash_mismatch': hash_mismatch,
        'drifted': drifted,
        'summary': manifest.get('summary', {}),
    }

"""MagicCommander 渲染 golden 基线工具（4.0.0-F0-1，对齐 AL scripts/gen_golden.py）

MC 无 AL 的拓扑引擎，故按 PRD 决策「对渲染配置文本/批次清单做 hash 基线」：
对 example/ 模板库（示例项目）逐个 dry-run 渲染，产出一份确定性快照：
  - 批次清单（project/device/role/filename + 每文件内容 sha256）
  - device_count
  - render_hash（规范化「filename+content」强哈希，任何渲染变化即触发差异）

注意：后端 config.py 在导入时读取 MC_WORKSPACE，故全程使用单一临时 workspace，
避免模块缓存导致 workspace 漂移。

用法：
  python scripts/gen_golden.py             # 生成基线到 tests/golden/
  python scripts/gen_golden.py --check     # 重新生成并与基线比对（CI 门禁，差异即失败）
  python scripts/gen_golden.py --list      # 仅列出 golden 项目
"""
import hashlib
import json
import logging
import os
import shutil
import sys
import tempfile

# 让 backend 可导入（脚本位于 scripts/，后端在 backend/）
BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

base = os.path.join(REPO, 'example')
golden_dir = os.path.join(REPO, 'tests', 'golden')


def _discover_templates():
    """自动发现 example/ 下的模板项目（含 templates/*.j2 或 para.xlsx）"""
    if not os.path.isdir(base):
        return []
    return sorted(
        name
        for name in os.listdir(base)
        if os.path.isdir(os.path.join(base, name))
        and not name.startswith(('.', '_'))
        and (
            os.path.isdir(os.path.join(base, name, 'templates'))
            or os.path.exists(os.path.join(base, name, 'para.xlsx'))
        )
    )


class _Renderer:
    """单进程单 workspace 渲染器：导入一次 backend，全部项目共享同一临时 workspace。"""

    def __init__(self, tmpdir):
        self.tmpdir = tmpdir
        os.environ['MC_WORKSPACE'] = tmpdir
        sys.path.insert(0, BACKEND)
        # 屏蔽后端 INFO 日志（批量渲染会逐项目打日志，golden 不需要）
        logging.getLogger('magiccommander').setLevel(logging.ERROR)

    def prepare(self, project_names):
        import pandas as pd
        for name in project_names:
            shutil.copytree(os.path.join(base, name), os.path.join(self.tmpdir, name))
        pd.DataFrame({'项目名称': project_names}).to_excel(
            os.path.join(self.tmpdir, 'MC_Para.xlsx'), sheet_name='项目名称', index=False, header=True)

    def render_all(self, project_names):
        """批量 dry-run 渲染，返回 {project: [results]}。"""
        import io
        import contextlib
        from pre_processing import PreProcessing
        logging.getLogger().setLevel(logging.ERROR)  # 屏蔽后端 INFO（pre_processing 日志器）

        p = PreProcessing()
        p.read_MC_para('MC_Para.xlsx')
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            p.execute_dry_run('all', 'device_name')

        last = None
        for line in buf.getvalue().splitlines():
            line = line.strip()
            if line.startswith('{'):
                try:
                    last = json.loads(line)
                except (ValueError, TypeError):
                    continue
        if not last or last.get('status') != 'complete':
            raise RuntimeError(f'dry-run 渲染失败: {str(last)[:500]}')

        grouped: dict = {}
        for r in (last.get('data') or {}).get('results') or []:
            grouped.setdefault(r.get('project', ''), []).append(r)
        for name in project_names:
            grouped.setdefault(name, [])
        return grouped


def _file_sha(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]


def _snapshot(project, results):
    """渲染产物 → 确定性 golden 快照（批次清单 + 强哈希）。"""
    items = sorted(
        (r.get('device', ''), r.get('role', ''), r.get('filename', ''), r.get('content', ''))
        for r in results
    )
    manifest = [
        {'device': d, 'role': r, 'filename': f, 'sha256': _file_sha(c)}
        for (d, r, f, c) in items
    ]
    payload = json.dumps(
        [{'filename': f, 'content': c} for (_, _, f, c) in items],
        ensure_ascii=False, sort_keys=True,
    )
    return {
        'source': f'example/{project}',
        'device_count': len(items),
        'batch_manifest': manifest,
        'render_hash': hashlib.sha256(payload.encode('utf-8')).hexdigest()[:16],
    }


def main():
    check = '--check' in sys.argv
    only_list = '--list' in sys.argv

    templates = _discover_templates()
    if only_list:
        print(f'golden 项目（{len(templates)}）：{", ".join(templates) or "无"}')
        return 0

    os.makedirs(golden_dir, exist_ok=True)
    snapshots: dict = {}
    tmpdir = tempfile.mkdtemp(prefix='mc_golden_')
    try:
        renderer = _Renderer(tmpdir)
        renderer.prepare(templates)
        try:
            grouped = renderer.render_all(templates)
            for t in templates:
                snapshots[t] = _snapshot(t, grouped.get(t, []))
        except Exception as e:  # 渲染失败也记录快照（error），便于基线覆盖失败态
            for t in templates:
                snapshots[t] = {'source': f'example/{t}', 'error': f'{type(e).__name__}: {e}', 'render_hash': 'error'}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    diffs = []
    generated = 0
    for t in templates:
        snap = snapshots[t]
        gf = os.path.join(golden_dir, t + '.json')
        if check:
            if not os.path.exists(gf):
                diffs.append(f'{t}: 缺少基线文件 {gf}')
                continue
            with open(gf, encoding='utf-8') as f:
                expected = json.load(f)
            if snap != expected:
                diffs.append(
                    f'{t}: 与基线不一致\n'
                    f'    基线: {json.dumps(expected, ensure_ascii=False)}\n'
                    f'    当前: {json.dumps(snap, ensure_ascii=False)}')
        else:
            with open(gf, 'w', encoding='utf-8') as f:
                json.dump(snap, f, ensure_ascii=False, indent=2, sort_keys=True)
            generated += 1

    if check:
        if diffs:
            print(f'golden --check 失败（{len(diffs)} 项差异）：')
            for d in diffs:
                print(f'  - {d}')
            sys.exit(1)
        ok = sum(1 for t in templates if os.path.exists(os.path.join(golden_dir, t + '.json')))
        print(f'golden --check 通过：{ok}/{len(templates)} 模板与基线一致（渲染文本/批次清单 hash 基线）')
    else:
        print(f'golden 基线生成完成：{generated} 个模板写入 {golden_dir}')
        if not templates:
            print('（example/ 下未发现模板项目）')


if __name__ == '__main__':
    main()

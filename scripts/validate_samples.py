"""4.9.0（49-d）：示例资产自动化验收（AIDC 四示例 × 打开/渲染/导出/回灌 + golden 确定性）

对 example/ 下 4 个 AIDC 示例（64H100-IB / 64H100-RoCE / 128H100-IB / 128H100-RoCE）执行：

1. 打开加载：plan.json 可解析且 validate_plan 通过；template.meta.json 模板中心必填字段齐全；
   结构完整（excel/ 四表、templates/ 8 角色 .j2、para.xlsx、plan.json）。
2. dry-run 渲染健康：一次性 dry-run 渲染产出设备数 == 预期档位（22/24），无 [渲染错误]。
3. 导出项目包：export_project_package 产出 zip + manifest（schema/文件数>0）。
4. 导入回灌幂等：import_project_package 后数据文件（excel/para/templates/plan.json）
   与示例逐字节一致；二次导入 matched=skip（内容无变化）。
5. golden 确定性：渲染 hash 与 tests/golden/<name>.json 基线一致。

用法：
  python scripts/validate_samples.py            # 全量验收（退出码 0/1）
  python scripts/validate_samples.py --list     # 仅列出示例与预期设备数
"""
import json
import logging
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from aidc_samples import EXAMPLE_DIR, SAMPLE_DEFS, build_all_plans  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOLDEN_DIR = os.path.join(REPO, 'tests', 'golden')

# 渲染产物中运行目录/文件排除
_DATA_DIRS = ('excel', 'templates')
_DATA_FILES = ('para.xlsx', 'plan.json')


def expected_device_count(key):
    return 24 if key.startswith('128') else 22


def _required_excel_files():
    return ('hostname.xlsx', 'connection.xlsx', 'ipaddress.xlsx', 'parameter.xlsx')


# ---- 1) 打开加载 ----
def check_load(name, problems):
    base = os.path.join(EXAMPLE_DIR, name)
    if not os.path.isdir(base):
        problems.append('示例目录缺失')
        return
    plan_path = os.path.join(base, 'plan.json')
    if not os.path.exists(plan_path):
        problems.append('缺少 plan.json（无法回灌/溯源）')
    else:
        try:
            with open(plan_path, encoding='utf-8') as f:
                plan = json.load(f)
        except (OSError, ValueError) as e:
            problems.append(f'plan.json 解析失败: {e}')
        else:
            from intent.planner.validate import validate_plan
            issues = validate_plan(plan)
            if issues:
                problems.append(f'plan:table 校验不通过: {issues[:5]}')
    if not os.path.exists(os.path.join(base, 'template.meta.json')):
        problems.append('缺少 template.meta.json')
    else:
        try:
            with open(os.path.join(base, 'template.meta.json'), encoding='utf-8') as f:
                meta = json.load(f)
        except (OSError, ValueError):
            problems.append('template.meta.json 解析失败')
        else:
            missing = [k for k in ('name', 'description', 'scenario', 'inputRequirements', 'outputDescription')
                       if not meta.get(k)]
            if missing:
                problems.append(f'template.meta.json 缺少必填字段: {missing}')
    excel_dir = os.path.join(base, 'excel')
    for f in _required_excel_files():
        if not os.path.exists(os.path.join(excel_dir, f)):
            problems.append(f'缺少 excel/{f}')
    tpl_dir = os.path.join(base, 'templates')
    j2 = [f for f in os.listdir(tpl_dir) if f.endswith('.j2')] if os.path.isdir(tpl_dir) else []
    if len(j2) != 8:
        problems.append(f'templates/ 应含 8 个角色 .j2，实际 {len(j2)}')
    if not os.path.exists(os.path.join(base, 'para.xlsx')):
        problems.append('缺少 para.xlsx')
    return base


# ---- 2) 渲染健康（单 workspace 一次性渲染） ----
def render_all(names):
    """dry-run 渲染全部示例，返回 {project: [results]}。"""
    import io
    import contextlib
    import pandas as pd

    tmpdir = tempfile.mkdtemp(prefix='mc_samples_')
    try:
        os.environ['MC_WORKSPACE'] = tmpdir
        for name in names:
            shutil.copytree(os.path.join(EXAMPLE_DIR, name), os.path.join(tmpdir, name))
        pd.DataFrame({'项目名称': names}).to_excel(
            os.path.join(tmpdir, 'MC_Para.xlsx'), sheet_name='项目名称', index=False, header=True)
        logging.getLogger('magiccommander').setLevel(logging.ERROR)
        from pre_processing import PreProcessing
        logging.getLogger().setLevel(logging.ERROR)

        p = PreProcessing()
        # 5.0.1（501-d）：显式指定 workspace（pytest 全量套件中 config.WORKSPACE_DIR 已缓存，
        # 仅靠 env MC_WORKSPACE 不再生效），确保渲染落到本次临时 workspace。
        p.workspace = tmpdir
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
            raise RuntimeError(f'渲染未完成: {str(last)[:300]}')
        grouped = {}
        for r in (last.get('data') or {}).get('results') or []:
            grouped.setdefault(r.get('project', ''), []).append(r)
        for name in names:
            grouped.setdefault(name, [])
        return grouped
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _render_snapshot(results):
    """与 scripts/gen_golden.py _snapshot 一致的确定性快照（render_hash 可比对）。"""
    import hashlib
    items = sorted((r.get('device', ''), r.get('role', ''), r.get('filename', ''), r.get('content', ''))
                   for r in results)
    payload = json.dumps([{'filename': f, 'content': c} for (_, _, f, c) in items],
                         ensure_ascii=False, sort_keys=True)
    return {
        'device_count': len(items),
        'render_hash': hashlib.sha256(payload.encode('utf-8')).hexdigest()[:16],
    }


def check_render(names, problems_by_name, render_results):
    for name in names:
        results = render_results.get(name, [])
        if not results:
            problems_by_name[name].append('渲染产出 0 台设备')
            continue
        errors = [r for r in results
                  if isinstance(r.get('content'), str) and r['content'].startswith('[渲染错误]')]
        if errors:
            problems_by_name[name].append(f'存在渲染错误设备 {len(errors)} 台，如: {errors[0].get("device")}')
        got = len(results)
        exp = expected_device_count(name)
        if got != exp:
            problems_by_name[name].append(f'渲染设备数 {got} ≠ 预期 {exp}')
        # golden 确定性比对
        snap = _render_snapshot(results)
        gf = os.path.join(GOLDEN_DIR, name + '.json')
        if os.path.exists(gf):
            with open(gf, encoding='utf-8') as f:
                golden = json.load(f)
            if snap.get('render_hash') != golden.get('render_hash'):
                problems_by_name[name].append(
                    f'渲染 hash 与 golden 基线不一致: {snap.get("render_hash")} vs {golden.get("render_hash")}')


# ---- 3) 导出项目包 + 4) 导入回灌幂等 ----
def _data_snapshot(proj_dir):
    """数据文件快照（excel/ + para.xlsx + plan.json + templates/），排除运行时/派生。"""
    out = {}
    for root, dirs, files in os.walk(proj_dir):
        rel_root = os.path.relpath(root, proj_dir).replace(os.sep, '/')
        keep_dirs = [d for d in dirs if d in _DATA_DIRS]
        dirs[:] = keep_dirs
        for f in files:
            rel = os.path.join(rel_root, f).replace('\\', '/') if rel_root != '.' else f
            if not (f in _DATA_FILES or rel.startswith('excel/') or rel.startswith('templates/')):
                continue
            with open(os.path.join(root, f), 'rb') as fh:
                out[rel] = fh.read()
    return out


def check_roundtrip(name, problems):
    from intent.planner.project_package import export_project_package, import_project_package

    tmp = tempfile.mkdtemp(prefix='mc_rt_')
    try:
        ws1 = os.path.join(tmp, 'ws1')
        ws2 = os.path.join(tmp, 'ws2')
        proj1 = os.path.join(ws1, name)
        shutil.copytree(os.path.join(EXAMPLE_DIR, name), proj1)
        pkg = os.path.join(tmp, name + '.zip')
        manifest = export_project_package(proj1, pkg)
        if manifest.get('schema') != 'mc.project-package/1':
            problems.append(f'项目包 schema 异常: {manifest.get("schema")}')
        if manifest.get('summary', {}).get('file_count', 0) <= 0:
            problems.append('项目包文件数 <= 0')

        # 首次导入（new）→ 数据文件与示例逐字节一致
        r1 = import_project_package(pkg, ws2)
        if r1.get('matched') != 'new':
            problems.append(f'首次导入应 new，实际 {r1.get("matched")}')
        s1 = _data_snapshot(os.path.join(ws2, r1['project_dir']))
        if s1 != _data_snapshot(proj1):
            problems.append('导入回灌后数据文件与示例不一致')

        # 二次导入（skip）→ 幂等
        r2 = import_project_package(pkg, ws2)
        if r2.get('matched') != 'skip':
            problems.append(f'二次导入应 skip（幂等），实际 {r2.get("matched")}')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    if '--list' in sys.argv:
        for d in SAMPLE_DEFS:
            print('{}: 设备 {} / 接线 {} / 终端 {} / 预期渲染 {}'.format(
                d['key'], len(build_all_plans()[d['key']]['deviceList']),
                len(build_all_plans()[d['key']]['connections']),
                len(build_all_plans()[d['key']]['terminals']),
                expected_device_count(d['key'])))
        return 0

    names = [d['key'] for d in SAMPLE_DEFS]
    problems_by_name = {n: [] for n in names}

    for n in names:
        check_load(n, problems_by_name[n])

    render_results = {}
    if all(not problems_by_name[n] for n in names):
        render_results = render_all(names)
    else:
        for n in names:
            problems_by_name[n].append('（打开加载未通过，跳过渲染/回灌）')

    check_render(names, problems_by_name, render_results)

    for n in names:
        if not problems_by_name[n]:
            check_roundtrip(n, problems_by_name[n])

    failures = 0
    for n in names:
        ok = not problems_by_name[n]
        if not ok:
            failures += 1
        print(f'[{"OK" if ok else "FAIL"}] {n}: 打开/渲染({expected_device_count(n)}台)/导出/回灌幂等/golden')
        for p in problems_by_name[n]:
            print(f'       - {p}')

    print(f'\n结果: {len(names) - failures}/{len(names)} 示例通过')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())

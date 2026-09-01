"""MagicCommander 模板库健康校验（4.0.0-F0-1，对齐 AL scripts/validate_templates.py）

校验 example/ 模板库（模板中心数据源）每个模板项目：
  - 目录结构：templates/ 存在且含 ≥1 个 .j2；para.xlsx 或 excel/ 存在
  - template.meta.json 存在、可解析，必填字段齐全（name/description/scenario/inputRequirements/outputDescription）
  - 每个 .j2 可被 Jinja2 编译（语法健康）
  - excel/*.xlsx 可被 openpyxl 读取（数据健康）
  - 渲染健康：临时 workspace dry-run 渲染成功且产出 ≥1 台设备、无 [渲染错误]

注意：后端 config.py 在导入时读取 MC_WORKSPACE，故使用单一临时 workspace 一次性渲染全部模板。

用法：
  python scripts/validate_templates.py
"""
import json
import logging
import os
import shutil
import sys
import tempfile

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
BACKEND = os.path.join(REPO, 'backend')
base = os.path.join(REPO, 'example')

# template.meta.json 必填字段
REQUIRED_META_FIELDS = ['name', 'description', 'scenario', 'inputRequirements', 'outputDescription']


def _discover_templates():
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


def _check_structure(tpl_dir, problems):
    """1. 目录结构检查"""
    templates_dir = os.path.join(tpl_dir, 'templates')
    if not os.path.isdir(templates_dir):
        problems.append('缺少 templates/ 目录')
        return None
    j2_files = sorted(
        f for f in os.listdir(templates_dir)
        if f.endswith('.j2') or f.endswith('.jinja') or f.endswith('.jinja2')
    )
    if not j2_files:
        problems.append('templates/ 下无 .j2 模板')
        return None
    has_para = os.path.exists(os.path.join(tpl_dir, 'para.xlsx'))
    excel_dir = os.path.join(tpl_dir, 'excel')
    has_excel = os.path.isdir(excel_dir) and any(
        f.lower().endswith(('.xlsx', '.xls')) for f in os.listdir(excel_dir)
    )
    if not has_para and not has_excel:
        problems.append('缺少 para.xlsx 且 excel/ 目录无数据文件（无法渲染）')
    return j2_files


def _check_meta(tpl_dir, problems):
    """2. template.meta.json 完整性"""
    meta_path = os.path.join(tpl_dir, 'template.meta.json')
    if not os.path.exists(meta_path):
        problems.append('缺少 template.meta.json（模板中心元数据）')
        return
    try:
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
    except (OSError, ValueError) as e:
        problems.append(f'template.meta.json 解析失败: {e}')
        return
    missing = [k for k in REQUIRED_META_FIELDS if not meta.get(k)]
    if missing:
        problems.append(f'template.meta.json 缺少必填字段: {missing}')


def _check_jinja(tpl_dir, j2_files, problems):
    """3. Jinja2 语法健康"""
    from jinja2 import Environment, FileSystemLoader, StrictUndefined
    env = Environment(
        loader=FileSystemLoader(os.path.join(tpl_dir, 'templates')),
        undefined=StrictUndefined,
    )
    for f in j2_files:
        try:
            env.get_template(f)
        except Exception as e:
            problems.append(f'模板 {f} Jinja2 编译失败: {e}')


def _check_excel(tpl_dir, problems):
    """4. Excel 数据健康"""
    import openpyxl
    excel_dir = os.path.join(tpl_dir, 'excel')
    if not os.path.isdir(excel_dir):
        return
    for f in sorted(os.listdir(excel_dir)):
        if not f.lower().endswith(('.xlsx', '.xls')):
            continue
        try:
            openpyxl.load_workbook(os.path.join(excel_dir, f), read_only=True, data_only=True)
        except Exception as e:
            problems.append(f'Excel {f} 无法读取: {e}')


def _render_all(templates, tmpdir):
    """在临时 workspace 中一次性 dry-run 渲染全部模板，返回 {template: [results]}。"""
    import pandas as pd
    import io
    import contextlib

    os.environ['MC_WORKSPACE'] = tmpdir
    sys.path.insert(0, BACKEND)
    logging.getLogger('magiccommander').setLevel(logging.ERROR)

    for name in templates:
        shutil.copytree(os.path.join(base, name), os.path.join(tmpdir, name))
    pd.DataFrame({'项目名称': templates}).to_excel(
        os.path.join(tmpdir, 'MC_Para.xlsx'), sheet_name='项目名称', index=False, header=True)

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
        raise RuntimeError(f'渲染未完成: {str(last)[:300]}')

    grouped: dict = {}
    for r in (last.get('data') or {}).get('results') or []:
        grouped.setdefault(r.get('project', ''), []).append(r)
    for name in templates:
        grouped.setdefault(name, [])
    return grouped


def main():
    templates = _discover_templates()
    print(f'共发现 {len(templates)} 个模板\n')

    render_results: dict = {}
    if templates:
        tmpdir = tempfile.mkdtemp(prefix='mc_tpl_')
        try:
            render_results = _render_all(templates, tmpdir)
        except Exception as e:
            render_results = {'__error__': f'{type(e).__name__}: {e}'}
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    failures = 0
    for t in templates:
        tpl_dir = os.path.join(base, t)
        problems = []
        j2_files = _check_structure(tpl_dir, problems)
        _check_meta(tpl_dir, problems)
        if j2_files:
            _check_jinja(tpl_dir, j2_files, problems)
        _check_excel(tpl_dir, problems)

        # 5. 渲染健康
        if '__error__' in render_results:
            problems.append(f'渲染引擎异常: {render_results["__error__"]}')
        else:
            results = render_results.get(t, [])
            if not results:
                problems.append('渲染产出 0 台设备（para.xlsx 与 excel 数据可能为空）')
            errors = [r for r in results if isinstance(r.get('content'), str) and r['content'].startswith('[渲染错误]')]
            if errors:
                problems.append(f'存在渲染错误设备 {len(errors)} 台，如: {errors[0].get("device")}')

        ok = not problems
        if not ok:
            failures += 1
        print(f'[{"OK" if ok else "FAIL"}] {t}: 模板 {len(j2_files) if j2_files else 0} 个, 结构/元数据/语法/数据/渲染健康')
        for p in problems:
            print(f'       - {p}')

    print(f'\n结果: {len(templates) - failures}/{len(templates)} 模板通过')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()

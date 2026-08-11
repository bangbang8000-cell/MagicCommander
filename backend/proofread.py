"""
智能校对：渲染前/后自动验证。
基于依赖分析（模板 ↔ Excel 列），检查：
1. 模板语法错误（Jinja2 parse）
2. 模板引用但 Excel 中缺失的列
3. 模板所需列在设备数据中存在空值（按设备行）
"""
import os
import logging
from collections import defaultdict

import pandas as pd
from jinja2 import Environment, meta

from analyzer import analyze_project

logger = logging.getLogger(__name__)

# 设备名列候选（用于在数据行中定位设备）
_DEVICE_NAME_COLUMNS = ['设备名', '设备名称', 'device_name', 'name', 'SN', 'sn']


def _find_excel_files(project_path: str) -> list[str]:
    """收集项目 Excel 文件（excel/ 目录 + para.xlsx）"""
    files = []
    excel_dir = os.path.join(project_path, 'excel')
    if os.path.isdir(excel_dir):
        files = [os.path.join(excel_dir, f) for f in os.listdir(excel_dir) if f.lower().endswith('.xlsx')]
    para_path = os.path.join(project_path, 'para.xlsx')
    if os.path.exists(para_path):
        files.append(para_path)
    return files


def _sheet_frame(excel_path: str, sheet_name: str) -> pd.DataFrame | None:
    try:
        df = pd.read_excel(excel_path, sheet_name=sheet_name)
        # 统一列名为字符串
        df.columns = [str(c).strip() if isinstance(c, str) else str(c) for c in df.columns]
        return df
    except Exception as e:
        logger.warning(f'读取表格失败 {excel_path}/{sheet_name}: {e}')
        return None


def proofread_project(project_path: str) -> dict:
    """校对项目：返回模板/数据/语法问题清单"""
    if not os.path.isdir(project_path):
        return {'status': 'error', 'message': f'项目路径不存在: {project_path}'}

    report = analyze_project(project_path)
    deps = report.get('dependencies', {})
    template_columns = deps.get('template_columns', {})   # template -> [columns]
    missing_by_template = report.get('cross_reference', {}).get('missing_by_template', {})

    # 列 → 来源 (文件, sheet)
    column_sources: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for xl in report.get('excel_files', []):
        fname = xl.get('file', '')
        for sheet_name, sheet_info in xl.get('sheets', {}).items():
            if not isinstance(sheet_info, dict):
                continue
            for h in sheet_info.get('headers', []):
                if isinstance(h, str) and h.strip():
                    column_sources[h.strip()].append((fname, sheet_name))

    issues: list[dict] = []
    # 记录已经检查过的 (file,sheet) 以避免重复读表
    checked_sheets: set[tuple[str, str]] = set()

    for template, cols in template_columns.items():
        # 1. 模板缺失列
        for col in missing_by_template.get(template, []):
            issues.append({
                'level': 'warning',
                'type': 'missing_column',
                'template': template,
                'column': col,
                'message': f'模板 {template} 引用了列 "{col}"，但 Excel 中不存在该列',
            })

        # 2. 模板所需列的空值检查（按设备行）
        for col in cols:
            for (fname, sheet_name) in column_sources.get(col, []):
                key = (fname, sheet_name)
                if key in checked_sheets:
                    continue
                checked_sheets.add(key)
                excel_path = _find_excel_file(project_path, fname)
                if not excel_path:
                    continue
                df = _sheet_frame(excel_path, sheet_name)
                if df is None or len(df) == 0:
                    continue
                # 定位设备名列
                dev_col = next((c for c in _DEVICE_NAME_COLUMNS if c in df.columns), None)
                ref_cols = [c for c in cols if c in df.columns]
                for _, row in df.iterrows():
                    device = str(row.get(dev_col, '')) if dev_col else ''
                    for rc in ref_cols:
                        val = row.get(rc)
                        # NaN / None / 空字符串 均视为空值
                        if pd.isna(val) or (isinstance(val, str) and not val.strip()):
                            issues.append({
                                'level': 'warning',
                                'type': 'empty_value',
                                'template': template,
                                'sheet': f'{fname} / {sheet_name}',
                                'device': device,
                                'column': rc,
                                'message': f'设备 {device or "(未命名)"} 的列 "{rc}" 为空，而模板 {template} 需要该列',
                            })

    # 3. 模板语法错误
    template_dir = os.path.join(project_path, 'templates')
    if os.path.isdir(template_dir):
        for fname in sorted(os.listdir(template_dir)):
            if not fname.endswith('.j2'):
                continue
            path = os.path.join(template_dir, fname)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    source = f.read()
                env = Environment()
                env.parse(source)
                # 提取未声明变量（用于 info 之外可能的裸变量提示）
                meta.find_undeclared_variables(env.parse(source))
            except Exception as e:
                issues.append({
                    'level': 'error',
                    'type': 'syntax',
                    'template': fname,
                    'message': f'模板 {fname} 语法错误: {e}',
                })

    summary = {
        'total': len(issues),
        'errors': sum(1 for i in issues if i['level'] == 'error'),
        'warnings': sum(1 for i in issues if i['level'] == 'warning'),
    }
    return {
        'status': 'success',
        'project': os.path.basename(project_path),
        'issues': issues,
        'summary': summary,
    }


def _find_excel_file(project_path: str, fname: str) -> str | None:
    """按文件名在项目内定位 excel 文件（excel/ 目录或项目根目录）"""
    candidates = [
        os.path.join(project_path, 'excel', fname),
        os.path.join(project_path, fname),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

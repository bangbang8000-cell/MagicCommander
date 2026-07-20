"""
项目分析器：分析 Jinja2 模板和 Excel 参数表，生成优化建议报告。
"""
import os
import json
import logging
from collections import defaultdict
from typing import Any

import pandas as pd
from jinja2 import Environment, meta
from jinja2.nodes import (
    Getattr, Getitem, Name, Const, For, If, Filter, Call,
    Output, TemplateData, CondExpr, Compare,
)

logger = logging.getLogger(__name__)


def _walk_ast(node, depth=0):
    """递归遍历 Jinja2 AST，返回 (变量引用列表, 结构复杂度)"""
    variables = []
    complexity = 0

    if isinstance(node, Getitem):
        # info['key'] 或 info['key']['subkey']
        if isinstance(node.node, Name):
            prefix = node.node.name
        else:
            prefix = '?'
        if isinstance(node.arg, Const):
            variables.append(f"{prefix}['{node.arg.value}']")
        else:
            variables.append(f"{prefix}[dynamic]")
    elif isinstance(node, Getattr):
        if isinstance(node.node, Name):
            variables.append(f"{node.node.name}.{node.attr}")
    elif isinstance(node, Name):
        if node.name not in ('loop', 'range', 'super', 'self', 'varargs', 'kwargs',
                             'lipsum', 'dict', 'cycler', 'joiner', 'namespace'):
            variables.append(node.name)

    if isinstance(node, For):
        complexity += 1 + depth  # 循环嵌套越深，复杂度越高
    if isinstance(node, If):
        complexity += 1
    if isinstance(node, CondExpr):
        complexity += 1
    if isinstance(node, Filter):
        complexity += 1

    for child in node.iter_child_nodes():
        cv, cc = _walk_ast(child, depth + 1)
        variables.extend(cv)
        complexity += cc

    return variables, complexity


def _extract_template_vars(template_path: str) -> tuple:
    """从 Jinja2 模板中提取变量引用和复杂度"""
    with open(template_path, 'r', encoding='utf-8') as f:
        source = f.read()

    env = Environment()
    try:
        ast = env.parse(source)
    except Exception as e:
        return [], 0, {'error': str(e)}

    # 提取未声明变量
    undeclared = meta.find_undeclared_variables(ast)

    # 提取所有变量引用
    variables, complexity = _walk_ast(ast)

    # 统计
    var_counts = defaultdict(int)
    for v in variables:
        var_counts[v] += 1

    return variables, complexity, {
        'undeclared_vars': sorted(undeclared),
        'var_counts': dict(var_counts),
        'total_lines': len(source.splitlines()),
        'total_chars': len(source),
    }


def _analyze_excel(excel_path: str) -> dict:
    """分析 Excel 文件的数据质量"""
    result = {
        'file': os.path.basename(excel_path),
        'sheets': {},
        'issues': [],
    }

    try:
        xls = pd.ExcelFile(excel_path)
    except Exception as e:
        result['issues'].append(f'无法打开文件: {e}')
        return result

    for sheet_name in xls.sheet_names:
        try:
            df = pd.read_excel(excel_path, sheet_name=sheet_name)
        except Exception as e:
            result['sheets'][sheet_name] = {'error': str(e)}
            continue

        sheet_info = {
            'rows': len(df),
            'columns': len(df.columns),
            'headers': list(df.columns),
            'empty_cells': int(df.isna().sum().sum()),
            'issues': [],
        }

        # 检查空行（全空）
        empty_rows = df[df.isna().all(axis=1)].index.tolist()
        if empty_rows:
            sheet_info['issues'].append(f'包含 {len(empty_rows)} 个全空行')

        # 检查空列（全空）
        empty_cols = df.columns[df.isna().all(axis=0)].tolist()
        if empty_cols:
            sheet_info['issues'].append(f'包含空列: {empty_cols}')

        # 检查列名重复
        dup_cols = df.columns[df.columns.duplicated()].tolist()
        if dup_cols:
            sheet_info['issues'].append(f'重复列名: {dup_cols}')

        # 检查列名含空格
        space_cols = [c for c in df.columns if isinstance(c, str) and (c.startswith(' ') or c.endswith(' '))]
        if space_cols:
            sheet_info['issues'].append(f'列名含前后空格: {space_cols}')

        # 检查数据类型一致性
        for col in df.columns:
            try:
                non_null = df[col].dropna()
                if len(non_null) > 0:
                    types = non_null.apply(type).unique()
                    if len(types) > 1:
                        sheet_info['issues'].append(f'列 "{col}" 包含多种数据类型: {[t.__name__ for t in types]}')
            except Exception:
                pass

        result['sheets'][sheet_name] = sheet_info

    return result


def _analyze_template(template_path: str) -> dict:
    """分析单个模板文件"""
    variables, complexity, details = _extract_template_vars(template_path)

    result = {
        'file': os.path.basename(template_path),
        'variables': variables,
        'unique_vars': len(set(variables)),
        'complexity': complexity,
        'details': details,
        'suggestions': [],
    }

    # 建议1: 复杂度高
    if complexity > 15:
        result['suggestions'].append({
            'level': 'warning',
            'message': f'模板复杂度较高 ({complexity})，建议拆分为多个模板或使用宏(macro)简化',
        })
    elif complexity > 8:
        result['suggestions'].append({
            'level': 'info',
            'message': f'模板复杂度中等 ({complexity})，可考虑简化嵌套逻辑',
        })

    # 建议2: 变量过多
    unique_count = len(set(variables))
    if unique_count > 20:
        result['suggestions'].append({
            'level': 'info',
            'message': f'引用变量较多 ({unique_count} 个)，建议检查是否有未使用的变量',
        })

    # 建议3: 未声明变量（排除标准上下文变量 info）
    undeclared = details.get('undeclared_vars', [])
    real_undeclared = [v for v in undeclared if v != 'info']
    if real_undeclared:
        result['suggestions'].append({
            'level': 'warning',
            'message': f'存在未声明的变量: {real_undeclared}，请确认这些变量在 Excel 中有对应列',
        })

    # 建议4: 模板过大
    if details.get('total_lines', 0) > 200:
        result['suggestions'].append({
            'level': 'info',
            'message': f'模板较大 ({details["total_lines"]} 行)，建议按设备角色拆分',
        })

    return result


def analyze_project(project_path: str) -> dict:
    """分析整个项目，返回完整的优化建议报告"""
    if not os.path.isdir(project_path):
        return {'status': 'error', 'message': f'项目路径不存在: {project_path}'}

    project_name = os.path.basename(project_path)
    report = {
        'status': 'success',
        'project': project_name,
        'templates': [],
        'excel_files': [],
        'cross_reference': {},
        'summary': {
            'total_suggestions': 0,
            'warnings': 0,
            'infos': 0,
        },
    }

    # 分析模板
    template_dir = os.path.join(project_path, 'templates')
    if os.path.isdir(template_dir):
        for fname in sorted(os.listdir(template_dir)):
            if fname.endswith('.j2'):
                path = os.path.join(template_dir, fname)
                try:
                    tmpl = _analyze_template(path)
                    report['templates'].append(tmpl)
                    for s in tmpl['suggestions']:
                        report['summary']['total_suggestions'] += 1
                        if s['level'] == 'warning':
                            report['summary']['warnings'] += 1
                        else:
                            report['summary']['infos'] += 1
                except Exception as e:
                    report['templates'].append({
                        'file': fname, 'error': str(e)
                    })

    # 分析 Excel 文件
    excel_dir = os.path.join(project_path, 'excel')
    excel_files_to_check = []

    if os.path.isdir(excel_dir):
        excel_files_to_check = [os.path.join(excel_dir, f) for f in os.listdir(excel_dir) if f.endswith('.xlsx')]

    para_path = os.path.join(project_path, 'para.xlsx')
    if os.path.exists(para_path):
        excel_files_to_check.append(para_path)

    for xlsx_path in excel_files_to_check:
        try:
            xl = _analyze_excel(xlsx_path)
            report['excel_files'].append(xl)
            # 统计 Excel 问题
            for sheet_info in xl.get('sheets', {}).values():
                for issue in sheet_info.get('issues', []):
                    report['summary']['total_suggestions'] += 1
                    report['summary']['warnings'] += 1
            for issue in xl.get('issues', []):
                report['summary']['total_suggestions'] += 1
                report['summary']['warnings'] += 1
        except Exception as e:
            report['excel_files'].append({
                'file': os.path.basename(xlsx_path), 'error': str(e)
            })

    # 交叉引用：模板变量 vs Excel 列名
    all_template_vars = set()
    for tmpl in report['templates']:
        all_template_vars.update(tmpl.get('variables', []))

    all_excel_headers = set()
    for xl in report['excel_files']:
        for sheet_info in xl.get('sheets', {}).values():
            for h in sheet_info.get('headers', []):
                if isinstance(h, str):
                    all_excel_headers.add(h)

    if all_template_vars and all_excel_headers:
        # 模板用到但 Excel 中没有的变量
        # 提取变量名（去掉前缀 info[' 和 ']）
        var_names = set()
        for v in all_template_vars:
            if "['" in v and "']" in v:
                name = v.split("['")[-1].rstrip("']")
                var_names.add(name)
            elif v.startswith('info.'):
                var_names.add(v[5:])
            else:
                var_names.add(v)

        vars_without_excel = var_names - all_excel_headers
        excel_without_vars = all_excel_headers - var_names

        if vars_without_excel:
            report['cross_reference']['template_vars_missing_in_excel'] = sorted(vars_without_excel)
            report['summary']['total_suggestions'] += 1
            report['summary']['warnings'] += 1

        if excel_without_vars:
            report['cross_reference']['excel_columns_unused_in_templates'] = sorted(excel_without_vars)
            report['summary']['total_suggestions'] += 1
            report['summary']['infos'] += 1

    return report
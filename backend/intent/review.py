"""4.8.0（F8-4 / 48-d）项目评审报告/评审包：聚合校验报告 + 渲染命令核对矩阵 + 项目摘要 + 交付清单。

- build_review_report：一次聚合（ValidationReport JSON + verify_rendered 矩阵 + 项目摘要 + 交付清单 manifest）
- render_review_markdown：评审报告 → Markdown（供 PDF 导出，复用 markdownToPrintableHtml/printToPDF）
- build_review_package：评审包 zip（report.json + review.md + delivery manifest.json）
"""
import datetime
import json
import os
import zipfile

from .delivery import read_batch_manifest, RENDER_MANIFEST_SCHEMA

REVIEW_SCHEMA = 'mc.review/1'
REVIEW_VERSION = 1


def _now_utc() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')


def _project_summary(project_dir: str) -> dict:
    """项目摘要：结构存在性 + 配置/模板文件数 + 身份（originProjectId/planHash）。"""
    def has(name):
        return os.path.exists(os.path.join(project_dir, name))
    tmeta = {}
    try:
        with open(os.path.join(project_dir, 'template.meta.json'), encoding='utf-8') as f:
            tmeta = json.load(f)
    except (OSError, ValueError):
        pass
    config_count = 0
    template_count = 0
    for root, _, files in os.walk(project_dir):
        rel = os.path.relpath(root, project_dir).replace(os.sep, '/')
        top = rel.split('/')[0] if rel != '.' else ''
        if top in ('output', 'output-sn', 'yaml', 'yaml-sn', 'output-label', 'output-label-md',
                   'output-label-pdf', '.mc_history', '.mc_backups', '.template_history',
                   '.output_backups', '.render_cache', '__pycache__') or rel.startswith('.'):
            continue
        for f in files:
            config_count += 1
            if top == 'templates':
                template_count += 1
    return {
        'structure': {
            'para': has('para.xlsx'), 'excel': has('excel'), 'templates': has('templates'),
            'output': has('output'), 'yaml': has('yaml'), 'plan': has('plan.json'),
        },
        'file_count': config_count,
        'template_count': template_count,
        'identity': {
            'originProjectId': tmeta.get('originProjectId', ''),
            'projectId': tmeta.get('projectId', ''),
            'planHash': tmeta.get('planHash', ''),
            'mcPlanVersion': tmeta.get('mcPlanVersion'),
        },
    }


def build_review_report(project_dir: str) -> dict:
    """聚合评审数据（项目摘要 + 校验报告 + 渲染命令核对矩阵 + 交付清单）。"""
    report = {
        'schema': REVIEW_SCHEMA,
        'version': REVIEW_VERSION,
        'kind': 'review',
        'project': os.path.basename(project_dir.rstrip('/\\')),
        'generatedAt': _now_utc(),
    }
    report['summary'] = _project_summary(project_dir)

    # 校验报告（ValidationReport JSON）
    from validation import validate_project
    val = validate_project(project_dir, 'all')
    report['validation'] = val.to_dict()

    # 渲染命令核对矩阵（verify_rendered）
    try:
        import sys as _sys
        _sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts'))
        from verify_rendered import verify_project_data
        report['verify'] = verify_project_data(project_dir)
    except Exception as e:  # pragma: no cover
        report['verify'] = {'ok': False, 'error': f'{type(e).__name__}: {e}', 'checks': [], 'devices': [], 'summary': {}}

    # 交付清单（最新渲染批次 manifest）
    manifest = read_batch_manifest(project_dir)
    report['delivery'] = manifest or {'error': '无渲染批次清单（manifest.json）', 'schema': RENDER_MANIFEST_SCHEMA}
    return report


def render_review_markdown(report: dict) -> str:
    """评审报告 → Markdown（供 PDF/预览）。"""
    lines = []
    lines.append(f'# 项目评审报告：{report.get("project", "")}')
    lines.append('')
    lines.append(f'- 生成时间：{report.get("generatedAt", "")}')
    summary = report.get('summary', {})
    lines.append(f'- 文件数：{summary.get("file_count", 0)}（模板 {summary.get("template_count", 0)}）')
    identity = summary.get('identity', {})
    if identity.get('originProjectId'):
        lines.append(f'- 溯源 projectId：{identity.get("originProjectId")}')
    if identity.get('planHash'):
        lines.append(f'- planHash：{identity.get("planHash")}')

    # 校验汇总
    val = report.get('validation', {})
    vs = val.get('summary', {})
    lines.append('')
    lines.append('## 校验汇总')
    lines.append('')
    lines.append(f'- 结果：{"PASS" if val.get("ok") else "FAIL"}')
    lines.append(f'- 问题数：{vs.get("total", 0)}（错误 {vs.get("errors", 0)} / 警告 {vs.get("warnings", 0)} / 提示 {vs.get("infos", 0)}）')
    if val.get('issues'):
        lines.append('')
        lines.append('| 级别 | 类别 | 位置 | 问题 | 建议 |')
        lines.append('|---|---|---|---|---|')
        for i in val['issues'][:30]:
            sev = {'error': '错误', 'warning': '警告', 'info': '提示'}.get(i.get('severity', ''), i.get('severity', ''))
            lines.append(f"| {sev} | {i.get('category', '')} | {i.get('location', '')} | {i.get('message', '')} | {i.get('suggestion', '')} |")

    # 渲染命令核对矩阵
    verify = report.get('verify', {})
    lines.append('')
    lines.append('## 渲染命令核对矩阵')
    lines.append('')
    if verify.get('ok'):
        checks = verify.get('checks', [])
        lines.append('| 设备 | ' + ' | '.join(checks) + ' |')
        lines.append('|---|' + '---|' * len(checks))
        for d in verify.get('devices', []):
            cells = []
            for r in d.get('results', []):
                hit = r.get('hit')
                cells.append('✅' if hit is True else ('—' if hit is None else '❌'))
            lines.append(f"| {d.get('name', '')} | " + ' | '.join(cells) + ' |')
    else:
        lines.append(f"- {verify.get('error', '无可核对数据')}")

    # 交付清单
    delivery = report.get('delivery', {})
    lines.append('')
    lines.append('## 交付清单')
    lines.append('')
    if delivery.get('files'):
        lines.append(f"- 批次：{delivery.get('batch', {}).get('rendered_at', '')}（{delivery.get('summary', {}).get('file_count', 0)} 文件）")
        lines.append(f"- render_hash：{delivery.get('summary', {}).get('render_hash', '')}")
        lines.append('')
        lines.append('| 文件 | 大小 | sha256 |')
        lines.append('|---|---|---|')
        for f in delivery['files'][:40]:
            lines.append(f"| {f.get('path', '')} | {f.get('size', 0)} | {f.get('sha256', '')[:12]} |")
    else:
        lines.append(f"- {delivery.get('error', '无交付清单')}")
    return '\n'.join(lines)


def build_review_package(project_dir: str, out_zip_path: str) -> dict:
    """评审包 zip：report.json + review.md + 交付清单 manifest.json。返回 {path, report}。"""
    report = build_review_report(project_dir)
    markdown = render_review_markdown(report)
    os.makedirs(os.path.dirname(os.path.abspath(out_zip_path)), exist_ok=True)
    with zipfile.ZipFile(out_zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('report.json', json.dumps(report, ensure_ascii=False, indent=2))
        zf.writestr('review.md', markdown)
        delivery = report.get('delivery')
        if delivery and delivery.get('files'):
            zf.writestr('manifest.json', json.dumps(delivery, ensure_ascii=False, indent=2))
    return {'path': out_zip_path, 'project': report['project'], 'report': report}


def write_review_markdown_file(project_dir: str, out_md_path: str) -> dict:
    """评审报告 → Markdown 文件（PDF 导出前置）。"""
    report = build_review_report(project_dir)
    markdown = render_review_markdown(report)
    os.makedirs(os.path.dirname(os.path.abspath(out_md_path)), exist_ok=True)
    with open(out_md_path, 'w', encoding='utf-8') as f:
        f.write(markdown)
    return {'path': out_md_path, 'project': report['project'], 'ok': True}

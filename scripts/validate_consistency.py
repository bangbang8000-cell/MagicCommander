"""MagicCommander 4.5.0（45-a）校验门禁：工作区全部项目数据准确性校验（对齐双端 4.5 校验体系）

对 workspace 下每个项目执行全量校验（T1 一致性 / T2 导出核对 / T3 IP 校验），
任何项目存在 error 级问题 → 退出码 1（CI 失败）；无 workspace / 无项目 → 通过（不误伤）。

用法：
  python scripts/validate_consistency.py [--check] [--project NAME] [--json]
    --check     门禁模式：有 error 即退出 1（CI 用，默认同 --check）
    --project   仅校验指定项目（名称）
    --json      输出 JSON 汇总（CI 可读）
"""
import argparse
import json
import logging
import os
import sys

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
BACKEND = os.path.join(REPO, 'backend')
DEFAULT_WORKSPACE = os.path.join(REPO, 'workspace')


def _resolve_workspace() -> str:
    env_ws = os.environ.get('MC_WORKSPACE', '')
    if env_ws and os.path.isdir(env_ws):
        return os.path.abspath(env_ws)
    return os.path.abspath(DEFAULT_WORKSPACE)


def _discover_projects(workspace: str, only: str | None = None) -> list:
    if not os.path.isdir(workspace):
        return []
    ignored = {'__pycache__', 'assets', 'node_modules', '_exports', '.git'}
    projects = []
    for name in sorted(os.listdir(workspace)):
        if name.startswith('.') or name in ignored:
            continue
        d = os.path.join(workspace, name)
        if not os.path.isdir(d):
            continue
        has_shape = any(
            os.path.exists(os.path.join(d, f))
            for f in ('para.xlsx', 'excel', 'templates', 'output', 'yaml')
        )
        if has_shape and (only is None or name == only):
            projects.append(name)
    return projects


def main() -> int:
    parser = argparse.ArgumentParser(description='MC 校验门禁（4.5.0 数据准确性）')
    parser.add_argument('--check', action='store_true', help='门禁模式：有 error 即退出 1')
    parser.add_argument('--project', default=None, help='仅校验指定项目名称')
    parser.add_argument('--json', action='store_true', help='输出 JSON 汇总')
    args = parser.parse_args()

    sys.path.insert(0, BACKEND)
    logging.getLogger('magiccommander').setLevel(logging.ERROR)

    workspace = _resolve_workspace()
    projects = _discover_projects(workspace, args.project)
    if not projects:
        print(f'[VALIDATE] 无项目可校验（workspace: {workspace}）→ PASS')
        return 0

    from validation import validate_project

    per_project = {}
    total_errors = 0
    total_warnings = 0
    failed = []
    for name in projects:
        project_dir = os.path.join(workspace, name)
        report = validate_project(project_dir, 'all')
        per_project[name] = {
            'ok': report.ok,
            'summary': report.summary,
            'checks': report.checks,
            'issues': [i.to_dict() for i in report.issues],
        }
        total_errors += report.summary['errors']
        total_warnings += report.summary['warnings']
        status = 'PASS' if report.ok else 'FAIL'
        print(f'[{status}] {name}: 错误 {report.summary["errors"]} / 警告 {report.summary["warnings"]}')
        for issue in report.issues:
            if issue.severity == 'error':
                print(f'       - [{issue.category}] {issue.location}: {issue.message}')
        if not report.ok:
            failed.append(name)

    summary = {
        'projects': len(projects),
        'failed': len(failed),
        'failed_names': failed,
        'total_errors': total_errors,
        'total_warnings': total_warnings,
        'per_project': per_project,
    }
    if args.json:
        print(json.dumps(summary, ensure_ascii=False))

    passed = len(projects) - len(failed)
    print(f'\n结果: {passed}/{len(projects)} 项目通过（错误 {total_errors} / 警告 {total_warnings}）')
    if args.project and not args.check:
        # 单项目排查模式：仅展示，不设门禁
        return 0
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())

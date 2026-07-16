#!/usr/bin/env python3
"""
Magic Commander 3 - 命令行接口
网络设备配置管理工具 - 命令行版本
支持项目管理和配置渲染功能
"""

import argparse
import sys
import json
import os
import logging
from pre_processing import PreProcessing
from config import WORKSPACE_DIR

logger = logging.getLogger(__name__)


def main():
    # 创建主解析器
    parser = argparse.ArgumentParser(
        description='Magic Commander 3 - 网络设备配置管理工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
        项目管理:
          mc project list                列出所有项目
          mc project create <name>       创建新项目
          mc project delete <id>         删除项目
          mc project info <id>          获取项目信息
        
        配置渲染:
          mc render project <ids>       渲染项目配置
          mc render yaml <ids>          渲染YAML文件
          mc render project-sn <ids>    渲染项目配置(SN模式)
          mc render yaml-sn <ids>       渲染YAML文件(SN模式)
        
        标签功能:
          mc label print <ids>          打印标签
          mc label delete <ids>         删除标签
        
        文件操作:
          mc file delete <type> <ids>   删除项目文件
          mc file list <id>             列出项目文件
        
        项目ID格式:
          - 单个ID: 1
          - 多个ID: 1,2,3
          - 所有项目: all
        
        示例:
          mc project list
          mc project create "test-project"
          mc render project 1
          mc render yaml 1,2,3
          mc render project-sn all
          mc label print 1
          mc file delete output 1
        '''
    )

    # 创建子解析器
    subparsers = parser.add_subparsers(title='命令类型', dest='command', help='可用命令')

    # 项目管理命令
    project_parser = subparsers.add_parser('project', help='项目管理操作')
    project_subparsers = project_parser.add_subparsers(title='项目操作', dest='subcommand', help='项目管理子命令')

    # 列出项目
    list_project_parser = project_subparsers.add_parser('list', help='列出所有项目')
    list_project_parser.add_argument('--format', choices=['text', 'json', 'yaml'], default='text', help='输出格式')

    # 创建项目
    create_project_parser = project_subparsers.add_parser('create', help='创建新项目')
    create_project_parser.add_argument('name', help='项目名称')
    create_project_parser.add_argument('--force', action='store_true', help='强制覆盖已存在的项目')
    create_project_parser.add_argument('--empty', action='store_true', help='创建空白项目（不生成示例文件）')
    create_project_parser.add_argument('--template', help='从 example 目录的模板创建项目')

    # 删除项目
    delete_project_parser = project_subparsers.add_parser('delete', help='删除项目')
    delete_project_parser.add_argument('ids', help='项目ID (使用,分隔多个ID)')
    delete_project_parser.add_argument('--force', action='store_true', help='强制删除项目，无需用户确认')

    # 项目信息
    info_project_parser = project_subparsers.add_parser('info', help='获取项目信息')
    info_project_parser.add_argument('id', help='项目ID')
    info_project_parser.add_argument('--format', choices=['text', 'json', 'yaml'], default='text', help='输出格式')

    # 渲染命令
    render_parser = subparsers.add_parser('render', help='配置渲染操作')
    render_subparsers = render_parser.add_subparsers(title='渲染操作', dest='subcommand', help='渲染子命令')

    # 渲染项目配置
    render_project_parser = render_subparsers.add_parser('project', help='渲染项目配置')
    render_project_parser.add_argument('ids', help='项目ID (使用,分隔多个ID)')
    render_project_parser.add_argument('--format', choices=['device_name', 'device_sn'], default='device_name', help='输出格式')

    # 渲染YAML文件
    render_yaml_parser = render_subparsers.add_parser('yaml', help='渲染YAML文件')
    render_yaml_parser.add_argument('ids', help='项目ID (使用,分隔多个ID)')
    render_yaml_parser.add_argument('--format', choices=['device_name', 'device_sn'], default='device_name', help='输出格式')

    # 渲染撤销
    render_undo_parser = render_subparsers.add_parser('undo', help='撤销渲染 (恢复最近一次备份)')
    render_undo_parser.add_argument('ids', help='项目ID (使用,分隔多个ID)')

    # 渲染预览
    render_dryrun_parser = render_subparsers.add_parser('dry-run', help='渲染预览 (不写文件，仅返回输出内容)')
    render_dryrun_parser.add_argument('ids', help='项目ID (使用,分隔多个ID)')
    render_dryrun_parser.add_argument('--format', choices=['device_name', 'device_sn'], default='device_name', help='输出格式')

    # 校验命令
    validate_parser = subparsers.add_parser('validate', help='校验操作')
    validate_subparsers = validate_parser.add_subparsers(title='校验操作', dest='subcommand', help='校验子命令')

    # 校验模板
    validate_template_parser = validate_subparsers.add_parser('template', help='校验 Jinja2 模板语法')
    validate_template_parser.add_argument('ids', help='项目ID (使用,分隔多个ID)')

    # 校验 Excel
    validate_excel_parser = validate_subparsers.add_parser('excel', help='校验 Excel 数据完整性')
    validate_excel_parser.add_argument('ids', help='项目ID (使用,分隔多个ID)')

    # Diff 对比
    diff_parser = subparsers.add_parser('diff', help='对比渲染输出')
    diff_parser.add_argument('project', help='项目名称')
    diff_parser.add_argument('device', help='设备标识')
    diff_parser.add_argument('content', help='dry-run 渲染内容')
    diff_parser.add_argument('--format', choices=['device_name', 'device_sn'], default='device_name', help='输出格式')

    # 标签功能命令
    label_parser = subparsers.add_parser('label', help='标签功能操作')
    label_subparsers = label_parser.add_subparsers(title='标签操作', dest='subcommand', help='标签子命令')

    # 打印标签
    label_print_parser = label_subparsers.add_parser('print', help='打印标签')
    label_print_parser.add_argument('ids', help='项目ID (使用,分隔多个ID)')
    label_print_parser.add_argument('--config', help='JSON格式的打印配置 (纸张/方向/边距/每页数量/标签尺寸)', default=None)

    # 生成 Markdown 标签
    label_md_parser = label_subparsers.add_parser('md', help='生成Markdown标签')
    label_md_parser.add_argument('ids', help='项目ID (使用,分隔多个ID)')
    label_md_parser.add_argument('--config', help='JSON格式的标签配置', default=None)

    # 删除标签
    label_delete_parser = label_subparsers.add_parser('delete', help='删除标签')
    label_delete_parser.add_argument('ids', help='项目ID (使用,分隔多个ID)')

    # 文件操作命令
    file_parser = subparsers.add_parser('file', help='文件操作')
    file_subparsers = file_parser.add_subparsers(title='文件操作', dest='subcommand', help='文件操作子命令')

    # 删除项目文件
    file_delete_parser = file_subparsers.add_parser('delete', help='删除项目文件')
    file_delete_parser.add_argument('type', choices=['output', 'output-sn', 'yaml', 'yaml-sn'], help='删除文件类型')
    file_delete_parser.add_argument('ids', help='项目ID (使用,分隔多个ID)')
    file_delete_parser.add_argument('--force', action='store_true', help='强制删除文件，无需用户确认')

    # 列出项目文件
    file_list_parser = file_subparsers.add_parser('list', help='列出项目文件')
    file_list_parser.add_argument('id', help='项目ID')

    # 读取项目Excel文件
    read_excel_parser = project_subparsers.add_parser('read-excel', help='读取项目Excel文件')
    read_excel_parser.add_argument('id', help='项目ID')
    read_excel_parser.add_argument('file', help='Excel文件名')
    read_excel_parser.add_argument('--sheet', help='工作表名称（可选，默认第一个）')

    # 写入项目Excel文件
    write_excel_parser = project_subparsers.add_parser('write-excel', help='写入项目Excel文件')
    write_excel_parser.add_argument('id', help='项目ID')
    write_excel_parser.add_argument('file', help='Excel文件名')
    write_excel_parser.add_argument('data', help='JSON格式的写入数据')

    # 读取项目文本文件
    read_file_parser = project_subparsers.add_parser('read-file', help='读取项目文本文件')
    read_file_parser.add_argument('id', help='项目ID')
    read_file_parser.add_argument('path', help='相对于项目根目录的文件路径')

    # 写入项目文本文件
    write_file_parser = project_subparsers.add_parser('write-file', help='写入项目文本文件')
    write_file_parser.add_argument('id', help='项目ID')
    write_file_parser.add_argument('path', help='相对于项目根目录的文件路径')
    write_file_parser.add_argument('content', help='文件内容')

    # 列出项目文件（JSON格式）
    list_files_parser = project_subparsers.add_parser('list-files', help='列出项目文件（JSON格式）')
    list_files_parser.add_argument('id', help='项目ID')
    list_files_parser.add_argument('--type', choices=['excel', 'yaml', 'template', 'output', 'all'], default='all', help='文件类型过滤')

    # 全局选项
    parser.add_argument('--version', '-v', action='version', version='%(prog)s 3.0.0')
    parser.add_argument('--verbose', '-V', action='count', default=0, help='增加详细输出')
    parser.add_argument('--quiet', '-q', action='store_true', help='静默模式')

    args = parser.parse_args()

    # 如果没有提供命令，显示帮助信息
    if args.command is None:
        parser.print_help()
        sys.exit(0)

    try:
        processor = PreProcessing()
        processor.read_MC_para('MC_Para.xlsx')
        
        # 根据命令类型处理
        if args.command == 'project':
            handle_project_command(processor, args)
        elif args.command == 'render':
            handle_render_command(processor, args)
        elif args.command == 'label':
            handle_label_command(processor, args)
        elif args.command == 'file':
            handle_file_command(processor, args)
        elif args.command == 'validate':
            handle_validate_command(processor, args)
        elif args.command == 'diff':
            handle_diff_command(processor, args)
        else:
            print_error(f'未知命令: {args.command}')
            sys.exit(1)

    except Exception as e:
        print_error(str(e))
        if args.verbose:
            logger.error("命令执行异常", exc_info=True)
        sys.exit(1)


def handle_project_command(processor, args):
    """处理项目管理命令"""
    if args.subcommand == 'list':
        projects = []
        for i, name in enumerate(processor.project_name, 1):
            projects.append({
                'id': i,
                'name': name,
                'index': i - 1
            })
        
        # 无论格式参数是什么，都返回 JSON 格式的输出
        print(json.dumps({
            'status': 'success',
            'message': '项目列表获取成功',
            'data': projects
        }, ensure_ascii=False, indent=2))

    elif args.subcommand == 'create':
        # 检查项目是否已存在
        if args.name in processor.project_name:
            if args.force:
                print_warning(f'项目 "{args.name}" 已存在，将强制覆盖')
            else:
                print_error(f'项目 "{args.name}" 已存在，请使用 --force 参数强制覆盖')
                sys.exit(1)
        
        if args.template:
            processor.execute_create_from_template(args.name, args.template)
        else:
            processor.execute_create('project', args.name, empty=args.empty)
        print_success(f'项目 "{args.name}" 创建成功')

    elif args.subcommand == 'delete':
        # 处理项目ID
        target_ids = process_project_ids(args.ids, processor.project_name)
        
        if not args.force:
            names = ', '.join([processor.project_name[idx] for idx in target_ids])
            confirm = input(f'确认删除项目: {names} [y/N]: ')
            if confirm.lower() != 'y':
                print_info('操作已取消')
                sys.exit(0)
        
        for idx in sorted(target_ids, reverse=True):
            project_name = processor.project_name[idx]
            processor.execute_delete('project', str(idx + 1))
            print_success(f'项目 "{project_name}" 删除成功')

    elif args.subcommand == 'info':
        try:
            project_id = int(args.id)
            if project_id < 1 or project_id > len(processor.project_name):
                raise ValueError(f'项目ID {args.id} 无效')
            project_name = processor.project_name[project_id - 1]
            
            info = {
                'id': project_id,
                'name': project_name,
                'path': os.path.join(WORKSPACE_DIR, project_name),
                'exists': os.path.exists(os.path.join(WORKSPACE_DIR, project_name))
            }
            
            if info['exists']:
                project_dir = info['path']
                info['structure'] = {
                    'excel': os.path.exists(os.path.join(project_dir, 'excel')),
                    'templates': os.path.exists(os.path.join(project_dir, 'templates')),
                    'para': os.path.exists(os.path.join(project_dir, 'para.xlsx')),
                    'output': os.path.exists(os.path.join(project_dir, 'output')),
                    'yaml': os.path.exists(os.path.join(project_dir, 'yaml'))
                }
            
            if args.format == 'json':
                print(json.dumps({
                    'status': 'success',
                    'message': '项目信息获取成功',
                    'data': info
                }, ensure_ascii=False, indent=2))
            elif args.format == 'yaml':
                try:
                    import yaml
                    print(yaml.dump({
                        'status': 'success',
                        'message': '项目信息获取成功',
                        'data': info
                    }, default_flow_style=False, allow_unicode=True))
                except ImportError:
                    print_error('YAML格式需要安装PyYAML库')
            else:
                logger.info(f'项目信息:')
                logger.info(f'ID: {info["id"]}')
                logger.info(f'名称: {info["name"]}')
                logger.info(f'路径: {info["path"]}')
                logger.info(f'存在: {"是" if info["exists"] else "否"}')
                if info['exists']:
                    logger.info('结构:')
                    for key, value in info['structure'].items():
                        logger.info(f'  - {key}: {"存在" if value else "不存在"}')
                        
        except ValueError as e:
            print_error(str(e))
            sys.exit(1)

    elif args.subcommand == 'read-excel':
        try:
            project_id = int(args.id)
            if project_id < 1 or project_id > len(processor.project_name):
                raise ValueError(f'项目ID {args.id} 无效')
            project_name = processor.project_name[project_id - 1]
            project_dir = os.path.join(WORKSPACE_DIR, project_name)
            
            file_path = os.path.join(project_dir, 'excel', args.file)
            if not os.path.exists(file_path):
                raise FileNotFoundError(f'文件不存在: {file_path}')
            
            import openpyxl
            wb = openpyxl.load_workbook(file_path, data_only=True)
            sheet_name = args.sheet or wb.sheetnames[0]
            if sheet_name not in wb.sheetnames:
                raise ValueError(f'工作表 "{sheet_name}" 不存在')
            
            ws = wb[sheet_name]
            rows = []
            for row in ws.iter_rows(values_only=True):
                rows.append([str(cell) if cell is not None else '' for cell in row])
            
            headers = rows[0] if rows else []
            data_rows = []
            for row in rows[1:]:
                obj = {}
                for i, header in enumerate(headers):
                    obj[header] = row[i] if i < len(row) else ''
                data_rows.append(obj)
            
            print(json.dumps({
                'status': 'success',
                'message': f'成功读取 {args.file} / {sheet_name}',
                'data': {
                    'name': sheet_name,
                    'headers': headers,
                    'rows': data_rows
                }
            }, ensure_ascii=False))
            
        except Exception as e:
            print(json.dumps({
                'status': 'error',
                'message': str(e),
                'data': None
            }, ensure_ascii=False))
            sys.exit(1)

    elif args.subcommand == 'write-excel':
        try:
            project_id = int(args.id)
            if project_id < 1 or project_id > len(processor.project_name):
                raise ValueError(f'项目ID {args.id} 无效')
            project_name = processor.project_name[project_id - 1]
            project_dir = os.path.join(WORKSPACE_DIR, project_name)
            
            file_path = os.path.join(project_dir, 'excel', args.file)
            if not os.path.exists(file_path):
                raise FileNotFoundError(f'文件不存在: {file_path}')
            
            data = json.loads(args.data)
            sheet_name = data.get('sheet', 'Sheet1')
            headers = data.get('headers', [])
            rows = data.get('rows', [])
            
            import openpyxl
            wb = openpyxl.load_workbook(file_path)
            if sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
            else:
                ws = wb.create_sheet(sheet_name)
            
            for col_idx, header in enumerate(headers, 1):
                ws.cell(row=1, column=col_idx, value=header)
            
            for row_idx, row_data in enumerate(rows, 2):
                for col_idx, header in enumerate(headers, 1):
                    ws.cell(row=row_idx, column=col_idx, value=row_data.get(header, ''))
            
            wb.save(file_path)
            print(json.dumps({
                'status': 'success',
                'message': f'成功写入 {args.file} / {sheet_name}',
                'data': None
            }, ensure_ascii=False))
            
        except Exception as e:
            print(json.dumps({
                'status': 'error',
                'message': str(e),
                'data': None
            }, ensure_ascii=False))
            sys.exit(1)

    elif args.subcommand == 'read-file':
        try:
            project_id = int(args.id)
            if project_id < 1 or project_id > len(processor.project_name):
                raise ValueError(f'项目ID {args.id} 无效')
            project_name = processor.project_name[project_id - 1]
            project_dir = os.path.join(WORKSPACE_DIR, project_name)
            
            file_path = os.path.join(project_dir, args.path)
            if not os.path.exists(file_path):
                raise FileNotFoundError(f'文件不存在: {file_path}')
            
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            print(json.dumps({
                'status': 'success',
                'message': f'成功读取 {args.path}',
                'data': content
            }, ensure_ascii=False))
            
        except Exception as e:
            print(json.dumps({
                'status': 'error',
                'message': str(e),
                'data': None
            }, ensure_ascii=False))
            sys.exit(1)

    elif args.subcommand == 'write-file':
        try:
            project_id = int(args.id)
            if project_id < 1 or project_id > len(processor.project_name):
                raise ValueError(f'项目ID {args.id} 无效')
            project_name = processor.project_name[project_id - 1]
            project_dir = os.path.join(WORKSPACE_DIR, project_name)
            
            file_path = os.path.join(project_dir, args.path)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(args.content)
            
            print(json.dumps({
                'status': 'success',
                'message': f'成功写入 {args.path}',
                'data': None
            }, ensure_ascii=False))
            
        except Exception as e:
            print(json.dumps({
                'status': 'error',
                'message': str(e),
                'data': None
            }, ensure_ascii=False))
            sys.exit(1)

    elif args.subcommand == 'list-files':
        try:
            project_id = int(args.id)
            if project_id < 1 or project_id > len(processor.project_name):
                raise ValueError(f'项目ID {args.id} 无效')
            project_name = processor.project_name[project_id - 1]
            project_dir = os.path.join(WORKSPACE_DIR, project_name)
            
            if not os.path.exists(project_dir):
                raise FileNotFoundError(f'项目目录不存在: {project_dir}')
            
            def build_tree(dir_path, rel_path=''):
                entries = []
                try:
                    for entry in sorted(os.listdir(dir_path)):
                        if entry.startswith('.') or entry == '__pycache__':
                            continue
                        full = os.path.join(dir_path, entry)
                        rel = os.path.join(rel_path, entry) if rel_path else entry
                        if os.path.isdir(full):
                            children = build_tree(full, rel)
                            entries.append({
                                'name': entry,
                                'path': rel,
                                'isDirectory': True,
                                'children': children
                            })
                        else:
                            entries.append({
                                'name': entry,
                                'path': rel,
                                'isDirectory': False
                            })
                except PermissionError as e:
                    print(json.dumps({
                        'status': 'warning',
                        'message': f'跳过不可访问的目录: {e}',
                        'data': None
                    }, ensure_ascii=False))
                return entries
            
            files = build_tree(project_dir)
            
            print(json.dumps({
                'status': 'success',
                'message': f'项目 "{project_name}" 文件列表获取成功',
                'data': files
            }, ensure_ascii=False))
            
        except Exception as e:
            print(json.dumps({
                'status': 'error',
                'message': str(e),
                'data': None
            }, ensure_ascii=False))
            sys.exit(1)


def handle_render_command(processor, args):
    """处理配置渲染命令"""
    # 处理项目ID
    target_ids = process_project_ids(args.ids, processor.project_name)
    
    # 转换为项目编号字符串
    target_str = convert_to_project_string(target_ids)
    
    if args.subcommand == 'project':
        # 渲染项目配置
        format_type = 'device_sn' if args.format == 'device_sn' else 'device_name'
        processor.execute_render(target_str, format_type)
        print_success(f'项目配置渲染完成')
        
    elif args.subcommand == 'yaml':
        # 渲染YAML文件
        if args.format == 'device_sn':
            processor.execute_render(target_str, 'device_sn')
        else:
            processor.execute_yaml(target_str)
        print_success(f'YAML文件渲染完成')

    elif args.subcommand == 'undo':
        # 撤销渲染：恢复最近一次备份
        restored = 0
        for project_id in target_ids:
            name = processor.project_name[project_id - 1]
            project_dir = os.path.join(WORKSPACE_DIR, name)
            if processor._restore_backup(project_dir):
                restored += 1
        print_success(f'已恢复 {restored} 个项目的渲染输出')

    elif args.subcommand == 'dry-run':
        # 渲染预览：不写文件，返回输出内容
        format_type = 'device_sn' if args.format == 'device_sn' else 'device_name'
        processor.execute_dry_run(target_str, format_type)


def handle_label_command(processor, args):
    """处理标签功能命令"""
    # 处理项目ID
    target_ids = process_project_ids(args.ids, processor.project_name)

    # 转换为项目编号字符串
    target_str = convert_to_project_string(target_ids)

    # 解析 --config 参数 (JSON)
    label_config = None
    if getattr(args, 'config', None):
        try:
            import json as _json
            label_config = _json.loads(args.config)
        except Exception as _e:
            logger.error(f"无法解析 config 参数: {_e}，使用默认配置")

    if args.subcommand == 'print':
        processor.execute_feature('label-print', target_str, label_config)
        print_success('标签打印完成')

    elif args.subcommand == 'md':
        processor.execute_feature('label-md', target_str, label_config)
        print_success('标签Markdown生成完成')

    elif args.subcommand == 'delete':
        processor.execute_feature('label-delete', target_str)
        print_success('标签删除完成')


def handle_validate_command(processor, args):
    """处理校验命令"""
    target_ids = process_project_ids(args.ids, processor.project_name)
    target_str = convert_to_project_string(target_ids)

    if args.subcommand == 'template':
        processor.validate_template(target_str)
    elif args.subcommand == 'excel':
        processor.validate_excel(target_str)

def handle_diff_command(processor, args):
    """对比 dry-run 输出与已有输出文件"""
    import difflib
    project_dir = os.path.join(WORKSPACE_DIR, args.project)

    if args.format == 'device_sn':
        existing_path = os.path.join(project_dir, 'output-sn', f'conf_{args.device}.cfg')
    else:
        existing_path = os.path.join(project_dir, 'output', f'{args.device}.txt')

    existing_content = ''
    if os.path.exists(existing_path):
        try:
            with open(existing_path, 'r', encoding='utf-8') as f:
                existing_content = f.read()
        except:
            pass

    new_content = args.content
    if not existing_content:
        diff_lines = [f'[新增] 文件不存在: {existing_path}']
    else:
        differ = difflib.unified_diff(
            existing_content.splitlines(keepends=True),
            new_content.splitlines(keepends=True),
            fromfile=f'现有输出/{args.device}.txt',
            tofile=f'Dry-run 预览/{args.device}.txt',
            lineterm='',
        )
        diff_lines = list(differ)
        if not diff_lines:
            diff_lines = ['(无差异)']

    print(json.dumps({
        'status': 'success',
        'message': '对比完成',
        'data': {
            'diff': diff_lines,
            'hasExisting': bool(existing_content),
            'hasChanges': len(diff_lines) > 0 and diff_lines[0] != '(无差异)',
        },
    }, ensure_ascii=False))

def handle_file_command(processor, args):
    """处理文件操作命令"""
    if args.subcommand == 'delete':
        # 删除项目文件
        target_ids = process_project_ids(args.ids, processor.project_name)
        
        if not args.force:
            file_type_name = {
                'output': '输出文件',
                'output-sn': 'SN模式输出文件',
                'yaml': 'YAML文件',
                'yaml-sn': 'SN模式YAML文件'
            }
            names = ', '.join([processor.project_name[idx] for idx in target_ids])
            confirm = input(f'确认删除{file_type_name.get(args.type, args.type)}: {names} [y/N]: ')
            if confirm.lower() != 'y':
                print_info('操作已取消')
                sys.exit(0)
        
        target_str = convert_to_project_string(target_ids)
        processor.execute_delete(args.type, target_str)
        print_success(f'{args.type} 文件删除完成')
        
    elif args.subcommand == 'list':
        # 列出项目文件
        try:
            project_id = int(args.id)
            if project_id < 1 or project_id > len(processor.project_name):
                raise ValueError(f'项目ID {args.id} 无效')
            
            project_name = processor.project_name[project_id - 1]
            project_dir = os.path.join(WORKSPACE_DIR, project_name)
            
            if not os.path.exists(project_dir):
                print_error(f'项目目录不存在: {project_dir}')
                sys.exit(1)
            
            logger.info(f'项目 "{project_name}" 文件结构:')
            for root, dirs, files in os.walk(project_dir):
                level = root.replace(project_dir, '').count(os.sep)
                indent = ' ' * 2 * level
                logger.info(f'{indent}{os.path.basename(root)}/')
                subindent = ' ' * 2 * (level + 1)
                for file in files:
                    logger.info(f'{subindent}{file}')
                    
        except ValueError as e:
            print_error(str(e))
            sys.exit(1)


def process_project_ids(ids_str, project_names):
    """处理项目ID字符串"""
    if ids_str.strip().lower() == 'all':
        return list(range(len(project_names)))
    
    try:
        ids = []
        for part in ids_str.strip().split(','):
            part = part.strip()
            if part.isdigit():
                idx = int(part) - 1
                if idx < 0 or idx >= len(project_names):
                    raise ValueError(f'项目ID {part} 无效，范围应在1-{len(project_names)}之间')
                ids.append(idx)
        return ids
    except Exception as e:
        raise ValueError(f'无效的项目ID格式: {ids_str}')


def convert_to_project_string(ids):
    """将ID列表转换为项目编号字符串"""
    if len(ids) == 0:
        return ''
        
    if len(ids) == len(PreProcessing().project_name):
        return 'all'
        
    return '/'.join([str(idx + 1) for idx in ids])


def print_success(message):
    """打印成功信息"""
    print(f'\033[92m✓ {message}\033[0m')


def print_error(message):
    """打印错误信息"""
    print(f'\033[91m✗ {message}\033[0m')


def print_warning(message):
    """打印警告信息"""
    print(f'\033[93m⚠ {message}\033[0m')


def print_info(message):
    """打印信息"""
    print(f'\033[94mℹ {message}\033[0m')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print_error('\n操作被用户中断')
        sys.exit(1)
    except BrokenPipeError:
        # 处理管道中断错误
        sys.stderr.close()
        sys.exit(0)

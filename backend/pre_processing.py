import json
import logging
from base import Base
from ExcelToLabel import exceltolabel
import os
import shutil
import pandas as pd
from pandas import read_excel
from time import strftime, localtime
from config import WORKSPACE_DIR

logger = logging.getLogger(__name__)


class PreProcessing:

    explain_str = '''
基础操作命令说明————
[create | delete] project 项目名称
[print jinja_examples | render project | render yaml | delete output | delete yaml] 项目代号/项目代号/项目代号··· | all

编号     操作内容           操作部分项目示例            操作全部项目示例
 1       新建项目           create project 项目名称  
 2       渲染项目配置       render project 1/2          render project all
 3       渲染项目配置-sn    render-sn project 1/2       render-sn project all
 4       输出Yaml           render yaml 1/2             render yaml all
 5       删除旧数据         delete output 1/2           delete output all
 6       删除sn旧数据       delete output-sn 1/2        delete output-sn all
 7       删除旧Yaml         delete yaml 1/2             delete yaml all
 8       删除旧Yaml-sn      delete yaml-sn 1/2          delete yaml-sn all
 9       删除项目           delete project 1/2          delete project all
 99      退出运行           quit

插件操作命令说明————
feature [label-print | label-delete] 项目代号/项目代号/项目代号··· | all

编号     操作内容           操作部分项目示例            操作全部项目示例
 1       输出标签卡      feature label-print 1/2     feature label-print all
 1       删除标签卡      feature label-delete 1/2    feature label-delete all
 99      退出运行           quit
'''

    def __init__(self):
        self.project_para = []
        self.project_name = []
        self.target_project_name = []
        self.target_project_num = []

    def _get_base_path(self):
        """获取工作区目录"""
        return WORKSPACE_DIR

    def _calc_render_steps(self, include_template_render: bool = True):
        """按项目表数量计算真实渲染步骤数。"""
        extra_steps = 2 if include_template_render else 1
        total = 0
        for i, name in enumerate(self.target_project_name):
            para = self.project_para[self.target_project_num[i]].get(name, [])
            total += len(para) + extra_steps
        return max(total, 1)

    def _emit_progress(self, current_step: int, total_steps: int, message: str, **data):
        """输出统一进度事件。"""
        print(json.dumps({
            'status': 'progress',
            'message': message,
            'data': {
                'step': current_step,
                'totalSteps': total_steps,
                'progress': min(100, int(current_step / total_steps * 100)),
                **data,
            }
        }, ensure_ascii=False))

    def _safe_remove_dir(self, dir_path: str, success_msg: str, fail_msg: str):
        """安全删除目录（性能优化版）"""
        import time
        start_time = time.time()
        
        try:
            if not os.path.exists(dir_path):
                logger.warning(fail_msg)
                return False
                
            # 使用 shutil.rmtree 删除目录，并设置忽略错误
            shutil.rmtree(dir_path, ignore_errors=False, onerror=self._rmtree_error_handler)
            
            # 计算删除操作的执行时间
            execution_time = time.time() - start_time
            
            logger.info(f"{success_msg} (耗时: {execution_time:.2f}秒)")
            return True
            
        except PermissionError as info:
            logger.error(f"权限错误: {info}")
            return False
        except Exception as e:
            logger.error(f'删除异常，请核查！{e}', exc_info=True)
            return False
    
    def _rmtree_error_handler(self, func, path, exc_info):
        """处理 shutil.rmtree 的错误"""
        import stat
        
        try:
            # 尝试修改文件权限
            os.chmod(path, stat.S_IWUSR)
            # 再次尝试删除
            func(path)
        except Exception as e:
            logger.error(f"无法删除 {path}: {e}", exc_info=True)
            raise

    def read_MC_para(self, excel_MC: str):
        """读取项目名称，并合并工作区中已存在的项目目录。"""
        import time
        start_time = time.time()
        
        mid_path = self._get_base_path()
        filepath = os.path.join(mid_path, excel_MC)
        self.project_name = []
        
        need_sync_mc_para = False
        try:
            data = read_excel(filepath, sheet_name=None, keep_default_na=False)
            for sheet, value in data.items():
                if sheet == '项目名称':
                    for i in value.index.values:
                        project_name = str(value['项目名称'][i]).strip()
                        project_dir = os.path.join(mid_path, project_name)
                        has_project_shape = project_name and os.path.isdir(project_dir) and any(
                            os.path.exists(os.path.join(project_dir, name))
                            for name in ('para.xlsx', 'excel', 'templates', 'output', 'yaml')
                        )
                        if has_project_shape and project_name not in self.project_name:
                            self.project_name.append(project_name)
                        elif project_name:
                            need_sync_mc_para = True
        except Exception as e:
            need_sync_mc_para = True
            logger.error(f"读取项目名称失败: {e}", exc_info=True)

        try:
            if os.path.isdir(mid_path):
                ignored_dirs = {'__pycache__', 'assets', 'node_modules'}
                for entry in sorted(os.listdir(mid_path)):
                    project_dir = os.path.join(mid_path, entry)
                    if entry.startswith('.') or entry in ignored_dirs or not os.path.isdir(project_dir):
                        continue
                    has_project_shape = any(
                        os.path.exists(os.path.join(project_dir, name))
                        for name in ('para.xlsx', 'excel', 'templates', 'output', 'yaml')
                    )
                    if has_project_shape and entry not in self.project_name:
                        self.project_name.append(entry)
                        need_sync_mc_para = True
        except Exception as e:
            logger.error(f"扫描项目目录失败: {e}", exc_info=True)

        if need_sync_mc_para:
            try:
                pd.DataFrame({'项目名称': self.project_name}).to_excel(
                    filepath,
                    sheet_name='项目名称',
                    index=False,
                    header=True,
                )
                logger.info(f"已同步项目登记表: {filepath}")
            except Exception as e:
                logger.error(f"同步项目登记表失败: {e}", exc_info=True)

        execution_time = time.time() - start_time
        logger.info(f"读取项目名称完成 (耗时: {execution_time:.2f}秒, 项目数量: {len(self.project_name)})")

    def process_project_num(self, word: str):
        """处理项目编号"""
        if word == 'all':
            self.target_project_name = self.project_name[:]
            self.target_project_num = list(range(0, len(self.target_project_name)))
        else:
            num = word.split('/')
            for n in num:
                idx = int(n) - 1
                self.target_project_name.append(self.project_name[idx])
                self.target_project_num.append(idx)

    def read_project_para(self, name: str, excel_para: str):
        """实现各个项目具体的参数提取功能（性能优化版）"""
        import time
        start_time = time.time()
        
        mid_path = self._get_base_path()
        filepath = os.path.join(mid_path, name, excel_para)
        
        try:
            data = read_excel(filepath, sheet_name=None, keep_default_na=False)
            for sheet, value in data.items():
                if sheet == 'project_para':
                    project_list = []
                    for i in value.index.values:
                        tmp_list = [
                            {'工作簿名称': str(value['工作簿名称'][i]).strip()},
                            {'工作表名称': str(value['工作表名称'][i]).strip()},
                            {'工作表类型': str(value['工作表类型'][i]).strip()},
                            {'对称列数': value['对称列数'][i]},
                            {'key列数': value['key列数'][i]},
                        ]
                        project_list.append(tmp_list)
                    self.project_para.append({name: project_list})
            
            # 计算读取操作的执行时间
            execution_time = time.time() - start_time
            logger.info(f"读取项目 '{name}' 参数完成 (耗时: {execution_time:.2f}秒, 参数数量: {len(project_list)})")
            
        except Exception as e:
            logger.error(f"读取项目 '{name}' 参数失败: {e}", exc_info=True)

    def choose_operation(self):
        """实现命令操作识别功能"""
        while True:
            print()
            self.print_name()
            cmd = input('请输入命令:')
            cmd_list = (cmd.lower()).split(' ')

            if cmd_list[0] == 'quit':
                break
            elif len(cmd_list) != 3:
                print('命令行参数个数有误，请重新输入！')
                continue
            elif cmd_list[0] == 'create':
                if cmd_list[1] != 'project':
                    print('create命令参数输入有误，请重新输入')
                    continue
                y_or_n = self.second_judge(cmd_list)
                if y_or_n == 'n':
                    continue
                elif y_or_n == 'error':
                    print('输入有误，命名无效，请重新输入create命令')
                    continue
                self.execute_create(cmd_list[1], cmd_list[2])
                self.read_MC_para('MC_Para.xlsx')
            elif cmd_list[0] == 'render':
                ans = self.first_judge(cmd_list[1], cmd_list[2])
                if not ans:
                    print('render命令参数输入有误，请重新输入')
                    continue
                y_or_n = self.second_judge(cmd_list)
                if y_or_n == 'n':
                    continue
                elif y_or_n == 'error':
                    print('输入有误，命名无效，请重新输入render命令')
                    continue
                if cmd_list[1] == 'yaml':
                    self.execute_yaml(cmd_list[2])
                elif cmd_list[1] == 'project':
                    self.execute_render(cmd_list[2], 'device_name')
                else:
                    print('输入有误，命名无效，请重新输入render命令')
            elif cmd_list[0] == 'delete':
                ans = self.first_judge(cmd_list[1], cmd_list[2])
                if not ans:
                    print('delete命令参数输入有误，请重新输入')
                    continue
                y_or_n = self.second_judge(cmd_list)
                if y_or_n == 'n':
                    continue
                elif y_or_n == 'error':
                    print('输入有误，命名无效，请重新输入delete命令')
                    continue
                if cmd_list[1] in ('output', 'output-sn', 'yaml-sn', 'project', 'yaml'):
                    self.execute_delete(cmd_list[1], cmd_list[2])
                else:
                    print('delete命令参数输入有误，请重新输入')
                self.read_MC_para('MC_Para.xlsx')
            elif cmd_list[0] == 'render-sn':
                ans = self.first_judge(cmd_list[1], cmd_list[2])
                if not ans:
                    print('render-sn命令参数输入有误，请重新输入')
                    continue
                y_or_n = self.second_judge(cmd_list)
                if y_or_n == 'n':
                    continue
                elif y_or_n == 'error':
                    print('输入有误，命名无效，请重新输入render-sn命令')
                    continue
                if cmd_list[1] == 'project':
                    self.execute_render(cmd_list[2], 'device_sn')
                else:
                    print('输入有误，命名无效，请重新输入render-sn命令')
            elif cmd_list[0] == 'feature':
                ans = self.first_judge(cmd_list[1], cmd_list[2])
                if not ans:
                    print('feature命令参数输入有误，请重新输入')
                    continue
                y_or_n = self.second_judge(cmd_list)
                if y_or_n == 'n':
                    continue
                elif y_or_n == 'error':
                    print('输入有误，命名无效，请重新输入feature命令')
                    continue
                if cmd_list[1] in ('label-print', 'label-delete'):
                    self.execute_feature(cmd_list[1], cmd_list[2])
                else:
                    print('feature命令参数输入有误，请重新输入')
            else:
                print('输入命令有误，请重新输入')

    def print_name(self):
        """输出项目的名称和代号"""
        print(self.explain_str)
        print('项目代号  项目名称')
        for i, p in enumerate(self.project_name, 1):
            print(f'   {i}      {p}')

    def first_judge(self, cmd_type: str, para: str):
        """命令参数标准化判断"""
        valid_types = {'project', 'output', 'yaml', 'output-sn', 'yaml-sn', 'label-print', 'label-delete'}
        if cmd_type.strip() not in valid_types:
            return False
        if para == 'all':
            return True
        p_list = para.split('/')
        for p in p_list:
            if not p.isdigit() or p == '0' or int(p) > len(self.project_name):
                return False
        return True

    def second_judge(self, cmd_list: list):
        """输入命令后的二次判断"""
        cmd = cmd_list[0]
        target = cmd_list[2]

        def ask_confirm(message: str):
            tmp = input(message)
            if tmp.lower() == 'n':
                return 'n'
            elif tmp.lower() == 'y':
                return 'y'
            else:
                return 'error'

        if cmd == 'create':
            return ask_confirm(f'即将新建项目 {target} 目录，请确认信息无误[y/n]')

        elif cmd in ('render', 'render-sn'):
            if cmd_list[1] not in ('project', 'yaml'):
                return 'error'
            names = '所有项目' if target == 'all' else ' '.join(self.project_name[int(n) - 1] for n in target.split('/'))
            suffix = '的yaml' if cmd_list[1] == 'yaml' else '项目'
            return ask_confirm(f'即将处理 {names} {suffix}，请确认信息无误[y/n]')

        elif cmd == 'delete':
            names = '所有项目' if target == 'all' else ' '.join(self.project_name[int(n) - 1] for n in target.split('/'))
            type_map = {
                'project': '项目',
                'output': '输出文件夹',
                'output-sn': 'sn输出文件夹',
                'yaml': 'yaml文件夹',
                'yaml-sn': 'yaml-sn文件夹',
            }
            suffix = type_map.get(cmd_list[1], '')
            return ask_confirm(f'即将删除 {names} 的{suffix}，请确认信息无误[y/n]')

        elif cmd == 'feature':
            if cmd_list[1] not in ('label-print', 'label-delete'):
                return 'error'
            names = '所有项目' if target == 'all' else ' '.join(self.project_name[int(n) - 1] for n in target.split('/'))
            suffix = '的标签卡转换' if cmd_list[1] == 'label-print' else '的标签卡转换结果'
            return ask_confirm(f'即将处理 {names} {suffix}，请确认信息无误[y/n]')

        return 'error'

    def execute_render(self, word: str, out_name_type: str):
        """执行选中项目的渲染"""
        time_str = strftime("%Y_%m_%d_%H_%M_%S", localtime())
        self.target_project_name = []
        self.target_project_num = []
        self.project_para = []
        self.process_project_num(word)

        for name in self.project_name:
            self.read_project_para(name, 'para.xlsx')

        total_steps = self._calc_render_steps(include_template_render=True)
        current_step = 0

        for i in range(0, len(self.target_project_name)):
            name = self.target_project_name[i]
            ba = Base()
            para = self.project_para[self.target_project_num[i]][name]

            for p in para:
                project_excel_name = p[0]['工作簿名称']
                project_sheet_name = p[1]['工作表名称']
                project_sheet_type = p[2]['工作表类型']
                project_sheet_assign_num = int(str(p[3]['对称列数']).strip())
                project_sheet_key_num = int(str(p[4]['key列数']).strip())

                if project_sheet_type == '赋值表':
                    ba.read_assign_table(project_excel_name, project_sheet_name, 'excel', name, project_sheet_key_num)
                elif project_sheet_type == '对称表':
                    ba.read_symmetrice_table(project_excel_name, project_sheet_name, 'excel', name, project_sheet_assign_num, project_sheet_key_num)
                elif project_sheet_type == '参数表':
                    ba.read_para(project_excel_name, project_sheet_name, 'excel', name)
                else:
                    continue

                current_step += 1
                self._emit_progress(
                    current_step,
                    total_steps,
                    f'完成{project_excel_name} {project_sheet_name} 的数据提取',
                    project=name,
                    excel=project_excel_name,
                    sheet=project_sheet_name,
                    type=project_sheet_type,
                    action='extract_sheet',
                )

            if out_name_type == 'device_name':
                ba.out_base_info('yaml', name, time_str, 'device_name')
                current_step += 1
                self._emit_progress(
                    current_step,
                    total_steps,
                    f'项目 {name} 完成yaml文件的保存',
                    project=name,
                    action='yaml_save',
                )

                ba.render_txt('templates', name, time_str, 'device_name')
                current_step += 1
                self._emit_progress(
                    current_step,
                    total_steps,
                    f'项目 {name} jinja2运行完毕',
                    project=name,
                    action='jinja_render',
                )
            elif out_name_type == 'device_sn':
                ba.out_base_info('yaml-sn', name, time_str, 'device_sn')
                current_step += 1
                self._emit_progress(
                    current_step,
                    total_steps,
                    f'项目 {name} 完成yaml文件的保存',
                    project=name,
                    action='yaml_save',
                )

                ba.render_txt('templates', name, time_str, 'device_sn')
                current_step += 1
                self._emit_progress(
                    current_step,
                    total_steps,
                    f'项目 {name} jinja2运行完毕',
                    project=name,
                    action='jinja_render',
                )

        print(json.dumps({
            'status': 'complete',
            'message': '程序运行结束，请在目标项目的output文件夹内查看输出结果！',
            'data': {
                'totalSteps': total_steps,
                'completedSteps': total_steps,
                'progress': 100
            }
        }, ensure_ascii=False))

    def execute_yaml(self, word: str):
        """执行选中项目的yaml创建"""
        time_str = strftime("%Y_%m_%d_%H_%M_%S", localtime())
        self.target_project_name = []
        self.target_project_num = []
        self.project_para = []
        self.process_project_num(word)

        for name in self.project_name:
            self.read_project_para(name, 'para.xlsx')

        total_steps = self._calc_render_steps(include_template_render=False)
        current_step = 0

        for i in range(0, len(self.target_project_name)):
            name = self.target_project_name[i]
            ba = Base()
            para = self.project_para[self.target_project_num[i]][name]

            for p in para:
                project_excel_name = p[0]['工作簿名称']
                project_sheet_name = p[1]['工作表名称']
                project_sheet_type = p[2]['工作表类型']
                project_sheet_assign_num = int(str(p[3]['对称列数']).strip())
                project_sheet_key_num = int(str(p[4]['key列数']).strip())

                if project_sheet_type == '赋值表':
                    ba.read_assign_table(project_excel_name, project_sheet_name, 'excel', name, project_sheet_key_num)
                elif project_sheet_type == '对称表':
                    ba.read_symmetrice_table(project_excel_name, project_sheet_name, 'excel', name, project_sheet_assign_num, project_sheet_key_num)
                elif project_sheet_type == '参数表':
                    ba.read_para(project_excel_name, project_sheet_name, 'excel', name)
                else:
                    continue

                current_step += 1
                self._emit_progress(
                    current_step,
                    total_steps,
                    f'完成{project_excel_name} {project_sheet_name} 的数据提取',
                    project=name,
                    excel=project_excel_name,
                    sheet=project_sheet_name,
                    type=project_sheet_type,
                    action='extract_sheet',
                )

            ba.out_base_info('yaml', name, time_str, 'device_name')
            current_step += 1
            self._emit_progress(
                current_step,
                total_steps,
                f'项目 {name} 完成yaml文件的保存',
                project=name,
                action='yaml_save',
            )

        print(json.dumps({
            'status': 'complete',
            'message': '程序运行结束，请在目标项目的yaml文件夹内查看输出结果！',
            'data': {
                'totalSteps': total_steps,
                'completedSteps': total_steps,
                'progress': 100
            }
        }, ensure_ascii=False))

    def _write_demo_excel(self, path: str, sheet_name: str, rows: list):
        """写入示例 Excel，并保持表头/列宽便于新手查看。"""
        df = pd.DataFrame(rows)
        with pd.ExcelWriter(path, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name=sheet_name, index=False)

        try:
            from openpyxl import load_workbook
            from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
            from openpyxl.utils import get_column_letter

            wb = load_workbook(path)
            ws = wb[sheet_name]
            header_fill = PatternFill('solid', fgColor='1F4E78')
            header_font = Font(color='FFFFFF', bold=True, name='Arial')
            thin = Side(style='thin', color='D9DEE7')
            border = Border(left=thin, right=thin, top=thin, bottom=thin)
            zebra = [PatternFill('solid', fgColor='FFFFFF'), PatternFill('solid', fgColor='F7F9FC')]

            for row in ws.iter_rows():
                for cell in row:
                    cell.border = border
                    cell.font = Font(name='Arial')
                    cell.alignment = Alignment(vertical='top', wrap_text=True)

            for cell in ws[1]:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal='center', vertical='center')

            for row_index in range(2, ws.max_row + 1):
                fill = zebra[(row_index - 2) % 2]
                for col_index in range(1, ws.max_column + 1):
                    ws.cell(row_index, col_index).fill = fill

            for col_index in range(1, ws.max_column + 1):
                max_len = max(
                    len(str(ws.cell(row=row_index, column=col_index).value or ''))
                    for row_index in range(1, ws.max_row + 1)
                )
                ws.column_dimensions[get_column_letter(col_index)].width = min(max(max_len + 2, 10), 45)

            wb.save(path)
        except Exception as e:
            logger.warning(f'示例 Excel 样式写入失败，不影响数据生成: {e}')

    def _create_demo_project_files(self, project_dir: str):
        """生成可直接渲染的接入交换机示例项目。"""
        excel_dir = os.path.join(project_dir, 'excel')
        templates_dir = os.path.join(project_dir, 'templates')
        os.makedirs(excel_dir, exist_ok=True)
        os.makedirs(templates_dir, exist_ok=True)
        os.makedirs(os.path.join(project_dir, 'output'), exist_ok=True)
        os.makedirs(os.path.join(project_dir, 'yaml'), exist_ok=True)

        self._write_demo_excel(os.path.join(project_dir, 'para.xlsx'), 'project_para', [
            {'工作簿名称': 'hostname.xlsx', '工作表名称': '主机表', '工作表类型': '赋值表', '对称列数': 0, 'key列数': 1},
            {'工作簿名称': 'connection.xlsx', '工作表名称': '终端连接表', '工作表类型': '赋值表', '对称列数': 0, 'key列数': 2},
            {'工作簿名称': 'ipaddress.xlsx', '工作表名称': '网关地址表', '工作表类型': '赋值表', '对称列数': 0, 'key列数': 2},
            {'工作簿名称': 'parameter.xlsx', '工作表名称': '参数表', '工作表类型': '参数表', '对称列数': 0, 'key列数': 1},
        ])
        self._write_demo_excel(os.path.join(excel_dir, 'hostname.xlsx'), '主机表', [
            {'设备名': 'SW-ACCESS-01', '型号': 'H3C S5560X Demo', '角色': 'ASW', '楼层': '3F', '机柜': '弱电间A', 'U数': 36, '管理接口': 'Vlan-interface10', '管理IP': '192.168.10.11', '掩码': 24, 'SN': 'DEMO-SN-0001'},
        ])
        self._write_demo_excel(os.path.join(excel_dir, 'connection.xlsx'), '终端连接表', [
            {'己端设备': 'SW-ACCESS-01', '己端接口': 'GigabitEthernet1/0/1', '接入VLAN': 20, '接口类型': 'RJ45', '线缆类型': '网线', '终端名称': '办公区-PC-001', '备注信息': '办公网接入口'},
        ])
        self._write_demo_excel(os.path.join(excel_dir, 'ipaddress.xlsx'), '网关地址表', [
            {'己端设备': 'SW-ACCESS-01', '网关接口': 'Vlan-interface10', '管理VLAN': 10, '网关IP': '192.168.10.11', '网关掩码': 24, '备注': '管理地址'},
        ])
        self._write_demo_excel(os.path.join(excel_dir, 'parameter.xlsx'), '参数表', [
            {'全局参数名称': '本地用户名', '参数值': 'netadmin'},
            {'全局参数名称': '本地用户密钥', '参数值': 'ChangeMe_123'},
            {'全局参数名称': 'SSH使能', '参数值': 'yes'},
            {'全局参数名称': 'SSH端口', '参数值': 22},
            {'全局参数名称': '默认路由下一跳', '参数值': '192.168.10.1'},
            {'全局参数名称': 'NTP地址', '参数值': '192.168.10.100,192.168.10.101'},
            {'全局参数名称': 'LOGHOST地址', '参数值': '192.168.10.102'},
            {'全局参数名称': 'SNMP团体名', '参数值': 'demo_ro'},
            {'全局参数名称': 'SNMP地址', '参数值': '192.168.10.103'},
        ])

        asw_template = """# MagicCommander 示例：接入交换机开局配置
# 模板文件 ASW.j2 与 hostname.xlsx 中的 角色=ASW 对应
sysname {{ info['设备名'] }}
#
vlan {{ info['管理VLAN'] }}
 description MGMT
#
vlan {{ info['接入VLAN'] }}
 description OFFICE_ACCESS
#
interface {{ info['网关接口'] }}
 description {{ info['备注'] }}
 ip address {{ info['网关IP'] }} {{ info['网关掩码'] }}
#
interface {{ info['己端接口'] }}
 description TO-{{ info['终端名称'] }}
 port link-mode bridge
 port access vlan {{ info['接入VLAN'] }}
#
local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
 authorization-attribute user-role network-admin
#
{% if info['SSH使能'] == 'yes' %}
ssh server enable
ssh server port {{ info['SSH端口'] }}
{% endif %}
#
{% if info['NTP地址'][0] == 'list' %}
{% for ntp in info['NTP地址'][1:] %}
ntp-service unicast-server {{ ntp }}
{% endfor %}
{% endif %}
#
info-center loghost {{ info['LOGHOST地址'] }}
snmp-agent community read {{ info['SNMP团体名'] }}
snmp-agent target-host trap address udp-domain {{ info['SNMP地址'] }} params securityname {{ info['SNMP团体名'] }}
#
ip route-static 0.0.0.0 0.0.0.0 {{ info['默认路由下一跳'] }}
#
return
"""
        with open(os.path.join(templates_dir, 'ASW.j2'), 'w', encoding='utf-8') as fp:
            fp.write(asw_template)

        readme = """# 接入交换机配置示例

这是一个 MagicCommander 示例项目，用于演示如何通过 Excel + Jinja2 模板生成一台接入交换机的开局配置。

## 后端渲染规则

MagicCommander 当前按设备的“角色”字段选择模板：

- `excel/hostname.xlsx` 的 `角色` 字段为 `ASW`
- 渲染时会加载 `templates/ASW.j2`
- 模板中通过 `info['字段名']` 读取 Excel 汇总后的设备数据

因此，如果你把角色改成 `CORE`，就需要同步创建 `templates/CORE.j2`。

## 文件说明

- `para.xlsx`：声明后端要读取哪些 Excel、Sheet，以及读取类型。
- `excel/hostname.xlsx`：设备基础信息，包括设备名、角色、管理接口、管理 IP、SN。
- `excel/connection.xlsx`：示例接入口信息，包括接口名、终端名称、接入 VLAN。
- `excel/ipaddress.xlsx`：管理三层接口和管理 VLAN 信息。
- `excel/parameter.xlsx`：全局参数，如本地账号、SSH、NTP、Syslog、默认路由。
- `templates/ASW.j2`：接入交换机配置模板。

## 使用步骤

1. 在软件中选择该项目。
2. 查看或修改 `excel/*.xlsx` 中的示例参数。
3. 点击“渲染配置”，或在命令行执行：`python main.py render project <项目ID>`。
4. 到 `output/时间戳/ASW/` 查看生成的配置文件。
5. 到 `yaml/时间戳/ASW/` 查看中间 YAML 数据。

## 字段设计说明

当前后端会把同一台设备的多张表数据合并到一个 `info` 字典中。不同表里如果出现同名字段，后读取的值可能覆盖先读取的值。

所以本示例特意区分了：

- `接入VLAN`：用于接入口 `port access vlan`
- `管理VLAN`：用于管理 VLAN 和管理接口

请尽量避免在不同 Excel 表中重复使用含义不同的同名字段。

## 示例配置包含

- 设备名称
- 管理 VLAN
- 接入 VLAN
- 管理 IP
- 接入口描述
- 本地用户账号和密码
- SSH 服务
- NTP
- Syslog
- SNMP 简单示例
- 默认路由

## 安全提示

本示例账号和密码仅用于演示：

- 示例账号：`netadmin`
- 示例密码：`ChangeMe_123`

请勿在生产网络中直接使用示例密码。实际部署时，请按设备厂商要求使用加密口令、强密码策略、AAA/RADIUS/TACACS+ 等安全机制。

## 当前限制

第一版示例只放一条典型接入口。当前 `赋值表` 对同一台设备的多行普通字段不天然形成接口列表，后续如需批量生成多个接入口，建议进一步增强后端数据结构或使用可嵌套的表结构。
"""
        with open(os.path.join(project_dir, 'README.md'), 'w', encoding='utf-8') as fp:
            fp.write(readme)

    def execute_create(self, cmd_type: str, para: str):
        """实现项目创建功能"""
        mid_path = self._get_base_path()
        tar_path1 = os.path.join(mid_path, para)

        judge = False
        if not os.path.exists(tar_path1):
            os.makedirs(tar_path1, exist_ok=True)
        else:
            ans = input(f'{para} 项目目录已存在，请选择是否覆盖[y/n]')
            if ans.lower() == 'y':
                shutil.rmtree(tar_path1)
                judge = True
                os.makedirs(tar_path1, exist_ok=True)
            elif ans.lower() == 'n':
                return

        self._create_demo_project_files(tar_path1)

        if judge:
            return

        mc_para_path = os.path.join(mid_path, 'MC_Para.xlsx')
        df = pd.read_excel(mc_para_path)
        if para not in df['项目名称'].astype(str).tolist():
            df.loc[len(df)] = [para]
            df.to_excel(mc_para_path, sheet_name='项目名称', index=False, header=True)

    def execute_delete(self, cmd_type: str, para: str):
        """实现项目的目录删除功能"""
        mid_path = self._get_base_path()

        if cmd_type == 'project':
            if para == 'all':
                rem_name = list(self.project_name)
            else:
                rem_name = []
                for n in para.split('/'):
                    idx = int(n) - 1
                    if 0 <= idx < len(self.project_name):
                        rem_name.append(self.project_name[idx])

            for name in rem_name:
                dir_path = os.path.join(mid_path, name)
                self._safe_remove_dir(dir_path, f'{name} 项目删除成功', f'{name} 项目不存在，继续清理登记表')
                self._remove_from_mc_para(name)
                if name in self.project_name:
                    self.project_name.remove(name)
        else:
            # yaml, yaml-sn, output, output-sn, output-label
            folder_map = {
                'yaml': 'yaml',
                'yaml-sn': 'yaml-sn',
                'output': 'output',
                'output-sn': 'output-sn',
                'output-label': 'output-label',
            }
            folder_name = folder_map.get(cmd_type)
            if not folder_name:
                return

            if para == 'all':
                for name in self.project_name:
                    dir_path = os.path.join(mid_path, name, folder_name)
                    self._safe_remove_dir(dir_path, f'{name} 项目{folder_name}文件夹删除成功', f'{name} 不存在{folder_name}文件夹，删除无效')
            else:
                for n in para.split('/'):
                    name = self.project_name[int(n) - 1]
                    dir_path = os.path.join(mid_path, name, folder_name)
                    self._safe_remove_dir(dir_path, f'{name} 项目{folder_name}文件夹删除成功', f'{name} 不存在{folder_name}文件夹，删除无效')

    def _remove_from_mc_para(self, name: str):
        """从MC_Para表格中移除项目"""
        mid_path = self._get_base_path()
        mc_para_path = os.path.join(mid_path, 'MC_Para.xlsx')
        try:
            df = pd.read_excel(mc_para_path)
            df = df[~df['项目名称'].isin([name])]
            df.to_excel(mc_para_path, sheet_name='项目名称', index=False, header=True)
        except Exception as e:
            logger.error(f'更新MC_Para失败: {e}', exc_info=True)

    def execute_feature(self, cmd_type: str, para: str, config=None):
        """实现项目的标签卡转换 (config 支持纸张/方向/边距/每页数量/标签尺寸)"""
        mid_path = self._get_base_path()

        if cmd_type == 'label-print':
            time_str = strftime("%Y_%m_%d_%H_%M_%S", localtime())
            self.target_project_name = []
            self.target_project_num = []
            self.process_project_num(para)
            exceltolabel(self.target_project_name, time_str, config)
        elif cmd_type == 'label-delete':
            if para == 'all':
                for name in self.project_name:
                    dir_path = os.path.join(mid_path, name, 'output-label')
                    self._safe_remove_dir(dir_path, f'{name} 项目output-label文件夹删除成功', f'{name} 不存在output-label文件夹，删除无效')
            else:
                for n in para.split('/'):
                    name = self.project_name[int(n) - 1]
                    dir_path = os.path.join(mid_path, name, 'output-label')
                    self._safe_remove_dir(dir_path, f'{name} 项目output-label文件夹删除成功', f'{name} 不存在output-label文件夹，删除无效')

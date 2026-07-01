import json
from base import Base
from ExcelToLabel import exceltolabel
import os
import shutil
import pandas as pd
from pandas import read_excel
from time import strftime, localtime
from config import WORKSPACE_DIR


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

    def _safe_remove_dir(self, dir_path: str, success_msg: str, fail_msg: str):
        """安全删除目录（性能优化版）"""
        import time
        start_time = time.time()
        
        try:
            if not os.path.exists(dir_path):
                print(fail_msg)
                return False
                
            # 使用 shutil.rmtree 删除目录，并设置忽略错误
            shutil.rmtree(dir_path, ignore_errors=False, onerror=self._rmtree_error_handler)
            
            # 计算删除操作的执行时间
            execution_time = time.time() - start_time
            
            print(f"{success_msg} (耗时: {execution_time:.2f}秒)")
            return True
            
        except PermissionError as info:
            print(f"权限错误: {info}")
            return False
        except Exception as e:
            print(f'删除异常，请核查！{e}')
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
            print(f"无法删除 {path}: {e}")
            raise

    def read_MC_para(self, excel_MC: str):
        """实现所有项目名称的提取功能（性能优化版）"""
        import time
        start_time = time.time()
        
        mid_path = self._get_base_path()
        filepath = os.path.join(mid_path, excel_MC)
        
        try:
            data = read_excel(filepath, sheet_name=None, keep_default_na=False)
            for sheet, value in data.items():
                if sheet == '项目名称':
                    for i in value.index.values:
                        project_name = str(value['项目名称'][i]).strip()
                        if project_name and project_name not in self.project_name:
                            self.project_name.append(project_name)
            
            # 计算读取操作的执行时间
            execution_time = time.time() - start_time
            print(f"读取项目名称完成 (耗时: {execution_time:.2f}秒, 项目数量: {len(self.project_name)})")
            
        except Exception as e:
            print(f"读取项目名称失败: {e}")

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
            print(f"读取项目 '{name}' 参数完成 (耗时: {execution_time:.2f}秒, 参数数量: {len(project_list)})")
            
        except Exception as e:
            print(f"读取项目 '{name}' 参数失败: {e}")

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

        total_steps = len(self.target_project_name)
        current_step = 0

        for i in range(0, len(self.target_project_name)):
            current_step += 1
            name = self.target_project_name[i]
            print(json.dumps({
                'status': 'progress',
                'message': f'执行项目：{name} 渲染',
                'data': {
                    'step': current_step,
                    'totalSteps': total_steps,
                    'project': name,
                    'progress': int(current_step / total_steps * 100)
                }
            }, ensure_ascii=False))

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
                    print(json.dumps({
                        'status': 'info',
                        'message': f'完成{project_excel_name} {project_sheet_name} 的数据提取',
                        'data': {
                            'step': current_step,
                            'totalSteps': total_steps,
                            'project': name,
                            'excel': project_excel_name,
                            'sheet': project_sheet_name,
                            'type': project_sheet_type
                        }
                    }, ensure_ascii=False))
                elif project_sheet_type == '对称表':
                    ba.read_symmetrice_table(project_excel_name, project_sheet_name, 'excel', name, project_sheet_assign_num, project_sheet_key_num)
                    print(json.dumps({
                        'status': 'info',
                        'message': f'完成{project_excel_name} {project_sheet_name} 的数据提取',
                        'data': {
                            'step': current_step,
                            'totalSteps': total_steps,
                            'project': name,
                            'excel': project_excel_name,
                            'sheet': project_sheet_name,
                            'type': project_sheet_type
                        }
                    }, ensure_ascii=False))
                elif project_sheet_type == '参数表':
                    ba.read_para(project_excel_name, project_sheet_name, 'excel', name)
                    print(json.dumps({
                        'status': 'info',
                        'message': f'完成{project_excel_name} {project_sheet_name} 的数据提取',
                        'data': {
                            'step': current_step,
                            'totalSteps': total_steps,
                            'project': name,
                            'excel': project_excel_name,
                            'sheet': project_sheet_name,
                            'type': project_sheet_type
                        }
                    }, ensure_ascii=False))

            if out_name_type == 'device_name':
                ba.out_base_info('yaml', name, time_str, 'device_name')
                print(json.dumps({
                    'status': 'info',
                    'message': f'项目 {name} 完成yaml文件的保存',
                    'data': {
                        'step': current_step,
                        'totalSteps': total_steps,
                        'project': name,
                        'action': 'yaml_save'
                    }
                }, ensure_ascii=False))
                ba.render_txt('templates', name, time_str, 'device_name')
                print(json.dumps({
                    'status': 'info',
                    'message': f'项目 {name} jinja2运行完毕',
                    'data': {
                        'step': current_step,
                        'totalSteps': total_steps,
                        'project': name,
                        'action': 'jinja_render'
                    }
                }, ensure_ascii=False))
            elif out_name_type == 'device_sn':
                ba.out_base_info('yaml-sn', name, time_str, 'device_sn')
                print(json.dumps({
                    'status': 'info',
                    'message': f'项目 {name} 完成yaml文件的保存',
                    'data': {
                        'step': current_step,
                        'totalSteps': total_steps,
                        'project': name,
                        'action': 'yaml_save'
                    }
                }, ensure_ascii=False))
                ba.render_txt('templates', name, time_str, 'device_sn')
                print(json.dumps({
                    'status': 'info',
                    'message': f'项目 {name} jinja2运行完毕',
                    'data': {
                        'step': current_step,
                        'totalSteps': total_steps,
                        'project': name,
                        'action': 'jinja_render'
                    }
                }, ensure_ascii=False))

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

        total_steps = len(self.target_project_name)
        current_step = 0

        for i in range(0, len(self.target_project_name)):
            current_step += 1
            name = self.target_project_name[i]
            print(json.dumps({
                'status': 'progress',
                'message': f'执行项目：{name} 渲染',
                'data': {
                    'step': current_step,
                    'totalSteps': total_steps,
                    'project': name,
                    'progress': int(current_step / total_steps * 100)
                }
            }, ensure_ascii=False))

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
                    print(json.dumps({
                        'status': 'info',
                        'message': f'完成{project_excel_name} {project_sheet_name} 的数据提取',
                        'data': {
                            'step': current_step,
                            'totalSteps': total_steps,
                            'project': name,
                            'excel': project_excel_name,
                            'sheet': project_sheet_name,
                            'type': project_sheet_type
                        }
                    }, ensure_ascii=False))
                elif project_sheet_type == '对称表':
                    ba.read_symmetrice_table(project_excel_name, project_sheet_name, 'excel', name, project_sheet_assign_num, project_sheet_key_num)
                    print(json.dumps({
                        'status': 'info',
                        'message': f'完成{project_excel_name} {project_sheet_name} 的数据提取',
                        'data': {
                            'step': current_step,
                            'totalSteps': total_steps,
                            'project': name,
                            'excel': project_excel_name,
                            'sheet': project_sheet_name,
                            'type': project_sheet_type
                        }
                    }, ensure_ascii=False))
                elif project_sheet_type == '参数表':
                    ba.read_para(project_excel_name, project_sheet_name, 'excel', name)
                    print(json.dumps({
                        'status': 'info',
                        'message': f'完成{project_excel_name} {project_sheet_name} 的数据提取',
                        'data': {
                            'step': current_step,
                            'totalSteps': total_steps,
                            'project': name,
                            'excel': project_excel_name,
                            'sheet': project_sheet_name,
                            'type': project_sheet_type
                        }
                    }, ensure_ascii=False))

            ba.out_base_info('yaml', name, time_str, 'device_name')
            print(json.dumps({
                'status': 'info',
                'message': f'项目 {name} 完成yaml文件的保存',
                'data': {
                    'step': current_step,
                    'totalSteps': total_steps,
                    'project': name,
                    'action': 'yaml_save'
                }
            }, ensure_ascii=False))

        print(json.dumps({
            'status': 'complete',
            'message': '程序运行结束，请在目标项目的yaml文件夹内查看输出结果！',
            'data': {
                'totalSteps': total_steps,
                'completedSteps': total_steps,
                'progress': 100
            }
        }, ensure_ascii=False))

    def execute_create(self, cmd_type: str, para: str):
        """实现项目创建功能"""
        mid_path = self._get_base_path()
        para_path = os.path.join(mid_path, 'para_examples.xlsx')
        tar_path1 = os.path.join(mid_path, para)
        tar_path2 = os.path.join(tar_path1, 'excel')
        tar_path3 = os.path.join(tar_path1, 'templates')
        tar_path4 = os.path.join(tar_path1, 'para.xlsx')

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

        os.makedirs(tar_path2, exist_ok=True)
        os.makedirs(tar_path3, exist_ok=True)

        df = pd.read_excel(para_path)
        with pd.ExcelWriter(tar_path4) as writer:
            df.to_excel(writer, sheet_name='project_para', index=False)

        if judge:
            return

        mc_para_path = os.path.join(mid_path, 'MC_Para.xlsx')
        df = pd.read_excel(mc_para_path)
        df.loc[len(df)] = [para]
        df.to_excel(mc_para_path, sheet_name='项目名称', index=False, header=True)

    def execute_delete(self, cmd_type: str, para: str):
        """实现项目的目录删除功能"""
        mid_path = self._get_base_path()

        if cmd_type == 'project':
            if para == 'all':
                rem_name = []
                for name in self.project_name:
                    dir_path = os.path.join(mid_path, name)
                    if self._safe_remove_dir(dir_path, f'{name} 项目删除成功', f'{name} 项目不存在，删除无效'):
                        rem_name.append(name)
                        self._remove_from_mc_para(name)
                for r in rem_name:
                    self.project_name.remove(r)
            else:
                rem_name = []
                for n in para.split('/'):
                    name = self.project_name[int(n) - 1]
                    dir_path = os.path.join(mid_path, name)
                    if self._safe_remove_dir(dir_path, f'{name} 项目删除成功', f'{name} 项目不存在，删除无效'):
                        rem_name.append(name)
                        self._remove_from_mc_para(name)
                for r in rem_name:
                    self.project_name.remove(r)
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
            print(f'更新MC_Para失败: {e}')

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

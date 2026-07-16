import re
from yaml import dump
import logging
import os
import jinja2
from jinja2 import Environment, FileSystemLoader, ext
from pandas import read_excel
from numpy import int64 as numpy_int64
from time import strftime, localtime
from config import WORKSPACE_DIR


def remove_empty_pair(a_dict: dict):
    """
    去除字典中值为空的 pair
    :param a_dict: 待修改字典
    :return: 直接修改字典，无返回
    """
    for key in list(a_dict.keys()):
        if not a_dict[key]:
            a_dict.pop(key)


def json_safe_val(val):
    """numpy_int64转化为int类型"""
    if isinstance(val, numpy_int64):
        val = val.item()
    elif isinstance(val, list):
        val = [x.item() if isinstance(x, numpy_int64) else x for x in val]
    return val


def deep_dict(a_dict: dict, key_list: list, values: list, now=0):
    """将设备信息以yaml格式保存到字典中（多层嵌套）"""
    if now == len(key_list) - 1:
        keys = key_list[now]
        if isinstance(values, list) and isinstance(keys, list):
            t_dict = dict(zip(keys, [json_safe_val(v) for v in values]))
            remove_empty_pair(t_dict)
            a_dict.update(t_dict)
        else:
            logging.warning('deep_dict 的 keys 和 values 需要list类型！')
        return
    key = key_list[now]
    if key not in a_dict:
        a_dict[key] = dict()
    deep_dict(a_dict[key], key_list, values, now + 1)


def string_split(target_str: str, sheet: str):
    """
    对值进行切分，分隔符为英文逗号、中文逗号和换行符
    注意：两种逗号只能同时出现一种
    """
    if isinstance(target_str, numpy_int64):
        return target_str

    if not isinstance(target_str, str):
        return target_str

    has_comma = ',' in target_str
    has_newline = '\n' in target_str
    has_chinese_comma = '，' in target_str

    # 检查多种分隔符同时出现的情况
    if (has_comma and has_newline) or (has_comma and has_chinese_comma) or (has_chinese_comma and has_newline):
        error_output(sheet + ' ' + str(target_str) + ' 有同时两种分割符出现，需要修改')
        return 'split_error 请修改！！'

    if has_comma:
        return ['list'] + target_str.split(',')
    elif has_newline:
        return ['list'] + target_str.split('\n')
    elif has_chinese_comma:
        return ['list'] + target_str.split('，')

    return target_str


def error_output(err_str):
    """错误日志输出"""
    from config import logger
    logger.error(err_str)


class Base:

    def __init__(self, workspace: str | None = None):
        self.devices = dict()
        self.role = []
        self.workspace = workspace or WORKSPACE_DIR

    def _ensure_dir(self, dir_path: str):
        """确保目录存在，不存在则创建"""
        if not os.path.exists(dir_path):
            os.makedirs(dir_path, exist_ok=True)

    def _write_yaml_file(self, filepath: str, data: dict):
        """安全写入yaml文件"""
        dir_path = os.path.dirname(filepath)
        self._ensure_dir(dir_path)
        with open(filepath, 'w', encoding='utf-8') as fp:
            fp.write(dump(data, allow_unicode=True, sort_keys=False))

    def out_base_info(self, yaml_project_name: str, project_name: str, time_str: str, out_name_type: str):
        """将存储在数据字典中的数据保存到yaml文件当中"""
        mid_path = self.workspace
        base_dir = os.path.join(mid_path, project_name, yaml_project_name, time_str)
        self._ensure_dir(base_dir)

        for r in self.role:
            role_dir = os.path.join(base_dir, r)
            self._ensure_dir(role_dir)

        for info in self.devices.values():
            hostname = info['设备名']
            role = info['角色']

            if out_name_type == 'device_name':
                filename = f"{hostname}.yaml"
            elif out_name_type == 'device_sn':
                filename = f"conf_{info['SN']}.yaml"
            else:
                continue

            filepath = os.path.join(base_dir, role, filename)
            self._write_yaml_file(filepath, self.devices[hostname])

    def read_assign_table(self, document: str, sheet: str, filename: str, project_name: str, key_num: int):
        """读取赋值表的内容"""
        mid_path = self.workspace
        filepath = os.path.join(mid_path, project_name, filename, document)
        data = read_excel(filepath, sheet_name=None, keep_default_na=False)

        for sheet1, value in data.items():
            if sheet1 != sheet:
                continue
            header = list(value.columns)
            for i in value.index.values:
                hostname = str(value[header[0]][i]).strip()
                if '角色' in header and value['角色'][i] not in self.role:
                    self.role.append(value['角色'][i])
                tmp_value = list(value.loc[i])
                tmp_list = [string_split(v, sheet) for v in tmp_value]
                deep_dict(self.devices, [hostname, header], tmp_list)

    def read_para(self, document: str, sheet: str, filename: str, project_name: str):
        """读取参数表的内容"""
        mid_path = self.workspace
        filepath = os.path.join(mid_path, project_name, filename, document)
        data = read_excel(filepath, sheet_name=None, keep_default_na=False)

        for info in self.devices.values():
            hostname_now = info['设备名']
            for sheet1, value in data.items():
                if sheet1 != sheet:
                    continue
                header = list(value.columns)
                col_key = list(value.loc[:, header[0]])
                col_value = list(value.loc[:, header[1]])
                tmp_value = [string_split(v, sheet) for v in col_value]
                deep_dict(self.devices, [hostname_now, col_key], tmp_value)

    def read_symmetrice_table(self, document: str, sheet: str, filename: str, project_name: str, col_num: int, key_num: int):
        """读取对称表的内容"""
        mid_path = self.workspace
        filepath = os.path.join(mid_path, project_name, filename, document)
        data = read_excel(filepath, sheet_name=None, keep_default_na=False)

        for excel_sheet, value in data.items():
            if excel_sheet != sheet:
                continue
            header = list(value.columns)
            for i in value.index.values:
                if key_num == 2:
                    try:
                        hostnameA = str(value[header[0]][i]).strip()
                        hostnameZ = str(value[header[col_num]][i]).strip()
                        interfaceA = str(value[header[key_num - 1]][i]).strip()
                        interfaceZ = str(value[header[col_num + 1]][i]).strip()
                        tmp_valueA = list(value.loc[i, header[0]:header[col_num - 1]])
                        tmp_valueZ = list(value.loc[i, header[col_num]:header[(2 * col_num) - 1]])
                    except Exception as e:
                        error_output(f"{filename} {document} {sheet} 存在空行: {e}")
                        break

                    tmp_listA = [string_split(v, sheet) for v in tmp_valueA[key_num:col_num]]
                    tmp_listA += [string_split(v, sheet) for v in tmp_valueZ]
                    tmp_listZ = [string_split(v, sheet) for v in tmp_valueZ[key_num:col_num]]
                    tmp_listZ += [string_split(v, sheet) for v in tmp_valueA]

                    deep_dict(self.devices, [hostnameA, sheet + ' ' + header[key_num - 1], interfaceA, header[key_num:col_num * 2]], tmp_listA)
                    deep_dict(self.devices, [hostnameZ, sheet + ' ' + header[key_num - 1], interfaceZ, header[key_num:col_num * 2]], tmp_listZ)

    def render_txt(self, templates: str, project_name: str, time_str: str, out_name_type: str):
        """使用jinja2模板渲染生成配置文件"""
        mid_path = self.workspace

        if out_name_type == 'device_name':
            output_dir_name = 'output'
            file_ext = '.txt'
            name_key = '设备名'
        elif out_name_type == 'device_sn':
            output_dir_name = 'output-sn'
            file_ext = '.cfg'
            name_key = 'SN'
        else:
            return

        template_path = os.path.join(mid_path, project_name, templates)
        output_base = os.path.join(mid_path, project_name, output_dir_name, time_str)
        self._ensure_dir(output_base)

        for r in self.role:
            self._ensure_dir(os.path.join(output_base, r))

        jinja2_extensions = (jinja2.ext.do, jinja2.ext.i18n, jinja2.ext.loopcontrols)
        env = Environment(loader=FileSystemLoader(template_path), extensions=jinja2_extensions)

        for info in self.devices.values():
            hostname_now = info['设备名']
            role = info['角色']
            template = env.get_template(f"{role}.j2")
            output = template.render(hostname=hostname_now, info=info)

            if out_name_type == 'device_name':
                output_filename = f"{hostname_now}{file_ext}"
            else:
                output_filename = f"conf_{info['SN']}{file_ext}"

            output_path = os.path.join(output_base, role, output_filename)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(output)

    def render_dry_run(self, templates: str, project_name: str, out_name_type: str) -> list[dict]:
        """渲染预览：不写文件，返回渲染输出内容列表"""
        template_path = os.path.join(self.workspace, project_name, templates)

        if out_name_type == 'device_name':
            name_key = '设备名'
        elif out_name_type == 'device_sn':
            name_key = 'SN'
        else:
            return []

        env = Environment(loader=FileSystemLoader(template_path))
        results = []

        for info in self.devices.values():
            hostname_now = info['设备名']
            role = info.get('角色', '')
            if not role:
                continue
            try:
                template = env.get_template(f"{role}.j2")
                output = template.render(hostname=hostname_now, info=info)
            except Exception as e:
                output = f'[渲染错误] {e}'

            if out_name_type == 'device_name':
                output_filename = f"{hostname_now}.txt"
                device_id = hostname_now
            else:
                output_filename = f"conf_{info['SN']}.cfg"
                device_id = info.get('SN', hostname_now)

            results.append({
                'project': project_name,
                'device': device_id,
                'role': role,
                'filename': output_filename,
                'content': output,
            })

        return results

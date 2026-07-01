#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
打印 self.devices 字典的内容，以了解数据结构
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from base import Base


def print_dict(d, indent=0, level=0, max_level=3):
    """打印字典内容，限制递归深度"""
    if level > max_level:
        return "..."
    
    for key, value in d.items():
        print("  " * indent + str(key))
        
        if isinstance(value, dict):
            print_dict(value, indent + 1, level + 1, max_level)
        elif isinstance(value, list):
            print("  " * (indent + 1) + f"List of {len(value)} items:")
            for i, item in enumerate(value[:3]):  # 只打印前 3 个元素
                if isinstance(item, dict):
                    print("  " * (indent + 2) + f"Item {i}:")
                    print_dict(item, indent + 3, level + 1, max_level - 1)
                elif isinstance(item, list):
                    print("  " * (indent + 2) + f"Item {i}: List of {len(item)} items")
                else:
                    print("  " * (indent + 2) + str(item))
            if len(value) > 3:
                print("  " * (indent + 1) + f"... and {len(value) - 3} more items")
        else:
            print("  " * (indent + 1) + str(value))


def print_devices():
    print("正在读取数据...")
    
    try:
        base = Base()
        
        # 读取 test1 项目的数据
        print("\n--- 读取 hostname.xlsx ---")
        base.read_assign_table('hostname.xlsx', '主机表', 'excel', 'test1', 2)
        
        print("\n--- 读取 connection.xlsx ---")
        print("  - 互联关系表 (对称表)")
        base.read_symmetrice_table('connection.xlsx', '互联关系表', 'excel', 'test1', 2, 2)
        
        print("  - 聚合接口表 (对称表)")
        base.read_symmetrice_table('connection.xlsx', '聚合接口表', 'excel', 'test1', 3, 2)
        
        print("  - 终端连接表 (赋值表)")
        base.read_assign_table('connection.xlsx', '终端连接表', 'excel', 'test1', 2)
        
        print("  - IP互联地址表 (对称表)")
        base.read_symmetrice_table('ipaddress.xlsx', 'IP互联地址表', 'excel', 'test1', 4, 2)
        
        print("  - 网关地址表 (赋值表)")
        base.read_assign_table('ipaddress.xlsx', '网关地址表', 'excel', 'test1', 2)
        
        print("\n--- 数据结构 ---")
        print_dict(base.devices, max_level=2)
        
    except Exception as e:
        print(f"错误: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    print_devices()

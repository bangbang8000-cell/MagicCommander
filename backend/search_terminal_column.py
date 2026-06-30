#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
from config import WORKSPACE_DIR

def search_terminal_column():
    # 查找包含 '终端连接表' 的文件
    root_dir = WORKSPACE_DIR
    
    for filename in os.listdir(root_dir):
        if filename.endswith('.py'):
            file_path = os.path.join(root_dir, filename)
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                    # 搜索包含 '终端连接表' 的模式
                    matches = re.findall(r'终端连接表.*?接口', content)
                    if matches:
                        print(f"文件：{filename}")
                        print("找到的匹配：")
                        for match in matches:
                            print(f"  {match}")
                        
                    # 搜索包含 '终端连接表' 和 '己端接口' 但分开的模式
                    if '终端连接表' in content and '己端接口' in content:
                        print(f"\n文件：{filename}")
                        print("包含 '终端连接表' 和 '己端接口'")
                
            except Exception as e:
                print(f"读取文件 {filename} 时出错：{e}")
                
    print("\n--- 检查 connection.xlsx 文件 ---")
    
    # 检查 connection.xlsx 文件
    excel_path = os.path.join(root_dir, 'test1', 'excel', 'connection.xlsx')
    if os.path.exists(excel_path):
        try:
            import pandas as pd
            df = pd.read_excel(excel_path, sheet_name='终端连接表')
            print("终端连接表的列名：")
            for col in df.columns:
                print(f"  {col}")
                
        except Exception as e:
            print(f"读取 Excel 文件时出错：{e}")
    else:
        print("未找到 connection.xlsx 文件")


if __name__ == "__main__":
    search_terminal_column()

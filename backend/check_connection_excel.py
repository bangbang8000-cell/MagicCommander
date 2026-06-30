#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
检查 connection.xlsx 文件的内容
"""

import pandas as pd
import os
from config import WORKSPACE_DIR


def check_connection_excel():
    # Excel 文件路径
    excel_path = os.path.join(WORKSPACE_DIR, "test1", "excel", "connection.xlsx")
    
    if not os.path.exists(excel_path):
        print("错误：文件不存在")
        return
    
    print(f"正在检查文件：{excel_path}")
    
    try:
        # 读取 Excel 文件的所有工作表
        xls = pd.ExcelFile(excel_path)
        sheet_names = xls.sheet_names
        
        print(f"工作表名称：{sheet_names}")
        
        for sheet in sheet_names:
            print(f"\n=== 工作表：{sheet} ===")
            
            try:
                df = pd.read_excel(excel_path, sheet_name=sheet)
                print(f"行数：{len(df)}，列数：{len(df.columns)}")
                
                # 检查列名
                if '终端连接表 己端接口' in df.columns:
                    print("找到列：'终端连接表 己端接口'")
                
                if '终端连接表' in sheet:
                    print("=== 终端连接表列名： ===")
                    for col in df.columns:
                        print(f"  {col}")
                
                if '聚合接口表' in sheet:
                    print("=== 聚合接口表列名： ===")
                    for col in df.columns:
                        print(f"  {col}")
                
            except Exception as e:
                print(f"读取工作表 {sheet} 时出错：{e}")
                
    except Exception as e:
        print(f"读取 Excel 文件时出错：{e}")


if __name__ == "__main__":
    check_connection_excel()

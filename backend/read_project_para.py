#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import pandas as pd
import os
from config import WORKSPACE_DIR

def read_project_para():
    # 读取 test1 项目的 para.xlsx 文件
    project_para_path = os.path.join(WORKSPACE_DIR, "test1", "para.xlsx")
    df = pd.read_excel(project_para_path)
    
    # 显示所有列名
    print("test1 项目的 para.xlsx 文件的列名：")
    for i, col in enumerate(df.columns):
        print(f"{i+1}. {col}")
    
    print("\n" + "-"*50 + "\n")
    
    # 显示所有数据
    print("test1 项目的 para.xlsx 文件的所有数据：")
    print(df)
    
    print("\n" + "-"*50 + "\n")
    
    # 统计工作表类型
    if "工作表类型" in df.columns:
        print("工作表类型统计：")
        print(df["工作表类型"].value_counts())
    
    print("\n" + "-"*50 + "\n")
    
    # 查找与终端连接表相关的数据
    if "工作表名称" in df.columns:
        terminal_sheets = df[df["工作表名称"].str.contains("终端", na=False)]
        print("包含 '终端' 的工作表：")
        print(terminal_sheets)


if __name__ == "__main__":
    read_project_para()

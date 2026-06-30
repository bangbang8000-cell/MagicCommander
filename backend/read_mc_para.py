#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import pandas as pd
import os
from config import WORKSPACE_DIR

def read_mc_para():
    # 读取 MC_Para.xlsx 文件
    mc_para_path = os.path.join(WORKSPACE_DIR, "MC_Para.xlsx")
    df = pd.read_excel(mc_para_path)
    
    # 显示所有列名
    print("MC_Para.xlsx 文件的列名：")
    for i, col in enumerate(df.columns):
        print(f"{i+1}. {col}")
    
    print("\n" + "-"*50 + "\n")
    
    # 显示前 50 行数据
    print("MC_Para.xlsx 文件的前 10 行数据：")
    print(df.head(10))
    
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
        print(terminal_sheets[["项目名称", "工作簿名称", "工作表名称", "工作表类型"]])


if __name__ == "__main__":
    read_mc_para()

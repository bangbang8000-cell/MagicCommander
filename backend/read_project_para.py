#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import pandas as pd
import os
import logging
from config import WORKSPACE_DIR

logger = logging.getLogger(__name__)

def read_project_para():
    project_para_path = os.path.join(WORKSPACE_DIR, "test1", "para.xlsx")
    df = pd.read_excel(project_para_path)
    
    logger.info("test1 项目的 para.xlsx 文件的列名：")
    for i, col in enumerate(df.columns):
        logger.info(f"{i+1}. {col}")
    
    logger.info("\n" + "-"*50 + "\n")
    
    logger.info("test1 项目的 para.xlsx 文件的所有数据：")
    logger.info(df)
    
    logger.info("\n" + "-"*50 + "\n")
    
    if "工作表类型" in df.columns:
        logger.info("工作表类型统计：")
        logger.info(df["工作表类型"].value_counts())
    
    logger.info("\n" + "-"*50 + "\n")
    
    if "工作表名称" in df.columns:
        terminal_sheets = df[df["工作表名称"].str.contains("终端", na=False)]
        logger.info("包含 '终端' 的工作表：")
        logger.info(terminal_sheets)


if __name__ == "__main__":
    read_project_para()
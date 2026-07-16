#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import pandas as pd
import os
import logging
from config import WORKSPACE_DIR

logger = logging.getLogger(__name__)

def read_mc_para():
    mc_para_path = os.path.join(WORKSPACE_DIR, "MC_Para.xlsx")
    df = pd.read_excel(mc_para_path)
    
    logger.info("MC_Para.xlsx 文件的列名：")
    for i, col in enumerate(df.columns):
        logger.info(f"{i+1}. {col}")
    
    logger.info("\n" + "-"*50 + "\n")
    
    logger.info("MC_Para.xlsx 文件的前 10 行数据：")
    logger.info(df.head(10))
    
    logger.info("\n" + "-"*50 + "\n")
    
    if "工作表类型" in df.columns:
        logger.info("工作表类型统计：")
        logger.info(df["工作表类型"].value_counts())
    
    logger.info("\n" + "-"*50 + "\n")
    
    if "工作表名称" in df.columns:
        terminal_sheets = df[df["工作表名称"].str.contains("终端", na=False)]
        logger.info("包含 '终端' 的工作表：")
        logger.info(terminal_sheets[["项目名称", "工作簿名称", "工作表名称", "工作表类型"]])


if __name__ == "__main__":
    read_mc_para()
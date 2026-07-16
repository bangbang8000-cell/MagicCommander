#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import logging
from config import WORKSPACE_DIR

logger = logging.getLogger(__name__)

def search_terminal_column():
    root_dir = WORKSPACE_DIR
    
    for filename in os.listdir(root_dir):
        if filename.endswith('.py'):
            file_path = os.path.join(root_dir, filename)
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                    matches = re.findall(r'终端连接表.*?接口', content)
                    if matches:
                        logger.info(f"文件：{filename}")
                        logger.info("找到的匹配：")
                        for match in matches:
                            logger.info(f"  {match}")
                        
                    if '终端连接表' in content and '己端接口' in content:
                        logger.info(f"\n文件：{filename}")
                        logger.info("包含 '终端连接表' 和 '己端接口'")
                
            except Exception as e:
                logger.info(f"读取文件 {filename} 时出错：{e}")
                
    logger.info("\n--- 检查 connection.xlsx 文件 ---")
    
    excel_path = os.path.join(root_dir, 'test1', 'excel', 'connection.xlsx')
    if os.path.exists(excel_path):
        try:
            import pandas as pd
            df = pd.read_excel(excel_path, sheet_name='终端连接表')
            logger.info("终端连接表的列名：")
            for col in df.columns:
                logger.info(f"  {col}")
                
        except Exception as e:
            logger.info(f"读取 Excel 文件时出错：{e}")
    else:
        logger.info("未找到 connection.xlsx 文件")


if __name__ == "__main__":
    search_terminal_column()
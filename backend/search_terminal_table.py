#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
搜索项目中所有包含 '终端连接表' 字符串的文件，避免 PowerShell 执行策略限制
"""

import os
import sys
import logging


logger = logging.getLogger(__name__)


def search_terminal_table():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    target_str = '终端连接表'
    
    logger.info(f"搜索包含 '{target_str}' 的文件...")
    logger.info("=" * 50)
    
    matched_files = []
    
    for root, dirs, files in os.walk(base_dir):
        for file_name in files:
            if file_name.endswith('.j2') or file_name.endswith('.py') or file_name.endswith('.xlsx'):
                file_path = os.path.join(root, file_name)
                
                try:
                    if file_name.endswith('.xlsx'):
                        try:
                            import pandas as pd
                            xls = pd.ExcelFile(file_path)
                            for sheet_name in xls.sheet_names:
                                try:
                                    df = pd.read_excel(file_path, sheet_name=sheet_name)
                                    if target_str in str(df.columns) or target_str in str(df.values):
                                        logger.info(f"Excel 文件: {file_path} (工作表: {sheet_name})")
                                        matched_files.append((file_path, sheet_name))
                                except Exception as e:
                                    continue
                        except ImportError:
                            continue
                    else:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                            if target_str in content:
                                logger.info(f"文件: {file_path}")
                                matched_files.append(file_path)
                except Exception as e:
                    continue
    
    logger.info("=" * 50)
    logger.info(f"共找到 {len(matched_files)} 个文件包含 '{target_str}'")
    
    return matched_files


if __name__ == "__main__":
    try:
        search_terminal_table()
    except KeyboardInterrupt:
        logger.info("\n搜索被用户中断")
        sys.exit(1)
    except Exception as e:
        logger.info(f"\n搜索过程中出错: {e}")
        sys.exit(1)
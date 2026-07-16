import pandas as pd
import os
import logging
from config import WORKSPACE_DIR

logger = logging.getLogger(__name__)

try:
    df = pd.read_excel(os.path.join(WORKSPACE_DIR, 'MC_Para.xlsx'))
    logger.info('MC_Para.xlsx 文件内容:')
    logger.info(df)
    logger.info('')
    logger.info('列名:')
    logger.info(list(df.columns))
    logger.info('')
    logger.info('项目名称列内容:')
    if '项目名称' in df.columns:
        logger.info(df['项目名称'].tolist())
    elif '项目' in df.columns:
        logger.info(df['项目'].tolist())
    else:
        logger.info('未找到项目名称列')
except Exception as e:
    logger.info(f'读取 Excel 文件时出错: {e}')
    import traceback
    logger.info(traceback.format_exc())
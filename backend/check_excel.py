import pandas as pd
import os
from config import WORKSPACE_DIR

try:
    df = pd.read_excel(os.path.join(WORKSPACE_DIR, 'MC_Para.xlsx'))
    print('MC_Para.xlsx 文件内容:')
    print(df)
    print()
    print('列名:')
    print(list(df.columns))
    print()
    print('项目名称列内容:')
    if '项目名称' in df.columns:
        print(df['项目名称'].tolist())
    elif '项目' in df.columns:
        print(df['项目'].tolist())
    else:
        print('未找到项目名称列')
except Exception as e:
    print(f'读取 Excel 文件时出错: {e}')
    import traceback
    print(traceback.format_exc())

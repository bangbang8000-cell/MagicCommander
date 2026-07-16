import os
import logging
import sys

# 代码所在目录
CODE_DIR = os.path.dirname(os.path.abspath(__file__))

# 默认 workspace 路径：与 backend 同级的 workspace 目录
DEFAULT_WORKSPACE = os.path.join(os.path.dirname(CODE_DIR), 'workspace')

# 当前工作区目录
# 优先级：1. 环境变量 MC_WORKSPACE  2. 默认 workspace 目录  3. 代码所在目录
_WORKSPACE = os.environ.get('MC_WORKSPACE', '')
if _WORKSPACE and os.path.exists(_WORKSPACE):
    WORKSPACE_DIR = os.path.abspath(_WORKSPACE)
elif os.path.exists(DEFAULT_WORKSPACE):
    WORKSPACE_DIR = DEFAULT_WORKSPACE
else:
    WORKSPACE_DIR = CODE_DIR

# 统一日志配置
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger('magiccommander')

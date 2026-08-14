"""
MC 意图参数适配器（AIDC 内容包 P0.5 原型，D12 落地）

定位：单核心之上的可插拔参数层，把参考模板的「意图驱动参数模型」
（[[ID]] 设备索引寻址 + 18 过滤器 + 6 函数）解析为现渲染核心可消费的形态。

模块：
- filters.py  网络计算过滤器（to_ip/to_mask/to_network/...）与函数（modify_ip 等）
- id_expr.py  [[ID]] 算术表达式安全求值
- resolver.py 意图变量引用解析（prefix[[ID]]suffix -> 意图参数值）
- normalizer.py 规范化器最小形态（逐设备展开意图模板 -> 普通 Jinja2）

说明：本包为通用渲染能力，不包含任何参考资产内容。
"""
from . import filters, id_expr, resolver  # noqa: F401

__all__ = ['filters', 'id_expr', 'resolver']

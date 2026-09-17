"""5.2.2-522-p1：重依赖延迟加载与依赖预检。

背景（用户反馈 P0-1 / CLI 侧同源问题）：后端多个模块在**模块级**直接
``import pandas`` / ``import openpyxl`` / ``from docx import Document``，导致：
- 任何一次 ``import base`` / ``import pre_processing`` 就硬要求全部重依赖；
- 缺依赖时抛裸 ``ModuleNotFoundError``，用户看到的是 Python 栈而非可行动提示；
- 只想用只读能力（CLI 帮助、依赖自检）也绕不过重依赖。

本模块提供三种延迟加载代理 + 一个机器可读的依赖清单：

- :func:`require`        —— 显式导入（失败抛 :class:`MissingDependencyError`）
- :func:`lazy_module`    —— 模块属性代理（``pd.DataFrame`` 首次访问才导入）
- :func:`lazy_callable`  —— 函数代理（``read_excel(...)`` 首次调用才导入）
- :func:`lazy_type`      —— 类型代理（支持 ``isinstance`` / ``issubclass``）
- :func:`check_dependencies` —— 依赖预检清单（供 CLI ``doctor`` 与自检使用）
"""
from __future__ import annotations

import importlib
import sys
from types import ModuleType
from typing import Any, Callable

INSTALL_HINT = "请运行 pip install -r requirements.txt（或安装发行包内的依赖）后重试"

# 依赖清单：(逻辑名, 导入名, 用途说明, 是否必需)
DEPENDENCIES: tuple[tuple[str, str, str, bool], ...] = (
    ("pandas", "pandas", "Excel 参数/模板读写与渲染输入解析", True),
    ("numpy", "numpy", "Excel 数值类型归一（numpy.int64 → int）", True),
    ("openpyxl", "openpyxl", "xlsx 写出引擎", True),
    ("yaml", "yaml", "项目配置模板解析", True),
    ("jinja2", "jinja2", "配置模板渲染内核", True),
    ("docx", "docx", "标签/评审包 Word 输出", False),
    ("reportlab", "reportlab", "PDF 输出（评审包）", False),
    ("mcp", "mcp", "Agent Connect MCP Server（仅该功能需要）", False),
)

_LOADED: dict[str, ModuleType] = {}


class MissingDependencyError(ImportError):
    """重依赖缺失：携带逻辑名、用途与可行动修复提示。"""

    def __init__(self, module_name: str, purpose: str = ""):
        self.module_name = module_name
        self.purpose = purpose
        detail = f"，用于{purpose}" if purpose else ""
        super().__init__(f"缺少依赖 {module_name}{detail}。{INSTALL_HINT}")


def require(module_name: str, purpose: str = "") -> ModuleType:
    """导入重依赖；失败抛出**可读**的 :class:`MissingDependencyError`。"""
    cached = _LOADED.get(module_name)
    if cached is not None:
        return cached
    try:
        mod = importlib.import_module(module_name)
    except ImportError as e:
        raise MissingDependencyError(module_name, purpose) from e
    _LOADED[module_name] = mod
    return mod


def module_loaded(module_name: str) -> bool:
    """该依赖当前是否已在 ``sys.modules`` 中（供"未触达重依赖"断言使用）。"""
    return module_name in sys.modules


class _LazyModule(ModuleType):
    """模块代理：仅在首次属性访问时导入真实模块。"""

    def __init__(self, module_name: str, purpose: str = ""):
        super().__init__(module_name)
        self.__dict__["_lazy_name"] = module_name
        self.__dict__["_lazy_purpose"] = purpose

    def __getattr__(self, item: str) -> Any:  # 仅缺失属性时触发
        if item.startswith("_lazy_"):
            raise AttributeError(item)
        return getattr(require(self._lazy_name, self._lazy_purpose), item)

    def __repr__(self) -> str:  # pragma: no cover - 仅用于排错可读性
        state = "loaded" if _lazy_loaded(self._lazy_name) else "lazy"
        return f"<lazy module {self._lazy_name!r} ({state})>"


def _lazy_loaded(module_name: str) -> bool:
    return module_name in _LOADED


def lazy_module(module_name: str, purpose: str = "") -> ModuleType:
    """返回模块代理（可 ``pd.DataFrame`` 这样用，不触发提前导入）。"""
    return _LazyModule(module_name, purpose)


def lazy_callable(module_name: str, attr_name: str, purpose: str = "") -> Callable[..., Any]:
    """返回函数/方法代理（首次调用才导入真实模块）。"""

    def _call(*args: Any, **kwargs: Any) -> Any:
        return getattr(require(module_name, purpose), attr_name)(*args, **kwargs)

    _call.__name__ = attr_name
    _call.__qualname__ = f"{module_name}.{attr_name}"
    _call.__doc__ = f"{module_name}.{attr_name} 的延迟代理"
    return _call


def lazy_type(module_name: str, attr_name: str, purpose: str = "") -> type:
    """返回类型代理（支持 ``isinstance`` / ``issubclass``，首次判定才导入）。"""

    class _LazyTypeMeta(type):
        def __instancecheck__(cls, instance: Any) -> bool:  # noqa: N805
            return isinstance(instance, getattr(require(module_name, purpose), attr_name))

        def __subclasscheck__(cls, subclass: type) -> bool:  # noqa: N805
            return issubclass(subclass, getattr(require(module_name, purpose), attr_name))

    lazy_cls = _LazyTypeMeta(attr_name, (), {})
    lazy_cls.__module__ = module_name
    lazy_cls.__qualname__ = attr_name
    return lazy_cls


def check_dependencies() -> list[dict[str, Any]]:
    """依赖预检：返回机器可读清单（含状态与修复建议）。

    不抛异常——缺依赖只体现在 ``status`` 字段，便于 CLI ``doctor`` 一次列全。
    """
    report: list[dict[str, Any]] = []
    for logical, import_name, purpose, required in DEPENDENCIES:
        item: dict[str, Any] = {
            "name": logical,
            "import_name": import_name,
            "purpose": purpose,
            "required": required,
        }
        try:
            mod = importlib.import_module(import_name)
            version = getattr(mod, "__version__", None)
            item.update({"status": "ok", "version": str(version) if version else "", "hint": ""})
        except Exception as e:  # noqa: BLE001 - 任意导入失败都归为 missing
            item.update({
                "status": "missing",
                "version": "",
                "hint": f"{type(e).__name__}: {e}。{INSTALL_HINT}",
            })
        report.append(item)
    return report


def missing_required(report: list[dict[str, Any]] | None = None) -> list[str]:
    """必需依赖中缺失的清单（空表示可正常启动）。"""
    rows = report if report is not None else check_dependencies()
    return [r["name"] for r in rows if r["required"] and r["status"] != "ok"]

"""
AI Hub 主入口
FastAPI 服务器，由 Electron 主进程作为子进程启动
"""
import sys
import logging
import argparse
from pathlib import Path

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="[AI_HUB] %(asctime)s %(levelname)s %(message)s",
    stream=sys.stderr,  # 输出到 stderr，避免污染 stdout 协议
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="MagicCommander AI Hub Server")
    parser.add_argument("--port", type=int, default=18721, help="Server port")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Server host")
    parser.add_argument("--workspace", type=str, default="", help="Workspace directory")
    parser.add_argument("--template-dir", type=str, default="", help="Template directory")
    parser.add_argument("--backend-dir", type=str, default="", help="Backend directory")
    args = parser.parse_args()

    # 设置配置
    from ai_hub.config import settings, apply_secrets
    settings.port = args.port
    settings.host = args.host
    settings.workspace_dir = args.workspace
    settings.template_dir = args.template_dir

    # 从文件加载密钥
    apply_secrets()

    # 初始化 Agent Tools
    from ai_hub.agent.tools import init_tools, set_workspace_dir, set_backend_dir
    set_workspace_dir(args.workspace)
    set_backend_dir(args.backend_dir)
    init_tools()

    # 初始化 LLM Providers
    from ai_hub.llm.provider import init_providers
    init_providers()

    # 启动打印就绪信号（Electron 主进程通过此信号判断启动成功）
    print(f"AI_HUB_READY port={args.port}", flush=True)

    # 创建 FastAPI 应用
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from ai_hub.api.chat import router as chat_router

    app = FastAPI(title="MagicCommander AI Hub", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(chat_router)

    # 启动 FastAPI
    import uvicorn
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
        log_config=None,  # 使用自定义 logging
    )


if __name__ == "__main__":
    main()
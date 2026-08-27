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
    parser.add_argument("--auth-token", type=str, default="", help="Local auth token (must be sent as X-MC-Auth-Token header)")
    args = parser.parse_args()

    # 设置配置
    from ai_hub.config import settings, apply_secrets
    settings.port = args.port
    settings.host = args.host
    settings.workspace_dir = args.workspace
    settings.template_dir = args.template_dir
    settings.auth_token = args.auth_token

    # 从文件加载密钥
    apply_secrets()

    # 初始化 Agent Tools
    from ai_hub.agent.tools import init_tools, set_workspace_dir, set_backend_dir
    set_workspace_dir(args.workspace)
    set_backend_dir(args.backend_dir)
    init_tools()

    # 初始化 Memory 目录（写入工作区而非进程 CWD）
    if args.workspace:
        from ai_hub.memory.engine import get_memory_engine
        get_memory_engine().init_dir(args.workspace)

    # 初始化 LLM Providers
    from ai_hub.llm.provider import init_providers
    init_providers()

    # 预绑定端口（防御性兜底）：uvicorn 启动前先占用端口，若已被占用立即输出
    # AI_HUB_PORT_IN_USE 信号并以退出码 2 退出，供 Electron 侧识别。
    # 主防线是 Electron 侧 reclaimPort（M2），此处为兜底防线。
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        # POSIX 设 SO_REUSEADDR（TIME_WAIT 快速复用）；Windows 不设避免意外复用占用端口
        if hasattr(socket, "SO_REUSEADDR") and not sys.platform.startswith("win"):
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((args.host, args.port))
        sock.listen(2048)
    except OSError as e:
        print(f"AI_HUB_PORT_IN_USE port={args.port} err={e}", flush=True)
        sock.close()
        sys.exit(2)

    # 启动打印就绪信号（Electron 主进程通过此信号判断启动成功）
    print(f"AI_HUB_READY port={args.port}", flush=True)

    # 创建 FastAPI 应用
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    from ai_hub.api.chat import router as chat_router

    app = FastAPI(title="MagicCommander AI Hub", version="1.0.0")

    # 本地鉴权：当配置了 auth_token 时，所有 /api/* 请求必须携带 X-MC-Auth-Token 头。
    # 客户端是 Electron 主进程（非浏览器），无需 CORS；移除 CORS 中间件消除任意站点跨域调用。
    if settings.auth_token:
        @app.middleware("http")
        async def require_auth_token(request: Request, call_next):
            token = request.headers.get("X-MC-Auth-Token", "")
            if token != settings.auth_token:
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
            return await call_next(request)

    app.include_router(chat_router)

    # 启动 FastAPI（复用预绑定 socket，避免端口竞态）
    import uvicorn
    config = uvicorn.Config(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
        log_config=None,  # 使用自定义 logging
    )
    server = uvicorn.Server(config)
    try:
        server.run(sockets=[sock])
    finally:
        sock.close()


if __name__ == "__main__":
    main()
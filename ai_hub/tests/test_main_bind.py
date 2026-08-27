"""AI Hub main.py 端口预绑定协议测试（AI-2 防御性增强）
- 端口被占用：stdout 输出 AI_HUB_PORT_IN_USE 信号 + 退出码 2
- 空闲端口：正常输出 AI_HUB_READY 并进入服务运行
"""
import os
import socket
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAIN_PY = os.path.join(REPO_ROOT, "ai_hub", "main.py")

ENV = dict(os.environ)
ENV["PYTHONPATH"] = REPO_ROOT + os.pathsep + ENV.get("PYTHONPATH", "")

_SUBPROCESS_KW = dict(text=True, encoding="utf-8", errors="replace", env=ENV)


def _free_port() -> int:
    """获取一个空闲端口（bind 后立即关闭）"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def _hold_port() -> tuple[socket.socket, int]:
    """占住一个端口并返回（保持 listen 状态直至 close）"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    sock.listen(1)
    return sock, sock.getsockname()[1]


def _main_cmd(port: int, workspace: str) -> list[str]:
    return [sys.executable, MAIN_PY, "--port", str(port), "--host", "127.0.0.1", "--workspace", workspace]


class TestMainPortInUse:
    def test_port_in_use_emits_signal_and_exit_2(self, tmp_path):
        sock, port = _hold_port()
        try:
            proc = subprocess.run(_main_cmd(port, str(tmp_path)), capture_output=True, timeout=60, **_SUBPROCESS_KW)
        finally:
            sock.close()
        assert "AI_HUB_PORT_IN_USE" in proc.stdout
        assert proc.returncode == 2
        # 不应输出 READY（端口被占用时不能宣称启动成功）
        assert "AI_HUB_READY" not in proc.stdout

    def test_free_port_emits_ready(self, tmp_path):
        port = _free_port()
        proc = subprocess.Popen(
            _main_cmd(port, str(tmp_path)),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            **_SUBPROCESS_KW,
        )
        lines: list[str] = []

        def _reader():
            try:
                for line in proc.stdout:
                    lines.append(line)
                    if "AI_HUB_READY" in line or "AI_HUB_PORT_IN_USE" in line:
                        break
            except Exception:
                pass

        thread = threading.Thread(target=_reader, daemon=True)
        thread.start()
        try:
            deadline = time.time() + 60
            while time.time() < deadline:
                if any("AI_HUB_READY" in ln or "AI_HUB_PORT_IN_USE" in ln for ln in lines):
                    break
                time.sleep(0.2)
            else:
                raise AssertionError("main.py 未在 60s 内输出 READY/PORT_IN_USE 信号")
            assert any("AI_HUB_READY" in ln for ln in lines), f"stdout={lines!r}"
            assert proc.poll() is None, "READY 后进程应持续运行"
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=10)
            thread.join(timeout=5)

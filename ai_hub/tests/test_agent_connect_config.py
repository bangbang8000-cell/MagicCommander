"""5.1.8-518-a：客户端远程模式开关配置测试。

覆盖：enable_remote_mode 默认关、set 持久化、从 provider_configs 排除；
Agent Connect 总开关/模式配置回归；5.4.10-5410-a（F54-10-a）授权档位持久化。
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(autouse=True)
def _secrets(tmp_path, monkeypatch):
    from ai_hub import config as ai_config

    monkeypatch.setattr(ai_config, "get_secrets_path", lambda: tmp_path / ".mc_ai_secrets.json")
    yield


class TestRemoteModeConfig:
    def test_remote_mode_default_off(self):
        from ai_hub.config import get_enable_remote_mode

        assert get_enable_remote_mode() is False

    def test_remote_mode_set_persists(self):
        from ai_hub.config import get_enable_remote_mode, set_enable_remote_mode

        assert set_enable_remote_mode(True) is True
        assert get_enable_remote_mode() is True
        set_enable_remote_mode(False)
        assert get_enable_remote_mode() is False

    def test_remote_mode_excluded_from_provider_configs(self):
        from ai_hub import config as ai_config

        ai_config.set_enable_remote_mode(True)
        ai_config.set_enable_agent_connect(True)
        ai_config.apply_secrets()
        assert "enable_remote_mode" not in ai_config.settings.provider_configs
        assert "enable_agent_connect" not in ai_config.settings.provider_configs
        assert "agent_mode" not in ai_config.settings.provider_configs

    def test_agent_connect_switches_regression(self):
        from ai_hub.config import get_agent_mode, get_enable_agent_connect, set_agent_mode, set_enable_agent_connect

        assert get_enable_agent_connect() is False
        assert get_agent_mode() == "compiled"
        set_enable_agent_connect(True)
        set_agent_mode("source")
        assert get_enable_agent_connect() is True
        assert get_agent_mode() == "source"


class TestAgentConnectGrant:
    """5.4.10-5410-a（F54-10-a）：授权档位持久化（与 AL 同构）。"""

    def test_grant_default_semi(self):
        from ai_hub.config import get_agent_connect_grant

        assert get_agent_connect_grant() == "semi"

    def test_grant_set_persists(self):
        from ai_hub.config import get_agent_connect_grant, set_agent_connect_grant

        assert set_agent_connect_grant("full") == "full"
        assert get_agent_connect_grant() == "full"
        assert set_agent_connect_grant("readonly") == "readonly"
        assert get_agent_connect_grant() == "readonly"

    def test_grant_invalid_falls_back_semi(self):
        from ai_hub.config import set_agent_connect_grant

        assert set_agent_connect_grant("superadmin") == "semi"

    def test_grant_excluded_from_provider_configs(self):
        from ai_hub import config as ai_config

        ai_config.set_agent_connect_grant("full")
        ai_config.apply_secrets()
        assert "agent_connect_grant" not in ai_config.settings.provider_configs

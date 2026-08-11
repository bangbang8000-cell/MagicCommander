"""Jinja2 沙箱 RCE 防护测试"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from jinja2.sandbox import SandboxedEnvironment
from jinja2 import FileSystemLoader, TemplateSyntaxError


def test_sandbox_blocks_class_mro_rce():
    """沙箱必须阻断通过 __class__.__mro__ 逃逸的 RCE 载荷"""
    with tempfile.TemporaryDirectory() as d:
        evil = "{{ ''.__class__.__mro__[1].__subclasses__() }}"
        with open(os.path.join(d, 'evil.j2'), 'w', encoding='utf-8') as f:
            f.write(evil)
        env = SandboxedEnvironment(loader=FileSystemLoader(d))
        with pytest.raises(Exception):
            env.get_template('evil.j2').render()


def test_sandbox_allows_normal_config_render():
    """正常网络配置模板在沙箱中应可正常渲染"""
    with tempfile.TemporaryDirectory() as d:
        tpl = """interface {{ ifname }}
 description {{ desc }}
 switchport access vlan {{ vlan }}
"""
        with open(os.path.join(d, 'asw.j2'), 'w', encoding='utf-8') as f:
            f.write(tpl)
        env = SandboxedEnvironment(loader=FileSystemLoader(d))
        out = env.get_template('asw.j2').render(ifname='G1/0/1', desc='PC-01', vlan=20)
        assert 'interface G1/0/1' in out
        assert 'switchport access vlan 20' in out


def test_parse_only_still_works():
    """仅 parse 不执行仍是安全的（校验场景）"""
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, 'bad.j2'), 'w', encoding='utf-8') as f:
            f.write("{% if %}")
        from jinja2 import Environment
        env = Environment()
        with pytest.raises(TemplateSyntaxError):
            env.parse(open(os.path.join(d, 'bad.j2'), encoding='utf-8').read())

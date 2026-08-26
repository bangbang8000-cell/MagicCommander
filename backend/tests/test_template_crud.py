"""模板 CRUD 命令测试（M6-b：template list/save/update/delete）"""
import json
import os
import sys
import types

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402


def _args(**kw):
    return types.SimpleNamespace(**kw)


class TestTemplateCommands:
    def _setup(self, tmp_path, monkeypatch):
        monkeypatch.setattr(main, 'WORKSPACE_DIR', str(tmp_path / 'workspace'))
        ws = main.WORKSPACE_DIR
        proj = os.path.join(ws, '源项目')
        os.makedirs(os.path.join(proj, 'templates'), exist_ok=True)
        with open(os.path.join(proj, 'para.xlsx'), 'w', encoding='utf-8') as f:
            f.write('x')
        with open(os.path.join(proj, 'templates', 'ASW.j2'), 'w', encoding='utf-8') as f:
            f.write('orig')
        monkeypatch.setattr(main, '_example_dir', lambda: str(tmp_path / 'example'))
        return tmp_path

    def test_save_and_list(self, tmp_path, monkeypatch, capsys):
        self._setup(tmp_path, monkeypatch)
        main.handle_template_command(None, _args(subcommand='save', project='源项目', name='新模板'))
        ex = os.path.join(str(tmp_path / 'example'), '新模板')
        assert os.path.isdir(ex)
        assert os.path.isdir(os.path.join(ex, 'templates'))
        capsys.readouterr()  # 清空 save 成功输出
        main.handle_template_command(None, _args(subcommand='list'))
        data = json.loads(capsys.readouterr().out)['data']
        assert '新模板' in data

    def test_save_duplicate_error(self, tmp_path, monkeypatch, capsys):
        self._setup(tmp_path, monkeypatch)
        main.handle_template_command(None, _args(subcommand='save', project='源项目', name='T1'))
        with pytest.raises(SystemExit):
            main.handle_template_command(None, _args(subcommand='save', project='源项目', name='T1'))

    def test_save_invalid_name(self, tmp_path, monkeypatch, capsys):
        self._setup(tmp_path, monkeypatch)
        with pytest.raises(SystemExit):
            main.handle_template_command(None, _args(subcommand='save', project='源项目', name='../evil'))

    def test_update_roundtrip_and_delete(self, tmp_path, monkeypatch, capsys):
        self._setup(tmp_path, monkeypatch)
        main.handle_template_command(None, _args(subcommand='save', project='源项目', name='T2'))
        main.handle_template_command(None, _args(
            subcommand='update', name='T2', file_path='templates/ASW.j2', content='{{ info }}'))
        fpath = os.path.join(str(tmp_path / 'example'), 'T2', 'templates', 'ASW.j2')
        assert os.path.isfile(fpath)
        with open(fpath, 'r', encoding='utf-8') as f:
            assert f.read() == '{{ info }}'
        # 删除
        main.handle_template_command(None, _args(subcommand='delete', name='T2', force=True))
        assert not os.path.exists(os.path.join(str(tmp_path / 'example'), 'T2'))

    def test_update_traversal_guarded(self, tmp_path, monkeypatch, capsys):
        self._setup(tmp_path, monkeypatch)
        main.handle_template_command(None, _args(subcommand='save', project='源项目', name='T3'))
        with pytest.raises(SystemExit):
            main.handle_template_command(None, _args(
                subcommand='update', name='T3', file_path='../../escape', content='x'))

import importlib
from pathlib import Path

import pandas as pd


def test_exceltomarkdown_generates_markdown_label_file(tmp_path, monkeypatch):
    workspace = tmp_path / 'workspace'
    project = workspace / 'DemoProject'
    excel_dir = project / 'excel'
    excel_dir.mkdir(parents=True)

    df = pd.DataFrame(
        [
            {
                '设备名': 'CORE-01',
                'SN': 'SN001',
                '型号': 'CE6857',
                '角色': 'CORE',
                '楼层': '3F',
                '机柜': 'A01',
                'U数': '12U',
                '管理IP': '10.0.0.1',
                '管理接口': 'MEth0/0/0',
            }
        ]
    )
    with pd.ExcelWriter(excel_dir / 'hostname.xlsx') as writer:
        df.to_excel(writer, sheet_name='主机表', index=False)

    import config
    import ExcelToLabel

    monkeypatch.setattr(config, 'WORKSPACE_DIR', str(workspace))
    importlib.reload(ExcelToLabel)

    ExcelToLabel.exceltomarkdown(['DemoProject'], '2026_07_16_01_02_03')

    output = project / 'output-label' / '2026_07_16_01_02_03' / '2026_07_16_01_02_03_label.md'
    assert output.exists()
    content = output.read_text(encoding='utf-8')
    assert '# 设备标签 - DemoProject' in content
    assert '| 设备名 | CORE-01 |' in content
    assert '| 管理接口 | MEth0/0/0 |' in content

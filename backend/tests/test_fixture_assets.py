"""4.6.0-F6-2（46-b）Q-2：测试数据资产可复用（pytest 侧消费样例）

- Q-2 断言：manifest 完整、资产文件存在、64h100 样例被 pytest 消费（参数表/元数据）。
"""
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FIXTURES = os.path.join(REPO, 'tests', 'fixtures')


def _load(rel):
    with open(os.path.join(FIXTURES, rel), encoding='utf-8') as f:
        return json.load(f)


def test_manifest_exists_and_assets_complete():
    manifest = _load('manifest.json')
    assert manifest['schema'].startswith('mc.quality.fixture-manifest')
    assets = manifest['assets']
    assert len(assets) >= 4, '至少 4 项测试数据资产'
    for a in assets:
        assert a['id'] and a['category'] and a['scenario']
        assert os.path.exists(os.path.join(FIXTURES, a['path'])), f"资产缺失: {a['path']}"
        assert 'pytest' in a['consumedBy'] or 'vitest' in a['consumedBy']


def test_consume_64h100_para_sample():
    """64 台 H100 参数表样例被 pytest 消费。"""
    sample = _load('samples/64h100_para.json')
    assert sample['schema'] == 'mc.quality.fixture/1'
    assert sample['meta']['gpuCount'] == 64
    assert sample['meta']['gpuModel'] == 'H100'
    params = {p['key']: p['value'] for p in sample['parameters']}
    assert params['gpu_count'] == '64'
    assert params['storage_enabled'] == 'true'
    assert params['fabric_mode'] == 'converged'
    assert len(sample['parameters']) >= 10
    assert 'pytest' in sample['consumedBy']


def test_consume_render_baseline_sample():
    """渲染基线样例（对齐 tests/golden 结构）可复用。"""
    base = _load('render-baselines/example1_baseline.json')
    assert base['render_hash']
    assert len(base['render_hash']) == 16
    assert isinstance(base['batch_manifest'], list) and len(base['batch_manifest']) > 0
    assert base['device_count'] == len(base['batch_manifest'])

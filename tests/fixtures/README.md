# MC 测试数据资产（4.6.0-F6-2 / 46-b）

> 质量与测试体系 —— 测试数据资产目录。样例项目 / 参数表 / 模板 / 渲染基线，
> 可被 **pytest** 与 **vitest** 复用（Q-2 断言：至少 1 个样例被测试消费）。

## 目录结构

```
tests/fixtures/
├── manifest.json                  # 资产清单（唯一入口，Q-2 遍历校验）
├── README.md                      # 本文档
├── samples/                       # 样例项目/参数表（关键场景）
│   ├── 64h100_para.json           # 64台H100参数表（超节点/AIDC，多机柜+融合网+存储开启）
│   ├── multi_rack.json            # 多机柜布局（2机柜x8服务器，机柜间直连）
│   ├── fabric_converged.json      # 融合网（计算+存储共用平面，RoCE）
│   └── storage_off.json           # 存储关闭（纯计算网，无存储 SPINE/LEAF）
├── templates/                     # 模板资产（Jinja2 样例）
│   └── ASW.sample.j2              # 接入交换机模板（含条件块）
└── render-baselines/              # 渲染基线资产（对齐 tests/golden 结构）
    └── example1_baseline.json     # 批次清单 + 强哈希样例
```

## 资产 Schema（samples/*.json）

```jsonc
{
  "asset": "64h100_para",                 // 资产 ID（唯一）
  "schema": "mc.quality.fixture/1",       // Schema 版本（只升不降）
  "category": "sample-project",           // sample-project | template | render-baseline
  "scenario": "64台H100参数表（...）",      // 场景说明
  "consumedBy": ["pytest", "vitest"],     // 消费方
  "meta": { "gpuCount": 64, ... },        // 场景元数据
  "parameters": [ { "key": "...", "value": "..." } ]  // 参数表（键值对）
}
```

## 消费约定

- **pytest**：`backend/tests/test_fixture_assets.py` 从仓库根 `tests/fixtures/` 加载 manifest，
  遍历校验每个资产文件存在且结构完整，并消费 `64h100_para` 样例（参数表非空、GPU 数=64）。
- **vitest**：`src/test/quality-assets.test.ts`（`process.cwd()` 为仓库根）消费 `64h100_para`
  样例（参数表键值结构）与 `example1_baseline` 渲染基线（render_hash 长度 16）。
- 新增资产：在 `samples/ | templates/ | render-baselines/` 下加文件，并在 `manifest.json` 登记即可；
  清单测试会自动发现并校验。

## 与既有基线的关联

- 渲染基线：`tests/golden/example1.json`、`tests/golden/example2.json` 为 `scripts/gen_golden.py`
  生成的正式 golden 基线；`render-baselines/example1_baseline.json` 为同构的**样例基线**（供测试复用，不参与 golden 门禁）。
- 后端既有契约样例：`backend/tests/fixtures/al_plan_v12.json`（plan:table/1.2 契约），
  属后端私有夹具；本目录为**跨端共享**资产。

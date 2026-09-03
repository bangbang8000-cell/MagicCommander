# 示例资产（AIDC 四示例）说明

> 适用版本：4.9.0 · 文档版本：v1.0 · 2026-09-03

## 1. 概述

MagicCommander 4.9.0（「示例资产与收官」）内置 4 个 AIDC（AI 数据中心）示例项目，作为模板中心的一等资产注册，覆盖两种集群规模 × 两种组网协议：

| 示例 | 规模 | 协议 | 收敛比 | 设备数 | 接线 | 终端 |
|------|------|------|--------|--------|------|------|
| 64H100-IB | 64 台 H100 | InfiniBand | 1:1 | 22 | 268 | 720 |
| 64H100-RoCE | 64 台 H100 | RoCEv2 | 3:1 | 22 | 268 | 720 |
| 128H100-IB | 128 台 H100 | InfiniBand | 1:1 | 24 | 524 | 1232 |
| 128H100-RoCE | 128 台 H100 | RoCEv2 | 3:1 | 24 | 524 | 1232 |

设备角色分布：64 档 = 2 SPINE + 8 LEAF + 1 STO_SPINE + 2 STO_LEAF + 2 BIZ_AGG + 4 BIZ_ACCESS + 1 OOB_AGG + 2 OOB_ACCESS；128 档 SPINE 翻倍为 4，其余同。四网合一（业务&管理 / 参数 / 存储 / 带外），8 类角色模板。

## 2. 资产位置与结构

- 模板中心源码：`example/{64H100-IB,64H100-RoCE,128H100-IB,128H100-RoCE}/`
- 运行时副本：首启由 `initializeWorkspace` 从 `example/` 复制到 `template/`
- 参考样本：`workspace/64台H100项目/`（22 台，AIDC 导入结构的参照物）

每个示例目录：

```
{name}/
├── para.xlsx              # 渲染入口参数（四表多 sheet 声明）
├── plan.json              # plan:table v1.2 全量溯源（导入闭环）
├── template.meta.json     # 模板中心元数据（planes/roles/tunables/origin 溯源）
├── README.md
├── excel/                 # hostname / connection / ipaddress / parameter 四表
└── templates/             # SPINE/LEAF/STO_SPINE/STO_LEAF/BIZ_AGG/BIZ_ACCESS/OOB_AGG/OOB_ACCESS .j2
```

## 3. 生成与再生成

示例由 `scripts/gen_aidc_samples.py` 生成并注册（构建 plan:table v1.2 → `import_plan_auto` 导入 → 落地 `example/` 并富化 meta/README）。重复生成字节级幂等（固定时间戳与 projectId）。

```bash
python scripts/gen_aidc_samples.py            # 生成 + 注册 4 示例到 example/
python scripts/gen_aidc_samples.py --list     # 列出示例定义
```

共享定义与构建逻辑见 `scripts/aidc_samples.py`（SAMPLE_DEFS / build_plan / register_samples）。

## 4. IB 与 RoCE 差异

- **IB（InfiniBand）**：NVIDIA Quantum（QM9700）无损计算/存储网，收敛比 1:1，低延迟高吞吐，适合 HPC/AI 训练。
- **RoCE（RoCEv2）**：H3C S9827（SPINE/LEAF）、S9825-128B（STO）以太 RoCE 网，启用 PFC/CNP 无损队列（`macro.pfcQueue/cnpQueue`），收敛比 3:1，兼顾成本与通用性。

差异体现在 `macro.param_protocol` 语义（convergence）、`macro.deviceModels` 型号矩阵、`plan.convergence` 与模板中的 PFC/CNP 参数。

## 5. 自动化验收（CI 门禁）

- `python scripts/validate_samples.py`（4 示例 × 打开/渲染/导出/回灌幂等/golden，退出码 0/1）
- `python scripts/validate_templates.py`（模板库整体健康，含 4 示例）
- `python scripts/gen_golden.py --check`（渲染 hash 基线：`tests/golden/{name}.json`）
- 单元测试：`backend/tests/test_aidc_samples.py`（构建/校验/资产不变量/注册/回灌）
- 前端：`src/test/template-center-aidc.test.tsx`（模板中心展示 4 示例、分类筛选、基于示例创建）
- 覆盖率棘轮：`python scripts/check_coverage_baseline.py`（新增源码已配测试，只升不降）

## 6. 维护约定

- 示例资产变更必须同步更新 `tests/golden/`（`gen_golden.py` 重生成）并保持 CI 全绿。
- 不得在示例目录内提交渲染产物（output/yaml/label）与 `allocator_state.json`（gitignore 已覆盖）。
- 修改示例定义后需重跑 `gen_aidc_samples.py` 与全部验收脚本，保证 plan.json 与 build_plan 逐字段一致。

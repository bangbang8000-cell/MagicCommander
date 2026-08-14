# AutoLink 配合与功能需求清单 v1.0

> 创建日期：2026-08-13
> 文档版本：v1.0
> 状态：待 AutoLink 团队评估
> 背景：MagicCommander 智算数据中心内容包需要 AutoLink 组网规划能力。已调研 AutoLink 源码(克隆于 `_research_autolink/AutoLink`，v3.4.2)，以下基于其实际实现提出配合需求。
> 关联：`docs/prd/ai-datacenter-content-pack-prd_v1.0_2026-08-13.md`、`docs/plan/ai-datacenter-content-pack-plan_v1.0_2026-08-13.md`

---

## 0. 调研结论(供 AutoLink 团队对齐)

AutoLink 已是高度匹配的"AI 智算中心网络规划"引擎，实测能力：

- `design` action：`project_config.json` → 完整拓扑 JSON(summary/topology/valid/validationIssues/powerData/estimation)，支持 RoCE 400G/200G、2/3 层 CLOS；
- `capacity:recommend`：`模型档案 + num_gpus` → 协议/速率/收敛比/层数/TCO 推荐；
- `atop:recommend`：模型通信特征 → ZCube 拓扑；
- `export`：连接关系表/设备清单/布线/BOM/机柜 → Excel + 9 章 PDF；
- 网络平面 `param/storage/biz/oob` 与 MC 内容包的 8×400G 参数 + 1×200G 存储 + 2×25G 业务 + 1×1G OOB 规格**天然对齐**；
- 默认 RoCE 选型已是 H3C：`ROCE_DEFAULTS = S9850-64H(leaf)/S9820-64H(spine)`。

已识别三个集成障碍：
1. 无「GPU 卡数 → project_config → 规划表」的端到端后端动作(该桥目前只在前端向导里)；
2. 连接表/BOM/机柜等规划表**只落 Excel，无单一 JSON-safe 返回动作**；且 `report` action 因 pandas DataFrame 序列化**实测报错**；
3. 设备库对**锐捷及 128×400G 高密度型号**覆盖不足，无法直接支撑锐捷内容包。

---

## A. 必须新增/修复项(阻塞 P4 运行时集成)

### A1. 新增后端 action：`design:from-gpus`(端到端参数化规划)
- 输入：`num_gpus`(GPU 卡总数) / `gpus_per_server`(默认 8) / `nics_per_server`(默认 8×400G+1×200G) / `vendor`(h3c/ruijie…) / `protocol`(roce) / `convergence`(目标收敛比) / `tier`(auto)
- 内部：`num_gpus → num_gpu_servers` → 套用 `capacity:recommend` 推荐结果 → 组装 `project_config.json` → 调 `NetworkDesignerV2` 出拓扑
- 输出：同 `design` 的完整 JSON，另带推荐参数来源
- 收益：MC 可一条命令拿到指定 GPU 规模的规划，无需自己拼 project_config

### A2. 新增后端 action：`plan:table`(单一 JSON 返回全部规划表)
- 在 `share:snapshot` 基础上扩展或新增，一次性返回纯 JSON(禁止 DataFrame 泄漏)：
  ```
  { summary, deviceList, connections, ipPlan, vlanPlan, cablingGuide, bom, racks, convergence, validationIssues }
  ```
- `connections` 采用 `{podid, networkType, aDevice, aInterface, aModule, zDevice, zInterface, zModule, cableType, description}` 结构(与导出 Excel 的「连接关系表」列对齐)
- 收益：MC 生成器直接消费 JSON 映射 MC 项目 Excel，无需解析 xlsx

### A3. 修复 `report` action 序列化 bug
- `generate_report_data` 返回含 pandas DataFrame，经 JSON-RPC/CLI 输出时 TypeError。改为显式 `to_dict(orient='records')` 或复用 A2 的纯 JSON 组装。
- 收益：未来 MC 需要 9 章报告数据时可复用

### A4. 设备库补全(支持两厂内容包)
- 新增/校准 新华三与锐捷智算设备 JSON 至 `template/device_library/`：
  - 新华三：S9850-128D2S(128×400G spine)、S9827-64EO(64×400G leaf)、S6850/S6865(存储)、S5130/S5560(业务/OOB)
  - 锐捷：RG-S6950-128Q4CQ(128×400G spine)、RG-S6510-48VS8CQ(64×400G leaf)、RG-S6510(存储)、RG-S2910/RG-S5300(业务/OOB)
- 每款含：端口数/速率/角色类型/功耗/U位/厂商(deviceList 已含厂商字段)
- 收益：两厂规划表与 BOM 数量正确

### A5. 参数化模板填充(可选但建议)
- 将 19 套模板的 `project_config.json` 参数变量化，支持按 `num_gpu_servers / num_gpus / 速率 / 协议 / 厂商` 填充生成
- 收益：A1 组装 project_config 时有可靠模板来源，而非手拼

---

## B. 复用方式建议(供你决策)

AutoLink 为 MIT，允许复用。MC 侧倾向：
- **阶段 0-3(离线)**：MC 开发/调用 AutoLink CLI(`python -m cli design:from-gpus --num-gpus 2048 ... --format json` / `plan:table`)生成内容包，不耦合运行时；
- **阶段 4+(运行时)**：MC Python 引擎以子进程 spawn AutoLink `engine.py`(NDJSON stdio)，与 AutoLink 自己 Electron 的 `python.service.ts` 桥接模式一致；
- 代码形态：git submodule 或 vendored 子集(仅 backend/ 相关模块)均可，请 AutoLink 团队建议。

> 需你确认：AutoLink 仓库的 `backend/` 是否允许被第三方程序以子进程方式调用(目前无鉴权/无独立许可证限制，但请明确意向)。

---

## C. 交付物约定(AutoLink 侧)

| 交付物 | 验收标准 | 建议排期 |
|---|---|---|
| A1 `design:from-gpus` | CLI 一条命令出 32/1024 GPU 规模完整拓扑 JSON，`valid=true` 且收敛比达标 | 与 MC P1 并行 |
| A2 `plan:table` | 返回纯 JSON 六表，字段与 Excel「连接关系表」一致；`share:snapshot` 行为不回退 | 与 MC P1 并行 |
| A3 `report` 修复 | `python -m cli report ...` 不再报序列化错误 | 低优先 |
| A4 设备库补全 | 两厂各角色型号在 `capacity/design` 中可选且 BOM 数量正确 | P3 前 |
| A5 模板参数化 | 任意规模可生成 project_config | 建议 |

---

## D. 接口样例(供实现参考)

```bash
# A1：32台 GPU(256卡) 新华三 参数网络
python -m cli design:from-gpus --num-gpus 256 --gpus-per-server 8 --nics-per-server "8x400G+1x200G" --vendor h3c --protocol roce --convergence 1.0 --format json

# A2：返回规划表 JSON
python -m cli plan:table --config-file out_project.json --format json
```

```json
{
  "summary": { "numServers": 32, "paramLeafCount": 4, "paramSpineCount": 2, "...": "..." },
  "connections": [
    { "podid": "pod-gpu-1", "networkType": "param", "aDevice": "GPU服务器_1",
      "aInterface": "H3C-leaf-1 Eth1/1", "zDevice": "param_leaf_G1_1", "zInterface": "HundredGigE1/0/1",
      "aModule": "400G-QSFP56", "zModule": "400G-QSFP56", "cableType": "MPO", "description": "GPU1-400G-01" }
  ]
}
```

---

## E. 沟通与排期

- AutoLink 侧建议由熟悉 `designer.py` / `cli.py` / `capacity_planning` 的开发者承接 A1~A3(A4/A5 可并行);
- 排期建议与 MC P1(试点)并行启动，目标 M3(全量内容包)前完成 A1/A2/A4，M4 前完成 A3/A5;
- 接口若有调整，以 AutoLink 实现为准，MC 侧提供 `plan:table` JSON 的兼容转换层兜底。

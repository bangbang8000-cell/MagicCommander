# Phase 1-B：准确率与校验体验 实施计划

## 架构分析

### 渲染管线现状
```
Renderer (WorkbenchPanel.tsx)
  → render.store.ts (Zustand action)
    → window.electron.render.project(ids) (IPC)
      → RenderHandler.runPythonCommand() (Electron main)
        → spawn python backend/main.py render project <ids>
          → PreProcessing.execute_render() (Python)
            → Base.render_txt() (Jinja2 Environment)
```

### 关键发现
1. **Python CLI 基于 argparse**，新增子命令只需在 `main.py` 添加 subparser
2. **渲染进度通过 stdout JSON** 传递：`{status: 'progress'|'complete'|'error', message, data}`
3. **Base.render_txt()** 使用 `jinja2.Environment` + `FileSystemLoader`，直接 `env.get_template().render()` 写文件
4. **搜索面板** 已有 `FILE_TYPE_FILTERS` 和 `TEXT_EXTENSIONS`，扩展性好
5. **WorkbenchActionCard** 已有 4 个按钮，可直接扩展 dry-run 和 validate 按钮

---

## 实施步骤

### P1B-1: Dry-run 预演（优先级最高，最先做）

**目标**：不写文件，预览渲染输出内容

**改动清单**：

| 层 | 文件 | 改动 |
|----|------|------|
| Python | `backend/main.py` | 新增 `render dry-run <ids>` 子命令 |
| Python | `backend/pre_processing.py` | 新增 `execute_dry_run()` 方法 |
| Electron | `electron/ipc/render.handler.ts` | 新增 `dryRun()` 方法 |
| Electron | `electron/preload.ts` | 暴露 `dryRun` IPC |
| Zustand | `src/stores/render.store.ts` | 新增 `dryRun` action + `dryRunResult` 状态 |
| Types | `src/types/render.ts` | 新增 `DryRunResult` 类型 |
| Component | `src/components/sidebar/workbench/WorkbenchActionCard.tsx` | 新增 dry-run 按钮 |
| Component | `src/components/sidebar/workbench/WorkbenchDryRunCard.tsx` | 新增 dry-run 预览卡片 |

**数据流**：
```
dryRun(ids) → Python execute_dry_run() → 渲染但不写文件 →
  stdout JSON: {status:'complete', data:{results:[{name,role,content}]}} →
  RenderHandler 解析 → render.store 存储结果 → WorkbenchDryRunCard 展示
```

### P1B-2: Jinja2 模板校验

**目标**：渲染前检测模板语法错误

**改动清单**：

| 层 | 文件 | 改动 |
|----|------|------|
| Python | `backend/main.py` | 新增 `validate template <id>` 子命令 |
| Python | `backend/pre_processing.py` | 新增 `validate_template()` 方法 |
| Electron | `electron/ipc/render.handler.ts` | 新增 `validateTemplate()` |
| Electron | `electron/preload.ts` | 暴露 IPC |
| Zustand | `src/stores/render.store.ts` | 新增 `validateTemplate` action |
| Component | `src/components/sidebar/workbench/WorkbenchReadinessCard.tsx` | 新增校验按钮 + 结果展示 |

### P1B-3: Excel 数据校验

**目标**：检测 Excel 缺列、空值、类型异常

**改动清单**：

| 层 | 文件 | 改动 |
|----|------|------|
| Python | `backend/main.py` | 新增 `validate excel <id>` 子命令 |
| Python | `backend/pre_processing.py` | 新增 `validate_excel()` 方法 |
| Electron | `electron/ipc/render.handler.ts` | 新增 `validateExcel()` |
| Electron | `electron/preload.ts` | 暴露 IPC |
| Zustand | `src/stores/render.store.ts` | 新增 `validateExcel` action |
| Component | `src/components/sidebar/workbench/WorkbenchReadinessCard.tsx` | 集成校验结果 |

### P1B-4: Diff 对比

**目标**：dry-run 输出 vs 已有输出差异

**改动清单**：依赖 P1B-1，在 DryRunCard 中增加 diff 对比逻辑

### P1B-5: 搜索增强

**目标**：扩展搜索范围到模板内容、输出内容

**改动清单**：SearchPanel 扩展 `TEXT_EXTENSIONS` 和搜索范围

---

## 执行顺序

```
P1B-1 (dry-run) → P1B-2 (jinja2 validate) → P1B-3 (excel validate) → P1B-4 (diff) → P1B-5 (search)
```

每个子任务完成后：typecheck → lint → test → 继续下一个
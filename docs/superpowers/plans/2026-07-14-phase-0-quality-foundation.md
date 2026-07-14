# Phase 0：品质筑基 Implementation Plan

> **Goal:** 修复 14 项已知代码质量问题，建立 AI 功能开发的代码质量基线

**Architecture:** Phase 0 聚焦于修复现有代码债务，不新增功能。涉及 Electron 主进程、Python 后端、React 前端三个层面，按依赖关系分组执行：先修致命 bug → 再统一日志和规范 → 然后重构重复代码 → 最后补齐测试和安全。

**Tech Stack:** TypeScript 5, Electron 28, Python 3.11, React 18, Zustand 4, Vitest, pytest, ESLint, Prettier, Ruff

---

## 执行顺序说明

按依赖关系分 7 组，每组内可独立并行：

```
Group 1 (独立): 0.1 arg空格fix + 0.2 PythonService死代码
Group 2 (独立): 0.3 Python日志 + 0.4 isinstance() + 0.10 ESLint/Prettier + 0.14 Dead Code
Group 3 (依赖G2): 0.5 Electron/Python重复消除 + 0.7 真实进度 + 0.12 渲染缓存
Group 4 (依赖G3): 0.8 render.store去重 + 0.9 统一错误处理
Group 5 (独立): 0.6 XSS安全加固 + 0.11 Python测试
Group 6 (独立): 0.13 渲染撤销
```

---

### Task 1: 修复 arg 空格分割 bug

**Files:**
- Modify: `electron/utils/security.ts:54-74`

**问题**: `escapePythonArg()` 函数用 `_` 替换空格，导致含空格的项目名无法使用。

- [ ] **Step 1: 修复 escapePythonArg 允许空格**

```typescript
// electron/utils/security.ts:54-74 — 修改 escapePythonArg

export function escapePythonArg(arg: string): string {
  if (!arg || typeof arg !== 'string') return ''
  
  // 移除危险字符（Shell 元字符），但保留空格（因为 spawn 用数组传参，空格安全）
  const dangerousChars = ['$', '`', '\\', '\n', '\r', ';', '|', '&', '<', '>', '(', ')', '{', '}', '[', ']']
  let escaped = arg
  
  for (const char of dangerousChars) {
    escaped = escaped.replace(char, '')
  }
  
  // 只允许字母、数字、下划线、连字符、点、空格、中文
  escaped = escaped.replace(/[^\w\-\u4e00-\u9fff\u3400-\u4dbf\s\.]/g, '_')
  
  // 限制长度
  if (escaped.length > SECURITY_CONFIG.PROJECT_NAME_MAX_LENGTH) {
    escaped = escaped.slice(0, SECURITY_CONFIG.PROJECT_NAME_MAX_LENGTH)
  }
  
  return escaped.trim()
}
```

- [ ] **Step 2: 更新 validateProjectName 允许空格**

```typescript
// electron/utils/security.ts:137-166 — 修改 validateProjectName

export function validateProjectName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: '项目名不能为空' }
  }
  
  const trimmed = name.trim()
  
  if (trimmed.length === 0) {
    return { valid: false, error: '项目名不能为空' }
  }
  
  if (trimmed.length > SECURITY_CONFIG.PROJECT_NAME_MAX_LENGTH) {
    return { valid: false, error: `项目名长度不能超过 ${SECURITY_CONFIG.PROJECT_NAME_MAX_LENGTH} 个字符` }
  }
  
  // 检查非法字符（允许空格，但禁止路径分隔符等）
  const invalidChars = /[\\/:*?"<>|]/
  if (invalidChars.test(trimmed)) {
    return { valid: false, error: '项目名不能包含 \\ / : * ? " < > |' }
  }
  
  // 检查禁止的模式
  for (const pattern of SECURITY_CONFIG.FORBIDDEN_PATH_PATTERNS) {
    if (trimmed.toLowerCase().includes(pattern.toLowerCase())) {
      return { valid: false, error: `项目名不能包含 "${pattern}"` }
    }
  }
  
  return { valid: true }
}
```

- [ ] **Step 3: 验证修复**

Run: 在应用中创建含空格的项目名（如 "My Project"），确认创建成功且能正常渲染。

- [ ] **Step 4: Commit**

```bash
git add electron/utils/security.ts
git commit -m "fix: 允许项目名包含空格，修复 arg 空格分割 bug"
```

---

### Task 2: 删除 PythonService 死代码 + 统一 spawn 模式

**Files:**
- Delete: `electron/services/python.service.ts` (删除整个文件)
- Modify: `electron/ipc/render.handler.ts` (移除对 python.service 的引用)

- [ ] **Step 1: 确认无引用后删除**

Run: `rg "python.service" electron/ --files-with-matches`

如果无引用（或仅有 import 未使用），则删除文件。

```bash
# 删除死代码文件
Remove-Item 'electron/services/python.service.ts' -Force
```

- [ ] **Step 2: 清理 render.handler.ts 中可能的残留引用**

检查 `electron/ipc/render.handler.ts` 第 1-10 行，确认是否有 `import { PythonService }` 等引用。如有则删除。

- [ ] **Step 3: pipeline 单行日志**

`RenderHandler` 中 `_spawnPython` 每个子进程的 stdout 输出是逐行 JSON，无需分 pipeline。但为保证日志可读，在 `_spawnPython` 中移除 `[pipeline]` 前缀，直接 logger.info。

- [ ] **Step 4: Commit**

```bash
git add electron/services/python.service.ts electron/ipc/render.handler.ts
git commit -m "refactor: 删除 PythonService 死代码，统一为 spawn 模式"
```

---

### Task 3: Python 结构化日志（197 print → logging）

**Files:**
- Modify: `backend/base.py`
- Modify: `backend/pre_processing.py`
- Modify: `backend/main.py`
- Modify: `backend/ExcelToLabel.py`

**问题**: 197 处 `print()` 调用，无法按级别过滤，无法重定向到文件。

- [ ] **Step 1: 更新 base.py 日志**

在所有函数顶部添加 `logger = logging.getLogger(__name__)`，将所有 `print()` 替换为 `logger.info()` 或 `logger.debug()`。

核心替换规则：
- `print(f"渲染: {device_name}")` → `logger.info(f"渲染: {device_name}")`
- `print(f"错误: {e}")` → `logger.error(f"渲染错误: {e}", exc_info=True)`
- 调试输出 → `logger.debug(...)`
- 进度输出（保留在 pre_processing 中处理）→ 保持 `_emit_progress` 不变

- [ ] **Step 2: 更新 pre_processing.py 日志**

类似替换，将 `print()` 改为 `logger.info/error/debug`。

`_emit_progress()` 函数保持不变（它输出 JSON 进度事件到 stdout，Electron 解析此格式）。

- [ ] **Step 3: 更新 main.py 日志**

替换所有 `print()` 为 `logger`。

- [ ] **Step 4: 更新 ExcelToLabel.py 日志**

替换所有 `print()` 为 `logger`。

- [ ] **Step 5: 验证**

Run: 在渲染一个项目后，确认：
```bash
cd backend
python main.py render project 1
```
输出中 `print()` 调用数为 0，所有输出通过 logging 模块。

- [ ] **Step 6: Commit**

```bash
git add backend/base.py backend/pre_processing.py backend/main.py backend/ExcelToLabel.py
git commit -m "refactor: 将所有 print() 替换为 Python logging 模块"
```

---

### Task 4: Python isinstance() 替换 type() is

**Files:**
- Modify: `backend/base.py`

- [ ] **Step 1: 查找并替换所有 type() is 用法**

Run: `rg "type\(.*\)\s+is\s+" backend/ --line-number`

对所有匹配处，将 `type(x) is dict` → `isinstance(x, dict)`，`type(x) is list` → `isinstance(x, list)` 等。

关键替换示例：
```python
# Before
if type(value) is dict:
    ...
# After
if isinstance(value, dict):
    ...
```

- [ ] **Step 2: 验证**

Run: `cd backend && python -m pytest tests/ -v`

- [ ] **Step 3: Commit**

```bash
git add backend/base.py
git commit -m "refactor: 将 type() is 替换为 isinstance() 以支持子类"
```

---

### Task 5: 消除 Electron/Python 项目操作重复

**Files:**
- Modify: `electron/ipc/handlers.ts`

**问题**: handlers.ts 中有 `copyDirRecursive`、`syncMcParaProject` 等函数，与 Python `pre_processing.py` 的 `execute_create` 逻辑重复。

- [ ] **Step 1: 重构 project:create — 改为走 Python CLI**

当前 `project:create` handler 在 Electron 侧直接创建目录和文件。改为调用 Python CLI：

```typescript
// electron/ipc/handlers.ts:110-133 — 修改 project:create

ipcMain.handle('project:create', async (_e, name: string, options?: { template?: string; empty?: boolean }): Promise<void> => {
  const validation = validateProjectName(name)
  if (!validation.valid) {
    throw new Error(validation.error || '项目名无效')
  }
  
  // 统一走 Python CLI 创建项目（保证目录、MC_Para.xlsx、para.xlsx 同步）
  const args = ['project', 'create', name]
  if (options?.empty) {
    args.push('--empty')
  } else if (options?.template) {
    args.push('--template', options.template)
  }
  await renderHandler.runPythonCommand(args, '创建项目')
})
```

- [ ] **Step 2: 重构 project:saveAsExample — 可选保留或走 CLI**

saveAsExample 是纯文件操作，不涉及 Python 逻辑。可以保留在 Electron 侧，但使用 `renderHandler` 的统一项目路径解析。

- [ ] **Step 3: 验证**

确认创建项目后，`MC_Para.xlsx` 和 `para.xlsx` 内容一致，Python CLI 和 Electron 侧创建的项目结构相同。

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "refactor: 统一项目创建逻辑到 Python CLI，消除 Electron 重复实现"
```

---

### Task 6: XSS 安全加固

**Files:**
- Modify: `src/components/common/MarkdownViewer.tsx` (或其他使用 dangerouslySetInnerHTML 的组件)
- New: `electron/package.json` (添加 dompurify 依赖)

- [ ] **Step 1: 安装 DOMPurify**

Run: `npm install dompurify && npm install -D @types/dompurify`

- [ ] **Step 2: 查找所有 dangerouslySetInnerHTML 使用**

Run: `rg "dangerouslySetInnerHTML" src/ --line-number`

- [ ] **Step 3: 包装为安全的 HTML 渲染函数**

```typescript
// src/utils/sanitize.ts (新建)
import DOMPurify from 'dompurify'

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'hr'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'class'],
  })
}
```

- [ ] **Step 4: 替换所有 dangerouslySetInnerHTML 为 sanitizeHtml**

- [ ] **Step 5: Commit**

```bash
git add src/utils/sanitize.ts package.json
git commit -m "fix: 添加 DOMPurify XSS 安全加固，替换 dangerouslySetInnerHTML"
```

---

### Task 7: 真实渲染进度

**Files:**
- Modify: `backend/pre_processing.py`
- Modify: `src/stores/render.store.ts`

- [ ] **Step 1: 修改 pre_processing.py — 计算真实百分比**

```python
# backend/pre_processing.py — execute_render 方法中

def execute_render(self, project_names: list[str], mode: str = 'name'):
    total_sheets = self._count_total_sheets(project_names)
    completed = 0
    
    for name in project_names:
        project_dir = os.path.join(self.workspace, name)
        para_path = os.path.join(project_dir, 'para.xlsx')
        sheets = self._read_para_sheets(para_path)
        
        for sheet in sheets:
            # ... 渲染逻辑 ...
            completed += 1
            progress = int(completed / total_sheets * 100)
            self._emit_progress(progress, f'渲染 {name}/{sheet}')
```

- [ ] **Step 2: 新增 _count_total_sheets 辅助方法**

- [ ] **Step 3: 更新 render.store.ts 进度解析**

保持现有 `subscribeProgress` 逻辑不变（它已经接收 `render:progress` 事件），只需确保进度值是从 0-100 的百分比。

- [ ] **Step 4: Commit**

```bash
git add backend/pre_processing.py
git commit -m "fix: 渲染进度改为按 sheet 数计算真实百分比"
```

---

### Task 8: render.store.ts 去重

**Files:**
- Modify: `src/stores/render.store.ts`

- [ ] **Step 1: 创建工厂方法**

```typescript
// src/stores/render.store.ts — 用工厂方法替换 8 个重复方法

type RenderAction = 'render-project' | 'render-yaml' | 'render-project-sn' | 'render-yaml-sn'
type DeleteAction = 'delete-output' | 'delete-output-sn' | 'delete-yaml' | 'delete-yaml-sn'

function createRenderAction(
  action: RenderAction,
  get: () => RenderState,
  set: (partial: Partial<RenderState>) => void
) {
  const actionMap: Record<RenderAction, { ipcChannel: string; label: string }> = {
    'render-project': { ipcChannel: 'render:project', label: '渲染项目' },
    'render-yaml': { ipcChannel: 'render:yaml', label: '生成 YAML' },
    'render-project-sn': { ipcChannel: 'render:project-sn', label: '渲染项目(SN)' },
    'render-yaml-sn': { ipcChannel: 'render:yaml-sn', label: '生成 YAML(SN)' },
  }
  
  return async (ids: string[]) => {
    const { ipcChannel, label } = actionMap[action]
    set({ isRendering: true, renderProgress: 0 })
    try {
      await window.electron.render[ipcChannel](ids)
      set({ isRendering: false, renderProgress: 100 })
    } catch (err) {
      set({ isRendering: false, renderError: String(err) })
      throw err
    }
  }
}
```

- [ ] **Step 2: 替换 8 个方法为工厂调用**

```typescript
export const useRenderStore = create<RenderStore>()(
  persist(
    (set, get) => ({
      isRendering: false,
      renderProgress: 0,
      renderError: null,
      
      renderProject: createRenderAction('render-project', get, set),
      renderYaml: createRenderAction('render-yaml', get, set),
      renderProjectSn: createRenderAction('render-project-sn', get, set),
      renderYamlSn: createRenderAction('render-yaml-sn', get, set),
      // ... delete 方法同理
    }),
    { name: 'render-store' }
  )
)
```

- [ ] **Step 3: 验证**

确认所有渲染功能正常（render/store 的 8 个方法行为不变）。

- [ ] **Step 4: Commit**

```bash
git add src/stores/render.store.ts
git commit -m "refactor: render.store.ts 用工厂方法消除 8 个重复方法"
```

---

### Task 9: 统一错误处理

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/services/errorService.ts`

- [ ] **Step 1: 创建 ErrorService**

```typescript
// src/services/errorService.ts (如不存在则新建)

export class ErrorService {
  private static instance: ErrorService
  
  static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService()
    }
    return ErrorService.instance
  }
  
  handleError(error: unknown, context: string): void {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[${context}]`, message)
    
    // 转发到日志 Store
    const { useLogStore } = require('../stores/log.store')
    useLogStore.getState().addLog({
      source: 'app',
      level: 'error',
      message: `[${context}] ${message}`,
    })
  }
}
```

- [ ] **Step 2: 替换 30 处 console.error**

Run: `rg "console.error" src/ --line-number`

将散落的 `console.error` 替换为 `ErrorService.getInstance().handleError(err, 'ComponentName')`。

- [ ] **Step 3: Commit**

```bash
git add src/services/errorService.ts src/App.tsx
git commit -m "refactor: 统一错误处理为 ErrorService，减少散落 console.error"
```

---

### Task 10: 配置 ESLint + Prettier

**Files:**
- New: `.eslintrc.cjs`
- New: `.prettierrc`
- Modify: `package.json` (添加 lint 脚本)

- [ ] **Step 1: 安装依赖**

```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-react-hooks prettier eslint-config-prettier
```

- [ ] **Step 2: 创建 .eslintrc.cjs**

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: { react: { version: 'detect' } },
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['dist/', 'dist-electron/', 'node_modules/', 'release/'],
}
```

- [ ] **Step 3: 创建 .prettierrc**

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 120
}
```

- [ ] **Step 4: 更新 package.json scripts**

```json
"lint": "eslint src/ electron/ --ext .ts,.tsx",
"lint:fix": "eslint src/ electron/ --ext .ts,.tsx --fix",
"format": "prettier --write \"src/**/*.{ts,tsx,css}\" \"electron/**/*.ts\"",
"format:check": "prettier --check \"src/**/*.{ts,tsx,css}\" \"electron/**/*.ts\""
```

- [ ] **Step 5: 运行 lint 检查**

```bash
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add .eslintrc.cjs .prettierrc package.json
git commit -m "chore: 配置 ESLint + Prettier 代码规范"
```

---

### Task 11: Python 核心逻辑测试

**Files:**
- New: `backend/tests/test_base_rendering.py`
- Modify: `backend/tests/test_base.py`

- [ ] **Step 1: 编写 base.py 核心逻辑测试**

```python
# backend/tests/test_base_rendering.py

import pytest
from base import Base, json_safe_val, remove_empty_pair, string_split, deep_dict

class TestBaseRendering:
    def test_render_basic_template(self):
        """测试基本 Jinja2 模板渲染"""
        base = Base()
        base.devices = {
            'device1': {
                'hostname': 'SW-01',
                'mgmt_ip': '192.168.1.1',
                'role': 'ASW',
            }
        }
        template = "hostname {{ info['hostname'] }}\nip address {{ info['mgmt_ip'] }}"
        result = base.render_txt(template, 'device1')
        assert 'hostname SW-01' in result
        assert 'ip address 192.168.1.1' in result
    
    def test_json_safe_val_nan(self):
        """测试 NaN 值处理"""
        import math
        result = json_safe_val(float('nan'))
        assert result == 0
    
    def test_remove_empty_pair(self):
        """测试空值移除"""
        data = {'a': 1, 'b': '', 'c': None, 'd': 'value'}
        result = remove_empty_pair(data)
        assert 'a' in result
        assert 'b' not in result
        assert 'c' not in result
        assert 'd' in result
```

- [ ] **Step 2: 运行测试**

```bash
cd backend && python -m pytest tests/ -v --cov=. --cov-report=term
```

- [ ] **Step 3: Commit**

```bash
git add backend/tests/
git commit -m "test: 添加 Python 核心逻辑自动化测试"
```

---

### Task 12: 渲染缓存机制

**Files:**
- Modify: `backend/pre_processing.py`

- [ ] **Step 1: 实现基于 hash 的渲染缓存**

```python
# backend/pre_processing.py — 新增缓存逻辑

import hashlib
import json

def _compute_cache_key(self, project_dir: str, sheet_name: str) -> str:
    """计算渲染输入参数的 hash 作为缓存 key"""
    para_path = os.path.join(project_dir, 'para.xlsx')
    excel_path = os.path.join(project_dir, 'excel', f'{sheet_name}.xlsx')
    template_path = os.path.join(project_dir, 'templates')
    
    hasher = hashlib.sha256()
    for path in [para_path, excel_path]:
        if os.path.exists(path):
            with open(path, 'rb') as f:
                hasher.update(f.read())
    # 也包含模板文件 hash
    if os.path.isdir(template_path):
        for fname in sorted(os.listdir(template_path)):
            with open(os.path.join(template_path, fname), 'rb') as f:
                hasher.update(fname.encode())
                hasher.update(f.read())
    
    return hasher.hexdigest()

def _get_cached_output(self, project_dir: str, sheet_name: str) -> str | None:
    """获取缓存的渲染结果"""
    cache_key = self._compute_cache_key(project_dir, sheet_name)
    cache_file = os.path.join(project_dir, '.render_cache', f'{sheet_name}.txt')
    cache_meta = os.path.join(project_dir, '.render_cache', f'{sheet_name}.meta')
    
    if os.path.exists(cache_file) and os.path.exists(cache_meta):
        with open(cache_meta) as f:
            if f.read().strip() == cache_key:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    return f.read()
    return None

def _save_cached_output(self, project_dir: str, sheet_name: str, output: str):
    """保存渲染结果到缓存"""
    cache_key = self._compute_cache_key(project_dir, sheet_name)
    cache_dir = os.path.join(project_dir, '.render_cache')
    os.makedirs(cache_dir, exist_ok=True)
    
    with open(os.path.join(cache_dir, f'{sheet_name}.meta'), 'w') as f:
        f.write(cache_key)
    with open(os.path.join(cache_dir, f'{sheet_name}.txt'), 'w', encoding='utf-8') as f:
        f.write(output)
```

- [ ] **Step 2: 在 execute_render 中集成缓存**

在渲染每个 sheet 前检查缓存，命中则跳过渲染。

- [ ] **Step 3: 添加 --no-cache CLI 参数**

在 `main.py` 中添加 `--no-cache` 参数，强制跳过缓存重新渲染。

- [ ] **Step 4: Commit**

```bash
git add backend/pre_processing.py
git commit -m "feat: 添加基于参数 hash 的渲染缓存机制"
```

---

### Task 13: 渲染输出撤销

**Files:**
- Modify: `backend/pre_processing.py`

- [ ] **Step 1: 在 execute_render 前备份 output 目录**

```python
# backend/pre_processing.py — execute_render 方法开头

import shutil
from datetime import datetime

def _backup_output(self, project_dir: str):
    """备份 output 目录，支持撤销"""
    output_dir = os.path.join(project_dir, 'output')
    if not os.path.exists(output_dir) or not os.listdir(output_dir):
        return None
    
    backup_dir = os.path.join(project_dir, '.output_backups')
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(backup_dir, timestamp)
    shutil.copytree(output_dir, backup_path)
    return backup_path
```

- [ ] **Step 2: 在 execute_render 中调用备份**

渲染前自动备份 output/，渲染失败时提示可恢复。

- [ ] **Step 3: 添加恢复命令**

在 `main.py` 中添加 `render undo <project_id>` 命令，恢复最近的备份。

- [ ] **Step 4: Commit**

```bash
git add backend/pre_processing.py
git commit -m "feat: 渲染前自动备份 output 目录，支持撤销恢复"
```

---

### Task 14: 清理 Dead Code

**Files:**
- 多个文件

- [ ] **Step 1: 查找未使用的 import**

Run: `npx eslint src/ electron/ --ext .ts,.tsx --rule 'no-unused-vars: warn'`

- [ ] **Step 2: 查找未使用的文件**

检查 `electron/services/` 目录，确认 `pythonEnv.service.ts` 和 `update.service.ts` 是否仍在使用。

- [ ] **Step 3: 清理**

移除所有未使用的 import 和 Dead Code 文件。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: 清理 Dead Code 和未使用 import"
```
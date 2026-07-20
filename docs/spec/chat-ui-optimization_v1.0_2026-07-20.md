# Chat UI 交互优化 - 设计文档 v1.0

> 目标：精简 Chat 面板顶部工具栏，提升交互清晰度和可用性。

## 当前问题

1. 工具栏信息密度过高：模式标签 + 自主模式 + 模型选择 + 操作按钮堆叠
2. 模板/配置/通用三类模式区分度低，用户无感知
3. 🛡️⚡🚀 自主模式图标意义不明确
4. 垃圾桶图标用于"清空会话"语义不准确
5. 会话下拉列表交互效率低，无主题区分
6. 模型列表显示所有 Provider（含未配置的）

## 优化方案

### 1. 会话横向标签栏
- 当前活跃会话以标签形式横向排列在顶部
- 标签显示自动生成的主题（取首条用户消息前 20 字）
- 多余标签可滚动 + 当前标签高亮
- 最右侧固定 `[+] 新建` 按钮
- 每个标签 hover 显示关闭按钮（删除会话）

### 2. 移除模式标签
- 完全删除「模板助手 / 配置问答 / 通用助手」切换栏
- AI 自动根据对话内容判断任务类型
- ChatMode 类型保留（后端仍需要），但前端不再展示

### 3. 自主模式移入设置
- 从 ChatPanel 工具栏删除 🛡️⚡🚀 切换
- 移入 SettingsPanel → Advanced Settings → 自主模式选择
- autonomyMode 从 chat.store 迁移到 ui.store

### 4. 图标语义修正
- 清除当前会话：Trash2 → RotateCcw（重置/清空）
- 新建会话：Plus → MessageSquarePlus + "新建" 文字

### 5. 模型列表过滤
- 仅显示已配置 API Key 的 Provider
- 未配置的不出现在下拉列表中
- 如无可用模型，显示引导文字和跳转设置按钮

### 6. 会话自动主题
- 创建会话时，取首条用户消息前 20 字作为 title
- 持久化到 localStorage，回显时直接使用

## 涉及文件

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/components/chat/ChatPanel.tsx` | 重构 | 顶部工具栏重构，新增标签栏组件 |
| `src/stores/chat.store.ts` | 修改 | createSession 自动生成 title |
| `src/stores/ui.store.ts` | 修改 | 新增 autonomyMode 字段持久化 |
| `src/components/sidebar/SettingsPanel.tsx` | 修改 | 高级设置新增自主模式选择 |
| `src/types/chat.ts` | 修改 | ChatMode 类型保留，清理不再使用的导出 |
| `src/i18n/locales/zh-CN/chat.json` | 修改 | 精简翻译键值 |
| `src/i18n/locales/en/chat.json` | 修改 | 精简翻译键值 |

## 不修改

- ChatMessageBubble / ChatInput / PlanDisplay / AttachmentPreview
- chat.store 的核心消息/发送逻辑
- 后端 Agent / AI Hub / IPC

## 验收标准

- [ ] 顶部工具栏仅保留：标签栏 + 模型下拉 + 设置齿轮
- [ ] 会话以横向标签展示，自动主题
- [ ] 模式切换栏已删除
- [ ] 自主模式切换已删除
- [ ] 设置面板可配置自主模式
- [ ] 清除会话图标为 RotateCcw
- [ ] 新建会话为带文字按钮
- [ ] 模型列表仅显示已配置项
- [ ] TypeScript 零错误
- [ ] 不影响现有消息收发功能

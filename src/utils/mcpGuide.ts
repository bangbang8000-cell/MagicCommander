import i18n from '@/i18n'
import { useEditorStore } from '@/stores/editor.store'

/**
 * 5.1-516-a：MCP 接入配置（一键复制内容）。
 *
 * 粘贴到 Claude Desktop（claude_desktop_config.json）/ Trae / VS Code（.mcp.json）等客户端；
 * Codex CLI 使用 .codex/config.toml 的等价形式。占位符需替换为实际路径。
 */
export const MCP_CONFIG_JSON = `{
  "mcpServers": {
    "magiccommander": {
      "command": "python",
      "args": ["-m", "ai_hub.mcp_server.run", "--mode", "compiled", "--workspace", "<工作区目录>"],
      "cwd": "<MagicCommander-Client 仓库根目录>"
    }
  }
}`

export const MCP_GUIDE_TAB_ID = 'mcp-guide'

/** 打开 MCP 接入指南为工作区标签页（与"使用指南"相同的打开方式：加载到工作区，内容内嵌）。 */
export async function openMcpGuideTab(lang?: string): Promise<boolean> {
  try {
    const resolvedLang = lang || (await window.electron?.app?.getLanguage()) || 'zh-CN'
    const result = await window.electron?.guide?.getMcpGuide?.(resolvedLang)
    if (!result) return false
    let content = result.content
    if (result.usedFallback && result.requestedLang !== 'en') {
      content = `> ⚠️ This language has no guide yet; showing the English version.\n\n${content}`
    }
    useEditorStore.getState().openFile({
      id: MCP_GUIDE_TAB_ID,
      title: i18n.t('menu.mcpGuide', { defaultValue: 'MCP 接入指南' }),
      filePath: 'docs/mcp-guide.md',
      fileType: 'markdown',
      projectId: 0,
      projectName: '',
      isDirty: false,
      content,
    })
    return true
  } catch {
    return false
  }
}

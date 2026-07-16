import type { TemplateInfo } from '@/types/project'
import { ProjectExplorer } from '@/components/common/ProjectExplorer'
import { ProjectStatusBadge } from '@/components/sidebar/project/ProjectStatusBadge'

type TemplateDetailProps = {
  template: TemplateInfo | null
}

export function TemplateDetail({ template }: TemplateDetailProps) {
  if (!template) {
    return <div className="p-3 text-xs text-gray-500 dark:text-gray-400">请选择一个模板查看详情</div>
  }

  return (
    <div className="h-full overflow-auto p-3 text-xs space-y-3">
      <div>
        <div className="font-medium text-sm">{template.name}</div>
        <div className="text-gray-500 dark:text-gray-400 mt-1">{template.description || '暂无简介'}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="text-gray-500 dark:text-gray-400">适用场景</div>
          <div>{template.scenario || '未设置'}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400">来源项目</div>
          <div>{template.sourceProject || '未知'}</div>
        </div>
      </div>
      <div>
        <div className="text-gray-500 dark:text-gray-400 mb-1">结构摘要</div>
        <ProjectStatusBadge status={template.structure} />
      </div>
      <div>
        <div className="text-gray-500 dark:text-gray-400 mb-1">输入要求</div>
        {template.inputRequirements.length > 0 ? (
          <ul className="list-disc pl-4 space-y-0.5">
            {template.inputRequirements.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : (
          <div>未设置</div>
        )}
      </div>
      <div>
        <div className="text-gray-500 dark:text-gray-400 mb-1">输出说明</div>
        <div>{template.outputDescription || '未设置'}</div>
      </div>
      <div>
        <div className="text-gray-500 dark:text-gray-400 mb-1">文件结构</div>
        <ProjectExplorer structure={template.files} />
      </div>
    </div>
  )
}

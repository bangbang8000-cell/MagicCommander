import { FileCode, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import clsx from 'clsx'

type WorkbenchReadinessCardProps = {
  projectInfo: any
  isDark: boolean
  onOpenParaConfig: () => void
  selectedProject: boolean
}

export function WorkbenchReadinessCard({
  projectInfo,
  isDark,
  onOpenParaConfig,
  selectedProject,
}: WorkbenchReadinessCardProps) {
  const structure = projectInfo?.structure

  const items = [
    { key: 'excel', label: 'Excel', description: '项目配置表' },
    { key: 'templates', label: 'Templates', description: '模板目录' },
    { key: 'para', label: 'para.xlsx', description: '参数文件' },
    { key: 'output', label: 'Output', description: '输出目录' },
    { key: 'yaml', label: 'YAML', description: 'YAML 文件' },
  ]

  return (
    <div className="space-y-2">
      <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
        <AlertCircle size={12} /> 准备状态
      </h4>

      {selectedProject ? (
        <div className="space-y-1">
          {items.map((item) => {
            const exists = structure?.[item.key] ?? false
            return (
              <div
                key={item.key}
                className={clsx(
                  'flex items-center gap-1.5 text-[11px] px-1.5 py-0.5',
                  exists
                    ? isDark
                      ? 'text-green-400'
                      : 'text-green-600'
                    : isDark
                      ? 'text-gray-500'
                      : 'text-gray-400',
                )}
              >
                {exists ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                <span className="min-w-[72px]">{item.label}</span>
                <span className={clsx('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  {item.description}
                </span>
              </div>
            )
          })}
          <button
            onClick={onOpenParaConfig}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 mt-1 text-[10px] rounded transition-colors w-full',
              isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
            )}
          >
            <FileCode size={10} /> 打开 para.xlsx
          </button>
        </div>
      ) : (
        <div className={isDark ? 'text-xs text-gray-500' : 'text-xs text-gray-400'}>请选择一个项目查看准备状态</div>
      )}
    </div>
  )
}
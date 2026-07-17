import clsx from 'clsx'

interface AppLogoProps {
  size?: number
  className?: string
  isDark?: boolean
}

/**
 * MagicCommander Logo
 * 蓝色圆角方块 + 白色六边形 + 蓝色 M
 *
 * 数学比例（viewBox 0 0 100 100，中心 50,50）：
 *   正方形 |<--13-->| 六边形 |<--13-->| M |<--13-->| 六边形 |<--13-->| 正方形
 *   即：正方形左右边距 = 六边形到M的距离 = 六边形到正方形边框的距离 = 13
 *   六边形宽 74（占 74%），M 宽 48（占 48%），四个间距均为 13
 */
export function AppLogo({ size = 24, className, isDark }: AppLogoProps) {
  // 六边形顶点：viewBox 100x100，gap=13，r≈42.73
  const hexPoints = '50,7 87,29 87,71 50,93 13,71 13,29'

  return (
    <div
      className={clsx('relative flex items-center justify-center rounded-md shrink-0', className)}
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        boxShadow: isDark
          ? '0 2px 8px rgba(59, 130, 246, 0.3)'
          : '0 2px 8px rgba(59, 130, 246, 0.2)',
      }}
    >
      {/* 白色六边形 */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0"
        style={{ width: '100%', height: '100%' }}
      >
        <polygon
          points={hexPoints}
          fill="white"
          stroke="white"
          strokeWidth="2"
        />
      </svg>
      {/* 蓝色 M 字母 */}
      <span
        className="relative font-bold select-none z-10"
        style={{
          fontSize: size * 0.48,
          lineHeight: 1,
          color: '#2563eb',
        }}
      >
        M
      </span>
    </div>
  )
}
import clsx from 'clsx'

interface AppLogoProps {
  size?: number
  className?: string
  isDark?: boolean
}

export function AppLogo({ size = 24, className, isDark }: AppLogoProps) {
  return (
    <img
      src="/icons/icon.svg"
      alt="MagicCommander"
      className={clsx('block shrink-0 select-none', className)}
      draggable={false}
      style={{
        width: size,
        height: size,
        filter: isDark ? 'drop-shadow(0 2px 8px rgba(59, 130, 246, 0.3))' : 'drop-shadow(0 2px 8px rgba(59, 130, 246, 0.2))',
      }}
    />
  )
}

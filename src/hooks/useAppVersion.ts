import { useEffect, useState } from 'react'

export function useAppVersion(): string {
  const [version, setVersion] = useState('2.0.0')

  useEffect(() => {
    if (window.electron && window.electron.app) {
      window.electron.app.getVersion().then(setVersion).catch(() => setVersion('2.0.0'))
    }
  }, [])

  return version
}

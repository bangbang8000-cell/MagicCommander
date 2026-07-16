import { useEffect, useState } from 'react'

export interface BuildInfo {
  version: string
  build: string
  displayVersion: string
}

export function useAppVersion(): string {
  const [version, setVersion] = useState('2.0.0')

  useEffect(() => {
    if (window.electron && window.electron.app) {
      window.electron.app.getVersion().then(setVersion).catch(() => setVersion('2.0.0'))
    }
  }, [])

  return version
}

export function useBuildInfo(): BuildInfo {
  const [buildInfo, setBuildInfo] = useState<BuildInfo>({
    version: '2.0.0',
    build: '',
    displayVersion: '2.0.0',
  })

  useEffect(() => {
    if (window.electron?.app?.getBuildInfo) {
      window.electron.app.getBuildInfo()
        .then(setBuildInfo)
        .catch(() => {
          setBuildInfo({ version: '2.0.0', build: '', displayVersion: '2.0.0' })
        })
    }
  }, [])

  return buildInfo
}
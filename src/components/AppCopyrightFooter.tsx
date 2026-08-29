import { useEffect, useState } from 'react'
import { version as packageVersion } from '../../package.json'
import { cn } from '@/lib/utils'
import { isNativeApp } from '@/lib/nativeServer'

async function resolveAppVersion(fallback: string): Promise<string> {
  try {
    const info = await window.bodegaStock?.getAppInfo?.()
    if (info?.version?.trim()) return info.version.trim()
  } catch {
    /* ignore */
  }
  try {
    if (isNativeApp()) {
      const { App } = await import('@capacitor/app')
      const info = await App.getInfo()
      if (info.version?.trim()) return info.version.trim()
    }
  } catch {
    /* ignore */
  }
  return fallback
}

export function AppCopyrightFooter({ className }: { className?: string }) {
  const year = new Date().getFullYear()
  const [version, setVersion] = useState(packageVersion)

  useEffect(() => {
    let cancelled = false
    void resolveAppVersion(packageVersion).then((v) => {
      if (!cancelled && v) setVersion(v)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <footer className={cn('pt-2 text-center text-xs leading-relaxed text-slate-400', className)}>
      <p>ControlStock v{version}</p>
      <p className="mt-0.5">
        © {year} · Desarrollado por{' '}
        <a
          href="mailto:JRNCarrizo@gmail.com"
          className="text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          JRNCarrizo
        </a>
      </p>
    </footer>
  )
}

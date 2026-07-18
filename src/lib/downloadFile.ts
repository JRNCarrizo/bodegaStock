import { getApiUrl } from '@/lib/utils'

/** Descarga un archivo binario desde la API (Excel, etc.). */
export async function downloadApiFile(path: string, fallbackFilename: string): Promise<void> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${getApiUrl()}${path}`, { headers })

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(data.error ?? data.message ?? `Error al exportar (${res.status})`)
  }

  const blob = await res.blob()
  let filename = fallbackFilename
  const disposition = res.headers.get('Content-Disposition')
  if (disposition) {
    const match =
      /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(disposition)
    const raw = match?.[1] ?? match?.[2] ?? match?.[3]
    if (raw) {
      try {
        filename = decodeURIComponent(raw.trim())
      } catch {
        filename = raw.trim()
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

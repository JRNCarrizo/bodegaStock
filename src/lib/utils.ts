import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export const API_URL = 'http://127.0.0.1:3847'

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string> | undefined) ?? {})
  }

  const hasBody = options.body !== undefined && options.body !== null && options.body !== ''
  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error('No se pudo conectar con el servidor. Reiniciá la app (npm run dev).')
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ??
      (data as { message?: string }).message ??
      `Error en la solicitud (${res.status})`
    )
  }

  return data as T
}

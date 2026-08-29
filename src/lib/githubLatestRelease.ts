const GITHUB_OWNER = 'JRNCarrizo'
const GITHUB_REPO = 'bodegaStock'

export const GITHUB_RELEASES_LATEST_DOWNLOAD = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download`
export const GITHUB_LATEST_YML_URL = `${GITHUB_RELEASES_LATEST_DOWNLOAD}/latest.yml`

/** Cache en memoria: evita reconsultar latest.yml en check + download seguidos. */
const CACHE_TTL_MS = 10 * 60 * 1000
let cachedLatest: { version: string; at: number } | null = null

export function normalizeReleaseVersion(v: string): string {
  return v.trim().replace(/^v/i, '')
}

export function parseLatestYmlVersion(yml: string): string {
  const match = yml.match(/^version:\s*(\S+)/m)
  if (!match?.[1]) throw new Error('El release no incluye versión en latest.yml')
  const version = normalizeReleaseVersion(match[1])
  if (!version) throw new Error('El release no tiene versión válida')
  return version
}

/** URL directa por tag (menos redirects que /latest/download). */
export function latestApkDownloadUrl(version: string): string {
  const v = normalizeReleaseVersion(version)
  return `${releaseDownloadBaseUrl(v)}/ControlStock-${v}.apk`
}

export function latestSetupDownloadUrl(version: string): string {
  const v = normalizeReleaseVersion(version)
  return `${releaseDownloadBaseUrl(v)}/ControlStock-Setup-${v}.exe`
}

/** Feed genérico por tag (evita /latest/download y sus redirects flaky). */
export function releaseDownloadBaseUrl(version: string): string {
  const v = normalizeReleaseVersion(version)
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${v}`
}

/** Compara semver simple a.b.c. >0 si a>b. */
export function compareSemver(a: string, b: string): number {
  const pa = normalizeReleaseVersion(a).split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0)
  const pb = normalizeReleaseVersion(b).split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function clearLatestReleaseCache(): void {
  cachedLatest = null
}

export function peekCachedLatestReleaseVersion(): string | null {
  if (!cachedLatest) return null
  if (Date.now() - cachedLatest.at > CACHE_TTL_MS) {
    cachedLatest = null
    return null
  }
  return cachedLatest.version
}

/** Consulta el último release sin usar api.github.com (evita rate limit 60/h). */
export async function fetchLatestReleaseVersion(
  getYmlText?: (url: string) => Promise<string>,
  opts?: { bypassCache?: boolean }
): Promise<string> {
  if (!opts?.bypassCache && !getYmlText) {
    const cached = peekCachedLatestReleaseVersion()
    if (cached) return cached
  }

  let yml: string
  if (getYmlText) {
    yml = await getYmlText(GITHUB_LATEST_YML_URL)
  } else {
    const res = await fetch(GITHUB_LATEST_YML_URL, {
      headers: {
        Accept: 'text/plain,*/*',
        'User-Agent': 'ControlStock-Update'
      },
      redirect: 'follow'
    })

    if (!res.ok) {
      throw new Error(`No se pudo leer latest.yml (HTTP ${res.status}).`)
    }

    yml = await res.text()
  }

  if (!yml.trim() || yml.includes('<!DOCTYPE html>')) {
    throw new Error('GitHub devolvió una página HTML en lugar de latest.yml.')
  }

  const version = parseLatestYmlVersion(yml)
  cachedLatest = { version, at: Date.now() }
  return version
}

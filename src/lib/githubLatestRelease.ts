const GITHUB_OWNER = 'JRNCarrizo'
const GITHUB_REPO = 'bodegaStock'

export const GITHUB_RELEASES_LATEST_DOWNLOAD = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download`
export const GITHUB_LATEST_YML_URL = `${GITHUB_RELEASES_LATEST_DOWNLOAD}/latest.yml`

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

export function latestApkDownloadUrl(version: string): string {
  return `${GITHUB_RELEASES_LATEST_DOWNLOAD}/ControlStock-${version}.apk`
}

export function latestSetupDownloadUrl(version: string): string {
  return `${GITHUB_RELEASES_LATEST_DOWNLOAD}/ControlStock-Setup-${version}.exe`
}

/** Consulta el último release sin usar api.github.com (evita rate limit 60/h). */
export async function fetchLatestReleaseVersion(
  getYmlText?: (url: string) => Promise<string>
): Promise<string> {
  let yml: string
  if (getYmlText) {
    yml = await getYmlText(GITHUB_LATEST_YML_URL)
  } else {
    const res = await fetch(GITHUB_LATEST_YML_URL, {
      headers: {
        Accept: 'text/plain',
        'User-Agent': 'ControlStock-Update'
      },
      redirect: 'follow'
    })

    if (!res.ok) {
      if (res.status === 403 || res.status === 429) {
        throw new Error(`GitHub no disponible temporalmente (HTTP ${res.status}). Probá más tarde.`)
      }
      throw new Error(`No se pudo leer latest.yml (HTTP ${res.status}).`)
    }

    yml = await res.text()
  }

  return parseLatestYmlVersion(yml)
}

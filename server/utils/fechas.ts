/** Día operativo de la bodega (Argentina), independiente del TZ del servidor (p. ej. Railway UTC). */
export const APP_TIMEZONE = 'America/Argentina/Buenos_Aires'

/** Fecha calendario YYYY-MM-DD en zona de la app. */
export function todayIsoDateLocal(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

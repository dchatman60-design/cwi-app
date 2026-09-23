const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function currency(value) {
  return currencyFormatter.format(Number(value) || 0)
}

/** Today's date in the device's time zone, as YYYY-MM-DD. */
export function todayISO() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Parse a YYYY-MM-DD date column as a local date (not UTC midnight). */
export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatShortDate(dateStr) {
  if (!dateStr) return ''
  return parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "14:30:00" → "2:30 PM" */
export function formatTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatDateTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** 35.75 → '35 3/4"' (nearest 1/16"). Non-inch units are shown as decimals. */
export function formatMeasurement(value, unit = 'in') {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (unit !== 'in') return `${trimNumber(n)} ${unit}`

  const sixteenths = Math.round(Math.abs(n) * 16)
  const whole = Math.floor(sixteenths / 16)
  let num = sixteenths % 16
  let den = 16
  while (num && num % 2 === 0) {
    num /= 2
    den /= 2
  }
  const sign = n < 0 ? '-' : ''
  if (!num) return `${sign}${whole}"`
  return whole ? `${sign}${whole} ${num}/${den}"` : `${sign}${num}/${den}"`
}

export function trimNumber(n) {
  return String(Math.round(Number(n) * 1000) / 1000)
}

/** Inches → linear feet, rounded UP to the nearest 0.5 LF (Engagement Guide A.2). */
export function inchesToBillableFeet(inches) {
  return Math.ceil((Number(inches) / 12) * 2) / 2
}

/** A ± value rounded UP to the next 1/16", e.g. 0.2 → '±1/4"'. */
export function formatPlusMinus(plusMinus) {
  const rounded = Math.max(1 / 16, Math.ceil(plusMinus * 16) / 16)
  return `±${formatMeasurement(rounded)}`
}

/**
 * Parse a typed measurement: "36", "36.25", "36 1/4", "36-1/4", "1/2", '36 1/4"'.
 * Returns null for empty input and NaN when it can't be read.
 */
export function parseMeasurementText(text) {
  const t = String(text ?? '')
    .trim()
    .replace(/(["”]|in\.?)$/i, '')
    .trim()
  if (!t) return null
  if (/^\d*\.?\d+$/.test(t)) return Number(t)
  const m = t.match(/^(\d+)?[\s-]*(\d+)\/(\d+)$/)
  if (m && Number(m[3]) > 0) return (Number(m[1]) || 0) + Number(m[2]) / Number(m[3])
  return NaN
}

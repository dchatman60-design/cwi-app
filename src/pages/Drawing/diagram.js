// Builds the Layer 3 technical diagram as SVG from confirmed Layer 1
// measurements. Drawn in code (not by an image model) so every dimension and
// label is exactly what Mike confirmed.

import { formatMeasurement } from '../../lib/format'
import { partLabel, sortByPart } from './measurementParts'

export const DIAGRAM_WIDTH = 1600
export const DIAGRAM_HEIGHT = 1100

const INK = '#0f172a'
const MUTED = '#64748b'
const ACCENT = '#1d4ed8'
const FONT = 'Helvetica, Arial, sans-serif'

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const clip = (s, max) => (s && s.length > max ? `${s.slice(0, max - 1)}…` : s || '')

function text(x, y, content, { size = 22, weight = 400, fill = INK, anchor = 'start', extra = '' } = {}) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ${extra}>${esc(content)}</text>`
}

function balloon(x, y, n) {
  return `<circle cx="${x}" cy="${y}" r="17" fill="#fff" stroke="${ACCENT}" stroke-width="3"/>${text(x, y + 7, n, {
    size: 19,
    weight: 700,
    fill: ACCENT,
    anchor: 'middle',
  })}`
}

export function buildDiagramSvg({ job, measurements, date = new Date() }) {
  const confirmed = sortByPart(measurements.filter((m) => m.value_confirmed !== null && m.value_confirmed !== undefined))
  const find = (parts, pattern) =>
    confirmed.find((m) => parts.includes(m.component) && pattern.test(m.dimension || ''))

  const width = find(['opening', 'head_jam', 'threshold'], /width|length|span|opening/i)
  const height = find(['opening', 'side_jam_left', 'side_jam_right'], /height|length/i)
  const proportional = Boolean(width && height && width.unit === height.unit)
  const ratio = proportional
    ? Math.min(3.2, Math.max(1.2, Number(height.value_confirmed) / Number(width.value_confirmed)))
    : 84 / 36

  // ---- Door elevation geometry (left half of the sheet) ----
  const t = 26 // jamb thickness
  const maxW = 500
  const maxH = 720
  const frameW = Math.min(maxW, maxH / ratio)
  const frameH = frameW * ratio
  const fx = 140 + (maxW - frameW) / 2 + 60
  const fy = 262
  const floorY = fy + frameH + 14

  const parts = []
  parts.push(`<rect x="${fx - t}" y="${fy - t}" width="${frameW + 2 * t}" height="${t}" fill="#e2e8f0" stroke="${INK}" stroke-width="2"/>`)
  parts.push(`<rect x="${fx - t}" y="${fy}" width="${t}" height="${frameH}" fill="#e2e8f0" stroke="${INK}" stroke-width="2"/>`)
  parts.push(`<rect x="${fx + frameW}" y="${fy}" width="${t}" height="${frameH}" fill="#e2e8f0" stroke="${INK}" stroke-width="2"/>`)
  parts.push(`<rect x="${fx + 5}" y="${fy + 5}" width="${frameW - 10}" height="${frameH - 13}" fill="#fff" stroke="${INK}" stroke-width="2"/>`)
  parts.push(
    `<path d="M${fx + 12} ${fy + frameH - 14} V${fy + 12} H${fx + frameW - 12} V${fy + frameH - 14}" fill="none" stroke="${MUTED}" stroke-width="2" stroke-dasharray="10 7"/>`,
  )
  parts.push(`<circle cx="${fx + frameW - 42}" cy="${fy + frameH * 0.52}" r="8" fill="none" stroke="${INK}" stroke-width="2"/>`)
  parts.push(`<line x1="${fx + 10}" y1="${fy + frameH - 10}" x2="${fx + frameW - 10}" y2="${fy + frameH - 10}" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round"/>`)
  parts.push(
    `<polygon points="${fx - t - 12},${floorY} ${fx - t + 6},${fy + frameH} ${fx + frameW + t - 6},${fy + frameH} ${fx + frameW + t + 12},${floorY}" fill="#cbd5e1" stroke="${INK}" stroke-width="2"/>`,
  )
  parts.push(`<line x1="${fx - t - 90}" y1="${floorY}" x2="${fx + frameW + t + 90}" y2="${floorY}" stroke="${INK}" stroke-width="2"/>`)

  // Width dimension (above the head)
  const dimY = fy - t - 45
  parts.push(`<line x1="${fx}" y1="${dimY}" x2="${fx + frameW}" y2="${dimY}" stroke="${INK}" stroke-width="1.5"/>`)
  for (const x of [fx, fx + frameW]) {
    parts.push(`<line x1="${x}" y1="${dimY - 12}" x2="${x}" y2="${fy - t - 6}" stroke="${INK}" stroke-width="1.5"/>`)
    parts.push(`<line x1="${x - 7}" y1="${dimY + 7}" x2="${x + 7}" y2="${dimY - 7}" stroke="${INK}" stroke-width="2.5"/>`)
  }
  parts.push(
    text(fx + frameW / 2, dimY - 12, width ? formatMeasurement(width.value_confirmed, width.unit) : 'Width not measured', {
      size: 26,
      weight: 700,
      anchor: 'middle',
      fill: width ? INK : MUTED,
    }),
  )

  // Height dimension (left of the frame)
  const dimX = fx - t - 55
  parts.push(`<line x1="${dimX}" y1="${fy}" x2="${dimX}" y2="${fy + frameH}" stroke="${INK}" stroke-width="1.5"/>`)
  for (const y of [fy, fy + frameH]) {
    parts.push(`<line x1="${dimX - 12}" y1="${y}" x2="${fx - t - 6}" y2="${y}" stroke="${INK}" stroke-width="1.5"/>`)
    parts.push(`<line x1="${dimX - 7}" y1="${y + 7}" x2="${dimX + 7}" y2="${y - 7}" stroke="${INK}" stroke-width="2.5"/>`)
  }
  const hx = dimX - 14
  const hy = fy + frameH / 2
  parts.push(
    text(hx, hy, height ? formatMeasurement(height.value_confirmed, height.unit) : 'Height not measured', {
      size: 26,
      weight: 700,
      anchor: 'middle',
      fill: height ? INK : MUTED,
      extra: `transform="rotate(-90 ${hx} ${hy})"`,
    }),
  )

  // ---- Numbered callouts: one balloon per measured component ----
  const balloonAt = {
    head_jam: [fx + frameW * 0.72, fy - t / 2],
    side_jam_left: [fx - t / 2, fy + frameH * 0.3],
    side_jam_right: [fx + frameW + t / 2, fy + frameH * 0.3],
    threshold: [fx + frameW * 0.5, fy + frameH + 7],
    doorstop: [fx + 30, fy + frameH * 0.2],
    sweep: [fx + frameW * 0.28, fy + frameH - 10],
  }
  const measuredParts = [...new Set(confirmed.map((m) => m.component))]
  const numberFor = Object.fromEntries(measuredParts.map((p, i) => [p, i + 1]))
  for (const p of measuredParts) {
    if (balloonAt[p]) parts.push(balloon(...balloonAt[p], numberFor[p]))
  }

  // ---- Measurement schedule (right half) ----
  const tx = 900
  const tw = 640
  const rowH = 36
  const maxRows = 20
  let ty = 190
  const table = [
    text(tx, ty, 'MEASUREMENT SCHEDULE', { size: 20, weight: 700, fill: MUTED, extra: 'letter-spacing="2"' }),
  ]
  ty += 22
  table.push(`<rect x="${tx}" y="${ty}" width="${tw}" height="${rowH}" fill="${INK}"/>`)
  table.push(text(tx + 14, ty + 24, '#', { size: 18, weight: 700, fill: '#fff' }))
  table.push(text(tx + 60, ty + 24, 'Component', { size: 18, weight: 700, fill: '#fff' }))
  table.push(text(tx + 300, ty + 24, 'Dimension', { size: 18, weight: 700, fill: '#fff' }))
  table.push(text(tx + tw - 14, ty + 24, 'Value', { size: 18, weight: 700, fill: '#fff', anchor: 'end' }))
  ty += rowH

  confirmed.slice(0, maxRows).forEach((m, i) => {
    if (i % 2) table.push(`<rect x="${tx}" y="${ty}" width="${tw}" height="${rowH}" fill="#f1f5f9"/>`)
    table.push(text(tx + 14, ty + 24, numberFor[m.component], { size: 18, weight: 700, fill: ACCENT }))
    table.push(text(tx + 60, ty + 24, clip(partLabel(m.component), 22), { size: 18 }))
    table.push(text(tx + 300, ty + 24, clip(m.dimension || '—', 22), { size: 18 }))
    table.push(text(tx + tw - 14, ty + 24, formatMeasurement(m.value_confirmed, m.unit), { size: 18, weight: 700, anchor: 'end' }))
    ty += rowH
  })
  if (confirmed.length > maxRows) {
    table.push(text(tx + 14, ty + 24, `+ ${confirmed.length - maxRows} more in the job record`, { size: 17, fill: MUTED }))
    ty += rowH
  }
  table.push(`<rect x="${tx}" y="${212}" width="${tw}" height="${ty - 212}" fill="none" stroke="${INK}" stroke-width="1.5"/>`)

  // ---- Title block & frame ----
  const dateLabel = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const header = [
    `<rect x="20" y="20" width="${DIAGRAM_WIDTH - 40}" height="${DIAGRAM_HEIGHT - 40}" fill="none" stroke="${INK}" stroke-width="3"/>`,
    `<line x1="20" y1="140" x2="${DIAGRAM_WIDTH - 20}" y2="140" stroke="${INK}" stroke-width="2"/>`,
    text(50, 62, 'CUSTOM WEATHERSTRIP, INC.', { size: 20, weight: 700, fill: MUTED, extra: 'letter-spacing="3"' }),
    text(50, 102, clip(`Opening Diagram — ${job.job_name}`, 58), { size: 34, weight: 700 }),
    text(50, 128, clip(job.site_address || '', 80), { size: 20, fill: MUTED }),
    text(DIAGRAM_WIDTH - 50, 62, dateLabel, { size: 20, anchor: 'end' }),
    text(DIAGRAM_WIDTH - 50, 92, 'Costa Mesa, California', { size: 18, fill: MUTED, anchor: 'end' }),
  ]
  const footer = text(
    50,
    DIAGRAM_HEIGHT - 45,
    proportional
      ? 'Drawn in proportion from confirmed field measurements. Not to scale — verify on site before fabrication.'
      : 'Schematic only — opening width and/or height not captured. Values in the schedule are confirmed field measurements.',
    { size: 17, fill: MUTED },
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DIAGRAM_WIDTH}" height="${DIAGRAM_HEIGHT}" viewBox="0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}">
<rect width="100%" height="100%" fill="#fff"/>
${header.join('\n')}
${parts.join('\n')}
${table.join('\n')}
${footer}
</svg>`
}

export function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Render the SVG to a PNG blob (PNG drops cleanly into proposals and POs). */
export async function svgToPngBlob(svg) {
  const img = new Image()
  img.src = svgDataUrl(svg)
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = DIAGRAM_WIDTH
  canvas.height = DIAGRAM_HEIGHT
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, DIAGRAM_WIDTH, DIAGRAM_HEIGHT)
  ctx.drawImage(img, 0, 0, DIAGRAM_WIDTH, DIAGRAM_HEIGHT)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not render the diagram.'))), 'image/png'),
  )
}

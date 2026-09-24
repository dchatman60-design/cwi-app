// Trace & measure: full-screen editor over a Layer 1 photo.
// Step 1 — put 4 blue points on the reference card (known size).
// Step 2 — put 4 red points on the opening's corners, plus optional lines.
// Measurements update live, each with a ± estimate. The photo itself is
// never changed; only the traced values are returned.

import { useEffect, useMemo, useRef, useState } from 'react'
import { PlusIcon, TrashIcon } from '../../components/icons'
import { formatMeasurement, formatPlusMinus } from '../../lib/format'
import { photoToCanvas } from '../../lib/photos'
import { accuracyLevel, calibrate, isConvexQuad, orderQuad, planeLength, withUncertainty } from './homography'
import ReferencePicker from './ReferencePicker'
import { hasSize } from './referenceCards'

const MAX_EDGE = 4096 // keep full phone resolution: more pixels = more precise points
const CARD_IDS = ['c0', 'c1', 'c2', 'c3']
const OPENING_IDS = ['o0', 'o1', 'o2', 'o3']
const COLORS = { card: '#3b82f6', opening: '#ef4444', line: '#22c55e' }
const ZOOMS = [1, 3, 8]
const LOUPE_SIZE = 128
const ACCURACY_TEXT = { good: 'text-green-400', fair: 'text-amber-300', poor: 'text-red-400' }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const colorFor = (id) => (id.startsWith('c') ? COLORS.card : id.startsWith('o') ? COLORS.opening : COLORS.line)

function initialPoints(W, H) {
  // Untouched points count as roughly placed until the user drags them
  const prec = Math.max(W, H) / 250
  const p = (x, y) => ({ x, y, prec })
  const cw = Math.min(W, H) * 0.14
  const ch = (cw * 9.5) / 7
  return {
    c0: p(W / 2 - cw / 2, H / 2 - ch / 2),
    c1: p(W / 2 + cw / 2, H / 2 - ch / 2),
    c2: p(W / 2 + cw / 2, H / 2 + ch / 2),
    c3: p(W / 2 - cw / 2, H / 2 + ch / 2),
    o0: p(W * 0.25, H * 0.1),
    o1: p(W * 0.75, H * 0.1),
    o2: p(W * 0.75, H * 0.9),
    o3: p(W * 0.25, H * 0.9),
  }
}

export default function TraceMeasure({ file, reference, onReferenceChange, onCancel, onDone }) {
  const svgRef = useRef(null)
  const areaRef = useRef(null)
  const loupeRef = useRef(null)
  const dragRef = useRef(null)
  const lineCount = useRef(0)

  const [photo, setPhoto] = useState(null) // { canvas, url, width, height }
  const [loadError, setLoadError] = useState(null)
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [step, setStep] = useState('card') // card | trace
  const [points, setPoints] = useState({})
  const [lines, setLines] = useState([]) // [{ id, name }] — endpoints are `${id}a` / `${id}b`
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState({ x: 0, y: 0 })
  const [active, setActive] = useState(null)
  const [loupe, setLoupe] = useState(null)

  useEffect(() => {
    let cancelled = false
    let url = null
    photoToCanvas(file, MAX_EDGE)
      .then((canvas) => new Promise((resolve) => canvas.toBlob((blob) => resolve({ canvas, blob }), 'image/jpeg', 0.92)))
      .then(({ canvas, blob }) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setPhoto({ canvas, url, width: canvas.width, height: canvas.height })
        setCenter({ x: canvas.width / 2, y: canvas.height / 2 })
        setPoints(initialPoints(canvas.width, canvas.height))
      })
      .catch(() => {
        if (!cancelled) setLoadError("This photo couldn't be opened.")
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [file])

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setArea({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(areaRef.current)
    return () => observer.disconnect()
  }, [])

  // ---- View: zoom + pan through the SVG viewBox (units = image pixels) ----
  const W = photo?.width ?? 1
  const H = photo?.height ?? 1
  const viewW = W / zoom
  const viewH = H / zoom
  const vx = clamp(center.x - viewW / 2, 0, W - viewW)
  const vy = clamp(center.y - viewH / 2, 0, H - viewH)
  const k = area.width ? Math.min(area.width / viewW, area.height / viewH) : 1 // screen px per image px

  // ---- Live measurements ----
  const results = useMemo(() => {
    if (!photo || !points.o0 || !(reference.long > 0 && reference.short > 0)) return null
    const size = { long: reference.long, short: reference.short }
    const calFor = (ps) =>
      calibrate(
        OPENING_IDS.map((id) => ps[id]),
        CARD_IDS.map((id) => ps[id]),
        size,
        photo.width,
        photo.height,
      )
    const cal = calFor(points)
    if (!cal) return { invalid: true }

    const base = [...OPENING_IDS, ...CARD_IDS]
    const side = (key) => (ps) => {
      const c = calFor(ps)
      return c ? Math.sqrt(c[key]) : null
    }
    return {
      cal,
      width: withUncertainty(points, base, side('W2')),
      height: withUncertainty(points, base, side('H2')),
      lines: lines.map((l) => ({
        ...l,
        m: withUncertainty(points, [...base, `${l.id}a`, `${l.id}b`], (ps) => {
          const c = calFor(ps)
          return c ? planeLength(c, ps[`${l.id}a`], ps[`${l.id}b`]) : null
        }),
      })),
    }
  }, [photo, points, lines, reference.long, reference.short])

  const cardQuad = points.c0 ? orderQuad(CARD_IDS.map((id) => ({ ...points[id], id }))) : null
  const cardOk = cardQuad && isConvexQuad(cardQuad)
  const cardEdgePx = cardQuad
    ? Math.max(...cardQuad.map((p, i) => Math.hypot(cardQuad[(i + 1) % 4].x - p.x, cardQuad[(i + 1) % 4].y - p.y)))
    : 0
  const cardTooSmall = cardOk && hasSize(reference) && cardEdgePx / reference.long < 12

  // ---- Loupe: magnified view under the point being dragged ----
  useEffect(() => {
    const canvas = loupeRef.current
    if (!loupe || !photo || !canvas) return
    const dpr = window.devicePixelRatio || 1
    const size = LOUPE_SIZE * dpr
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const mag = Math.max(1, 4 * k) * dpr // canvas px per image px
    const src = size / mag
    const sx = loupe.x - src / 2
    const sy = loupe.y - src / 2
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size, size)
    const x0 = Math.max(0, sx)
    const y0 = Math.max(0, sy)
    const x1 = Math.min(photo.width, sx + src)
    const y1 = Math.min(photo.height, sy + src)
    if (x1 > x0 && y1 > y0) {
      ctx.drawImage(photo.canvas, x0, y0, x1 - x0, y1 - y0, (x0 - sx) * mag, (y0 - sy) * mag, (x1 - x0) * mag, (y1 - y0) * mag)
    }
    ctx.strokeStyle = loupe.color
    ctx.lineWidth = 1.5 * dpr
    ctx.beginPath()
    ctx.moveTo(size / 2, 0)
    ctx.lineTo(size / 2, size)
    ctx.moveTo(0, size / 2)
    ctx.lineTo(size, size / 2)
    ctx.stroke()
  }, [loupe, photo, k])

  // ---- Dragging points and panning ----
  function toImage(e) {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!matrix) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(matrix.inverse())
    return { x: p.x, y: p.y }
  }

  function onPointerDown(e) {
    const id = e.target.closest?.('[data-point]')?.getAttribute('data-point')
    if (id) {
      const p = toImage(e)
      if (!p) return
      // Keep the finger's offset from the point so the point stays visible
      dragRef.current = { kind: 'point', id, dx: points[id].x - p.x, dy: points[id].y - p.y }
      setActive(id)
    } else if (zoom > 1) {
      dragRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, center: { x: vx + viewW / 2, y: vy + viewH / 2 } }
    } else {
      return
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // pointer already released — the drag still works without capture
    }
  }

  function onPointerMove(e) {
    const drag = dragRef.current
    if (!drag) return
    if (drag.kind === 'pan') {
      setCenter({ x: drag.center.x - (e.clientX - drag.x) / k, y: drag.center.y - (e.clientY - drag.y) / k })
      return
    }
    const p = toImage(e)
    if (!p) return
    const x = clamp(p.x + drag.dx, 0, W)
    const y = clamp(p.y + drag.dy, 0, H)
    // Placement precision ≈ 1.5 screen pixels at the current zoom
    setPoints((ps) => ({ ...ps, [drag.id]: { x, y, prec: Math.max(0.5, 1.5 / k) } }))
    const rect = areaRef.current.getBoundingClientRect()
    setLoupe({ x, y, sx: e.clientX - rect.left, sy: e.clientY - rect.top, color: colorFor(drag.id) })
  }

  function endDrag() {
    dragRef.current = null
    setLoupe(null)
  }

  function changeZoom(z) {
    const target = active && points[active] ? points[active] : { x: vx + viewW / 2, y: vy + viewH / 2 }
    setZoom(z)
    setCenter({ x: target.x, y: target.y })
  }

  function goTo(nextStep) {
    setStep(nextStep)
    setZoom(1)
    setActive(null)
  }

  function addLine() {
    lineCount.current += 1
    const id = `l${lineCount.current}`
    const cx = vx + viewW / 2
    const cy = vy + viewH / 2
    const half = viewW * 0.2
    const prec = Math.max(0.5, 1.5 / k) * 4
    setPoints((ps) => ({ ...ps, [`${id}a`]: { x: cx - half, y: cy, prec }, [`${id}b`]: { x: cx + half, y: cy, prec } }))
    setLines((ls) => [...ls, { id, name: `Line ${lineCount.current}` }])
  }

  function removeLine(id) {
    setLines((ls) => ls.filter((l) => l.id !== id))
    setPoints((ps) => {
      const next = { ...ps }
      delete next[`${id}a`]
      delete next[`${id}b`]
      return next
    })
  }

  function finish() {
    const rows = [
      { component: 'opening', dimension: 'width', ...results.width },
      { component: 'opening', dimension: 'height', ...results.height },
      ...results.lines.filter((l) => l.m).map((l) => ({ component: 'site_condition', dimension: l.name, ...l.m })),
    ]
    onDone(rows)
  }

  // ---- Drawing helpers (plain functions, not components) ----
  const quadPath = (ids) =>
    orderQuad(ids.map((id) => points[id]))
      .map((p) => `${p.x},${p.y}`)
      .join(' ')

  const renderHandle = (id) => {
    const p = points[id]
    if (!p) return null
    const color = colorFor(id)
    const r = 13 / k
    const sw = 2.5 / k
    return (
      <g key={id} data-point={id} style={{ cursor: 'grab' }}>
        <circle cx={p.x} cy={p.y} r={26 / k} fill="transparent" />
        <circle cx={p.x} cy={p.y} r={r} fill={active === id ? `${color}55` : 'none'} stroke="#fff" strokeWidth={sw * 1.8} />
        <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={color} strokeWidth={sw} />
        <path
          d={`M ${p.x - r * 0.55} ${p.y} H ${p.x + r * 0.55} M ${p.x} ${p.y - r * 0.55} V ${p.y + r * 0.55}`}
          stroke={color}
          strokeWidth={sw * 0.7}
        />
      </g>
    )
  }

  const renderLabel = (x, y, text) => (
    <text
      x={x}
      y={y}
      fontSize={15 / k}
      fontWeight="700"
      textAnchor="middle"
      dominantBaseline="middle"
      fill="#fff"
      stroke="#000"
      strokeWidth={4 / k}
      paintOrder="stroke"
      style={{ pointerEvents: 'none' }}
    >
      {text}
    </text>
  )

  const valueText = (m) => (m ? `${formatMeasurement(m.value)} ${formatPlusMinus(m.plusMinus)}` : '—')

  const opening = step === 'trace' && points.o0 ? orderQuad(OPENING_IDS.map((id) => points[id])) : null
  // A corner pinned to the photo's edge usually means the opening was cut off
  const atEdge = opening?.some((p) => p.x <= 2 || p.y <= 2 || p.x >= W - 2 || p.y >= H - 2)
  const loupeOnRight = loupe && loupe.sx < area.width / 2 && loupe.sy < area.height / 2
  const valid = results && !results.invalid

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
      <div className="flex shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={step === 'card' ? onCancel : () => goTo('card')}
          className="min-h-12 px-3 font-medium text-slate-300"
        >
          {step === 'card' ? 'Cancel' : 'Back'}
        </button>
        <span className="text-sm font-semibold">
          {step === 'card' ? 'Step 1 of 2 · Reference card' : 'Step 2 of 2 · Opening'}
        </span>
        {step === 'card' ? (
          <button
            type="button"
            onClick={() => goTo('trace')}
            disabled={!cardOk || !hasSize(reference)}
            className="min-h-12 px-3 font-bold text-blue-400 disabled:text-slate-600"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={!valid}
            className="min-h-12 px-3 font-bold text-blue-400 disabled:text-slate-600"
          >
            Done
          </button>
        )}
      </div>

      <div ref={areaRef} className="relative min-h-0 flex-1 overflow-hidden" style={{ touchAction: 'none' }}>
        {loadError && <p className="p-4 text-red-300">{loadError}</p>}
        {!photo && !loadError && <p className="p-4 text-slate-400">Opening photo…</p>}
        {photo && (
          <svg
            ref={svgRef}
            viewBox={`${vx} ${vy} ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <image href={photo.url} width={W} height={H} />

            <polygon
              points={quadPath(CARD_IDS)}
              fill={step === 'card' ? `${COLORS.card}33` : 'none'}
              stroke={COLORS.card}
              strokeWidth={2 / k}
              strokeDasharray={step === 'card' ? undefined : `${6 / k} ${4 / k}`}
            />

            {step === 'trace' && opening && (
              <>
                <polygon points={quadPath(OPENING_IDS)} fill={`${COLORS.opening}1a`} stroke={COLORS.opening} strokeWidth={2.5 / k} />
                {valid &&
                  renderLabel((opening[0].x + opening[1].x) / 2, (opening[0].y + opening[1].y) / 2 - 22 / k, formatMeasurement(results.width.value))}
                {valid &&
                  renderLabel((opening[0].x + opening[3].x) / 2 + 40 / k, (opening[0].y + opening[3].y) / 2, formatMeasurement(results.height.value))}
                {lines.map((l) => {
                  const a = points[`${l.id}a`]
                  const b = points[`${l.id}b`]
                  const m = results?.lines?.find((x) => x.id === l.id)?.m
                  return (
                    <g key={l.id}>
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLORS.line} strokeWidth={2.5 / k} />
                      {m && renderLabel((a.x + b.x) / 2, (a.y + b.y) / 2 - 18 / k, formatMeasurement(m.value))}
                    </g>
                  )
                })}
              </>
            )}

            {step === 'card' ? CARD_IDS.map(renderHandle) : [...OPENING_IDS, ...lines.flatMap((l) => [`${l.id}a`, `${l.id}b`])].map(renderHandle)}
          </svg>
        )}

        {loupe && (
          <canvas
            ref={loupeRef}
            className={`pointer-events-none absolute top-2 rounded-full border-2 border-white shadow-lg ${loupeOnRight ? 'right-2' : 'left-2'}`}
            style={{ width: LOUPE_SIZE, height: LOUPE_SIZE }}
          />
        )}
      </div>

      <div className="max-h-[45%] shrink-0 space-y-3 overflow-y-auto bg-slate-900 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Zoom</span>
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => changeZoom(z)}
              className={`min-h-10 min-w-12 rounded-lg px-3 font-semibold ${zoom === z ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-200'}`}
            >
              {z}×
            </button>
          ))}
          {zoom > 1 && <span className="text-xs text-slate-400">Drag the photo to move around</span>}
        </div>

        {step === 'card' ? (
          <>
            <p className="text-slate-300">
              Drag the 4 <span className="font-semibold text-blue-400">blue points</span> onto the reference card.{' '}
              {reference.hint} Zoom in to place them exactly.
            </p>
            <ReferencePicker value={reference} onChange={onReferenceChange} dark />
            {!cardOk && <p className="text-amber-300">The blue points cross over — drag each to its own corner.</p>}
            {cardTooSmall && (
              <p className="text-amber-300">The card is small in this photo, so results will be rough. Move closer or use a bigger reference.</p>
            )}
          </>
        ) : (
          <>
            <p className="text-slate-300">
              Drag the 4 <span className="font-semibold text-red-400">red points</span> to the corners of the opening. Add a{' '}
              <span className="font-semibold text-green-400">line</span> for anything else on the same flat surface.
            </p>
            {results?.invalid && <p className="text-amber-300">The red points cross over — drag each to its own corner.</p>}
            {atEdge && (
              <p className="text-amber-300">
                A corner is at the edge of the photo. If the opening is cut off, retake the photo from farther back.
              </p>
            )}
            {valid && results.cal.fit > 0.08 && (
              <p className="text-amber-300">
                The blue points don&apos;t match the card&apos;s shape. Go back and check them, or the card type.
              </p>
            )}
            {valid && (
              <dl className="divide-y divide-white/10 rounded-lg bg-white/5">
                {[
                  { key: 'w', label: 'Opening width', m: results.width },
                  { key: 'h', label: 'Opening height', m: results.height },
                  ...results.lines.map((l) => ({ key: l.id, label: l.name, m: l.m, lineId: l.id })),
                ].map((row) => (
                  <div key={row.key} className="flex min-h-11 items-center gap-2 px-3">
                    <dt className="flex-1 text-slate-300">{row.label}</dt>
                    <dd className={`font-semibold ${row.m ? ACCURACY_TEXT[accuracyLevel(row.m.plusMinus, row.m.value)] : ''}`}>{valueText(row.m)}</dd>
                    {row.lineId && (
                      <button
                        type="button"
                        onClick={() => removeLine(row.lineId)}
                        className="flex size-11 items-center justify-center text-slate-400"
                        aria-label={`Remove ${row.label}`}
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
              </dl>
            )}
            <button
              type="button"
              onClick={addLine}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white/10 font-semibold"
            >
              <PlusIcon className="size-5" /> Add a line
            </button>
            <p className="text-xs text-slate-400">
              Green is tight; amber is close — fine for takeoffs and quotes; red means measure it with a tape. For tighter
              numbers, stand closer so the card looks bigger, and zoom in when placing points. The opening is measured as a true
              rectangle, so check the diagonals with a tape if it may be out of square.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// Measuring an opening from a single photo.
//
// Two things in the photo work together:
//   • The opening itself (a door or window) — a large rectangle. Its four
//     corners correct the camera's perspective. Because they're far apart,
//     this is very stable.
//   • A reference card of known size taped flat in the same plane (on the
//     wall or frame). It supplies the real-world scale.
//
// (Using the small card alone to correct perspective is far too sensitive:
// a 1-pixel slip becomes inches of error across a door.)
//
// The opening is treated as a true rectangle, so the method reports one
// width and one height — it can't detect an out-of-square frame.
//
// Points are { x, y, prec } in image pixels; `prec` (~1σ, pixels) is how
// precisely a point was placed and drives the ± estimate.

const UNIT_SQUARE = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

function gaussSolve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    if (Math.abs(M[pivot][col]) < 1e-12) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n]
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c]
    x[r] = sum / M[r][r]
  }
  return x
}

/** Homography from 4 image points to 4 target points (arrays of {x, y}). */
export function solveHomography(src, dst) {
  // Normalize image coordinates for numerical stability
  const cx = src.reduce((s, p) => s + p.x, 0) / 4
  const cy = src.reduce((s, p) => s + p.y, 0) / 4
  const s = src.reduce((sum, p) => sum + Math.hypot(p.x - cx, p.y - cy), 0) / 4 / Math.SQRT2 || 1

  const A = []
  const b = []
  src.forEach((p, i) => {
    const u = (p.x - cx) / s
    const v = (p.y - cy) / s
    const { x, y } = dst[i]
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x])
    b.push(x)
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y])
    b.push(y)
  })
  const h = gaussSolve(A, b)
  return h && { h, cx, cy, s }
}

export function applyHomography(H, p) {
  const u = (p.x - H.cx) / H.s
  const v = (p.y - H.cy) / H.s
  const [a, b, c, d, e, f, g, k] = H.h
  const w = g * u + k * v + 1
  return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w }
}

/** Order 4 points as top-left, top-right, bottom-right, bottom-left. */
export function orderQuad(points) {
  const cx = points.reduce((s, p) => s + p.x, 0) / 4
  const cy = points.reduce((s, p) => s + p.y, 0) / 4
  // With y pointing down, ascending angle runs clockwise on screen
  const sorted = [...points].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx))
  let start = 0
  sorted.forEach((p, i) => {
    if (p.x + p.y < sorted[start].x + sorted[start].y) start = i
  })
  return [...sorted.slice(start), ...sorted.slice(0, start)]
}

export function isConvexQuad(q) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const c = q[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-9) return false
    if (sign && Math.sign(cross) !== sign) return false
    sign = Math.sign(cross)
  }
  return true
}

const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

// A phone's standard (1×) camera is ~26 mm equivalent: focal length ≈ 0.78 ×
// the photo's long side, in pixels.
const PHONE_FOCAL_RATIO = 0.78

/**
 * True width ÷ height of a rectangle seen in perspective, from its ordered
 * corners (Zhang & He, "Whiteboard scanning"), using the typical phone
 * focal length rather than estimating it — the estimate is unstable when
 * edges look nearly parallel. Only used to tell which way a card is turned,
 * so it needn't be exact.
 */
export function rectangleAspect(quad, imageWidth, imageHeight) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const apparent = (d(quad[0], quad[1]) + d(quad[3], quad[2])) / (d(quad[0], quad[3]) + d(quad[1], quad[2]))
  if (!imageWidth || !imageHeight) return apparent

  const u0 = imageWidth / 2
  const v0 = imageHeight / 2
  const f2 = (PHONE_FOCAL_RATIO * Math.max(imageWidth, imageHeight)) ** 2
  // Paper's corner order: m1 top-left, m2 top-right, m3 bottom-left, m4 bottom-right
  const [m1, m2, m4, m3] = quad.map((p) => [p.x, p.y, 1])
  const k2 = dot3(cross3(m1, m4), m3) / dot3(cross3(m2, m4), m3)
  const k3 = dot3(cross3(m1, m4), m2) / dot3(cross3(m3, m4), m2)
  const n2 = m2.map((v, i) => k2 * v - m1[i])
  const n3 = m3.map((v, i) => k3 * v - m1[i])

  const norm = (n) => ((n[0] - u0 * n[2]) ** 2 + (n[1] - v0 * n[2]) ** 2) / f2 + n[2] ** 2
  const aspect = Math.sqrt(norm(n2) / norm(n3))
  return Number.isFinite(aspect) && aspect > 0 ? aspect : apparent
}

/**
 * Calibrate the plane. `opening` and `card` are 4 image points each (any
 * order); `cardSize` is { long, short } in inches; the image size lets a
 * non-square card's orientation be worked out. Returns null when the points
 * don't form usable shapes.
 *
 * The opening's corners map to a unit square; in real inches that square is
 * W × H. For any vector (dx, dy) in unit-square coordinates the real length
 * is √(W²·dx² + H²·dy²). The card's known edges and diagonals give W² and H²
 * by least squares.
 */
export function calibrate(opening, card, cardSize, imageWidth, imageHeight) {
  if (!(cardSize?.long > 0 && cardSize?.short > 0)) return null
  const door = orderQuad(opening)
  const cardQuad = orderQuad(card)
  if (!isConvexQuad(door) || !isConvexQuad(cardQuad)) return null

  const H = solveHomography(door, UNIT_SQUARE)
  if (!H) return null
  const c = cardQuad.map((p) => applyHomography(H, p))
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [0, 2],
    [1, 3],
  ]

  // A non-square card lined up with the opening fits either way round
  // equally well, so pick the way that agrees with the opening's true
  // proportions as seen by the camera.
  const doorAspect = rectangleAspect(door, imageWidth, imageHeight)
  const orientations =
    cardSize.long === cardSize.short
      ? [[cardSize.long, cardSize.short]]
      : [
          [cardSize.long, cardSize.short],
          [cardSize.short, cardSize.long],
        ]

  let best = null
  for (const [a, b] of orientations) {
    const diag = Math.hypot(a, b)
    const lengths = [a, b, a, b, diag, diag]
    // Normal equations for rows [dx²/L², dy²/L²]·[W², H²] = 1
    let s11 = 0
    let s12 = 0
    let s22 = 0
    let r1 = 0
    let r2 = 0
    const rows = edges.map(([i, j], e) => {
      const dx = c[j].x - c[i].x
      const dy = c[j].y - c[i].y
      const L2 = lengths[e] ** 2
      return [(dx * dx) / L2, (dy * dy) / L2]
    })
    for (const [p, q] of rows) {
      s11 += p * p
      s12 += p * q
      s22 += q * q
      r1 += p
      r2 += q
    }
    const det = s11 * s22 - s12 * s12
    if (Math.abs(det) < 1e-18) continue
    const W2 = (r1 * s22 - r2 * s12) / det
    const H2 = (r2 * s11 - r1 * s12) / det
    if (!(W2 > 0 && H2 > 0)) continue
    const residual = rows.reduce((sum, [p, q]) => sum + (p * W2 + q * H2 - 1) ** 2, 0)
    const aspectMiss = Math.abs(Math.log(Math.sqrt(W2 / H2) / doorAspect))
    if (!best || aspectMiss < best.aspectMiss) best = { W2, H2, residual, aspectMiss }
  }
  if (!best) return null

  const cardEdgePx = Math.max(
    ...[0, 1, 2, 3].map((i) => Math.hypot(cardQuad[(i + 1) % 4].x - cardQuad[i].x, cardQuad[(i + 1) % 4].y - cardQuad[i].y)),
  )
  return {
    H,
    W2: best.W2,
    H2: best.H2,
    door,
    fit: Math.sqrt(best.residual / 6), // how well the card matches its known shape (0 = perfect)
    cardPxPerInch: cardEdgePx / cardSize.long,
  }
}

/** Real length in inches between two image points on the plane. */
export function planeLength(cal, a, b) {
  const A = applyHomography(cal.H, a)
  const B = applyHomography(cal.H, b)
  return Math.sqrt(cal.W2 * (B.x - A.x) ** 2 + cal.H2 * (B.y - A.y) ** 2)
}

/**
 * How trustworthy a traced value is, from its ± relative to its size:
 * good ≤ 1.5% (or ¼″), fair ≤ 4% (or ¾″) — fine for takeoffs and quotes —
 * poor beyond that (measure with a tape).
 */
export function accuracyLevel(plusMinus, value) {
  const size = Math.abs(value) || 0
  if (plusMinus <= Math.max(0.25, size * 0.015)) return 'good'
  if (plusMinus <= Math.max(0.75, size * 0.04)) return 'fair'
  return 'poor'
}

/**
 * Evaluate compute(points) and a ± estimate (~95%) by nudging each point in
 * `ids` by its placement precision. `points` maps id → { x, y, prec }.
 */
export function withUncertainty(points, ids, compute) {
  const value = compute(points)
  if (value === null || !Number.isFinite(value)) return null
  let sumSq = 0
  for (const id of ids) {
    const p = points[id]
    const prec = Math.max(0.5, p.prec ?? 2)
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      const moved = compute({ ...points, [id]: { ...p, x: p.x + dx * prec, y: p.y + dy * prec } })
      if (moved !== null && Number.isFinite(moved)) sumSq += (moved - value) ** 2
    }
  }
  return { value, plusMinus: 2 * Math.sqrt(sumSq) }
}

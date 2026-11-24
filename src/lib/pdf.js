// Build a PDF of a page element in the browser — for the iPhone home-screen app,
// where window.print() does nothing. Libraries load from a CDN on first use.

const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
// html2canvas-pro understands the oklch() colors Tailwind v4 uses; the original
// html2canvas is the fallback (colors are converted to rgb for it below).
const H2C_URLS = [
  'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.8/dist/html2canvas-pro.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
]

/** True in the iPhone/iPad home-screen app, where printing isn't available. */
export function printUnsupported() {
  return typeof navigator !== 'undefined' && navigator.standalone === true
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.dataset.src = src
    s.onload = () => resolve()
    s.onerror = () => {
      s.remove()
      reject(new Error(`Couldn't load ${src}`))
    }
    document.head.appendChild(s)
  })
}

async function libs() {
  if (!window.jspdf) await loadScript(JSPDF_URL)
  let h2c = window.html2canvas
  for (const url of H2C_URLS) {
    if (h2c) break
    try {
      await loadScript(url)
      h2c = window.html2canvas || window.html2canvasPro
    } catch {
      // try the next one
    }
  }
  if (!window.jspdf?.jsPDF || !h2c) throw new Error("Couldn't load the PDF tools. Check your connection and try again.")
  return { jsPDF: window.jspdf.jsPDF, html2canvas: h2c }
}

// Any CSS color → rgba() via a 1×1 canvas (works for oklch in every browser)
const colorCache = new Map()
let probe
function toRgb(color) {
  if (!color || color === 'transparent' || color.startsWith('rgb')) return color
  if (colorCache.has(color)) return colorCache.get(color)
  probe ||= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = '#000'
  probe.fillStyle = color
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  const out = `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`
  colorCache.set(color, out)
  return out
}

const COLOR_PROPS = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
]

/**
 * Render `el` to a letter-size PDF Blob. The page is laid out `width` CSS px
 * wide (like a printed page) and broken between rows, paragraphs and sections.
 */
export async function elementToPdf(el, { width = 760 } = {}) {
  const { jsPDF, html2canvas } = await libs()
  const breaks = []
  let totalHeight = 0

  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    windowWidth: width + 40,
    useCORS: true,
    logging: false,
    onclone: (doc, clone) => {
      // Laid out like paper: fixed width, no card chrome, nothing marked print:hidden
      clone.style.width = `${width}px`
      clone.style.maxWidth = 'none'
      clone.style.border = '0'
      clone.style.borderRadius = '0'
      clone.style.boxShadow = 'none'
      clone.querySelectorAll('[class*="print:hidden"]').forEach((n) => n.remove())
      const view = doc.defaultView
      for (const node of [clone, ...clone.querySelectorAll('*')]) {
        const cs = view.getComputedStyle(node)
        for (const prop of COLOR_PROPS) {
          const v = cs.getPropertyValue(prop)
          if (v && /oklch|oklab|lab\(|lch\(|color\(/.test(v)) node.style.setProperty(prop, toRgb(v))
        }
        if (cs.boxShadow && cs.boxShadow !== 'none') node.style.boxShadow = 'none'
      }
      // Where a page may end: the bottom of a section, row, paragraph or list item
      const top = clone.getBoundingClientRect().top
      clone.querySelectorAll('section, header, tr, li, p, h2, h3, table, [class*="break-inside-avoid"]').forEach((n) => {
        const r = n.getBoundingClientRect()
        breaks.push(r.bottom - top)
      })
      totalHeight = clone.getBoundingClientRect().height
    },
  })

  const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' })
  const margin = 0.5
  const contentW = 8.5 - margin * 2
  const contentH = 11 - margin * 2
  const pxPerIn = width / contentW
  const pageH = contentH * pxPerIn // CSS px per page
  const scale = canvas.width / width
  const total = totalHeight || canvas.height / scale
  const cuts = [...new Set(breaks.map((b) => Math.round(b)))].sort((a, b) => a - b)

  let start = 0
  let first = true
  while (start < total - 1) {
    let end = start + pageH
    if (end < total) {
      // Last clean break on this page, as long as it fills at least half of it
      const clean = cuts.filter((c) => c > start + pageH * 0.5 && c <= end).pop()
      if (clean) end = clean
    } else end = total
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = Math.ceil((end - start) * scale)
    const ctx = slice.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(canvas, 0, Math.floor(start * scale), canvas.width, slice.height, 0, 0, canvas.width, slice.height)
    if (!first) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, contentW, (end - start) / pxPerIn)
    first = false
    start = end
  }
  return pdf.output('blob')
}

/** Hand a finished PDF to the share sheet (Save to Files, Mail, Print…), or download it. */
export async function sharePdf(blob, filename) {
  const file = new File([blob], filename, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (err) {
      if (err?.name === 'AbortError') return // closed the sheet
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

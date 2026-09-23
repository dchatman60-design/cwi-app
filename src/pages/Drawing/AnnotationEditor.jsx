import { useEffect, useRef, useState } from 'react'
import { Arrow, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva'
import { ArrowIcon, PenIcon, RectIcon, TextIcon, UndoIcon } from '../../components/icons'
import { uploadLayerFile } from '../../lib/supabase'

const TOOLS = [
  { id: 'pen', label: 'Draw', Icon: PenIcon },
  { id: 'arrow', label: 'Arrow', Icon: ArrowIcon },
  { id: 'rect', label: 'Box', Icon: RectIcon },
  { id: 'text', label: 'Text', Icon: TextIcon },
]
const COLORS = ['#dc2626', '#facc15', '#ffffff', '#111827'] // red is the default
const LIGHT_COLORS = ['#facc15', '#ffffff']
const MAX_EXPORT_EDGE = 3000

// Shapes are stored in image pixel coordinates, so the saved image keeps the
// photo's resolution regardless of screen size.
function renderShape(shape, index, strokeWidth, fontSize) {
  switch (shape.type) {
    case 'pen':
      return (
        <Line
          key={index}
          points={shape.points}
          stroke={shape.color}
          strokeWidth={strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={0.4}
        />
      )
    case 'arrow':
      return (
        <Arrow
          key={index}
          points={shape.points}
          stroke={shape.color}
          fill={shape.color}
          strokeWidth={strokeWidth}
          pointerLength={strokeWidth * 4}
          pointerWidth={strokeWidth * 4}
          lineCap="round"
        />
      )
    case 'rect':
      return (
        <Rect
          key={index}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          stroke={shape.color}
          strokeWidth={strokeWidth}
        />
      )
    case 'text':
      return (
        <Text
          key={index}
          x={shape.x}
          y={shape.y}
          text={shape.text}
          fontSize={fontSize}
          fontStyle="bold"
          fill={shape.color}
          stroke={LIGHT_COLORS.includes(shape.color) ? '#111827' : '#ffffff'}
          strokeWidth={fontSize / 10}
          fillAfterStrokeEnabled
        />
      )
    default:
      return null
  }
}

export default function AnnotationEditor({ file, jobId, onClose, onSaved }) {
  const stageRef = useRef(null)
  const areaRef = useRef(null)
  const [image, setImage] = useState(null)
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState(COLORS[0])
  const [shapes, setShapes] = useState([])
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => setImage(img)
    img.onerror = () => setError("This photo couldn't be opened.")
    img.src = url
    return () => {
      img.onload = null
      img.onerror = null
      URL.revokeObjectURL(url)
    }
  }, [file])

  useEffect(() => {
    const el = areaRef.current
    const observer = new ResizeObserver(([entry]) => {
      setArea({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const scale = image && area.width ? Math.min(area.width / image.naturalWidth, area.height / image.naturalHeight) : 0
  const longEdge = image ? Math.max(image.naturalWidth, image.naturalHeight) : 0
  const strokeWidth = Math.max(4, Math.round(longEdge / 250))
  const fontSize = Math.max(28, Math.round(longEdge / 28))

  function pointerInImage() {
    const p = stageRef.current.getPointerPosition()
    return { x: p.x / scale, y: p.y / scale }
  }

  function handleDown() {
    const { x, y } = pointerInImage()
    if (tool === 'text') {
      const text = window.prompt('Label text')
      if (text?.trim()) setShapes((list) => [...list, { type: 'text', x, y, text: text.trim(), color }])
      return
    }
    setDraft(
      tool === 'rect'
        ? { type: 'rect', color, x, y, width: 0, height: 0 }
        : { type: tool, color, points: [x, y, x, y] },
    )
  }

  function handleMove() {
    if (!draft) return
    const { x, y } = pointerInImage()
    setDraft((d) => {
      if (!d) return d
      if (d.type === 'pen') return { ...d, points: [...d.points, x, y] }
      if (d.type === 'arrow') return { ...d, points: [d.points[0], d.points[1], x, y] }
      return { ...d, width: x - d.x, height: y - d.y }
    })
  }

  function handleUp() {
    if (!draft) return
    const minSize = strokeWidth * 2
    const keep =
      draft.type === 'rect'
        ? Math.abs(draft.width) > minSize && Math.abs(draft.height) > minSize
        : draft.type === 'arrow'
          ? Math.hypot(draft.points[2] - draft.points[0], draft.points[3] - draft.points[1]) > minSize
          : true
    if (keep) setShapes((list) => [...list, draft])
    setDraft(null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const exportScale = Math.min(1, MAX_EXPORT_EDGE / longEdge)
      const blob = await stageRef.current.toBlob({
        mimeType: 'image/jpeg',
        quality: 0.9,
        pixelRatio: exportScale / scale,
      })
      const row = await uploadLayerFile(2, jobId, blob, 'jpg')
      onSaved(row)
    } catch (err) {
      setError(err.message || 'Could not save the photo.')
      setSaving(false)
    }
  }

  const toolButton = (active) =>
    `flex min-h-12 flex-1 flex-col items-center justify-center rounded-lg text-xs font-medium ${
      active ? 'bg-white text-slate-900' : 'text-slate-300 active:bg-white/10'
    }`

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
      <div className="flex shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onClose} className="min-h-12 px-3 font-medium text-slate-300" disabled={saving}>
          Cancel
        </button>
        <span className="font-semibold">Annotate photo</span>
        <button
          type="button"
          onClick={save}
          disabled={!image || saving}
          className="min-h-12 px-3 font-bold text-red-400 disabled:text-slate-600"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && <div className="bg-red-700 px-4 py-2 text-sm">{error}</div>}

      <div ref={areaRef} className="flex min-h-0 flex-1 items-center justify-center" style={{ touchAction: 'none' }}>
        {image && scale > 0 && (
          <Stage
            ref={stageRef}
            width={image.naturalWidth * scale}
            height={image.naturalHeight * scale}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerLeave={handleUp}
          >
            <Layer scaleX={scale} scaleY={scale}>
              <KonvaImage image={image} width={image.naturalWidth} height={image.naturalHeight} />
              {shapes.map((s, i) => renderShape(s, i, strokeWidth, fontSize))}
              {draft && renderShape(draft, 'draft', strokeWidth, fontSize)}
            </Layer>
          </Stage>
        )}
      </div>

      <div className="shrink-0 space-y-2 bg-slate-900 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-1">
          {TOOLS.map(({ id, label, Icon }) => (
            <button key={id} type="button" className={toolButton(tool === id)} onClick={() => setTool(id)}>
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`size-11 rounded-full border-4 ${color === c ? 'border-blue-400' : 'border-slate-700'}`}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
          <div className="flex-1" />
          <button
            type="button"
            className="flex min-h-11 items-center gap-1 px-3 text-sm font-medium text-slate-300 disabled:text-slate-600"
            onClick={() => setShapes((list) => list.slice(0, -1))}
            disabled={!shapes.length}
          >
            <UndoIcon className="size-5" /> Undo
          </button>
          <button
            type="button"
            className="min-h-11 px-3 text-sm font-medium text-slate-300 disabled:text-slate-600"
            onClick={() => window.confirm('Remove all markup?') && setShapes([])}
            disabled={!shapes.length}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}

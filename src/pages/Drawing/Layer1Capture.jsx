// LAYER 1 — CV Measurement Capture (foundation).
// Raw photos go, unmodified, to the measurement-photos bucket. Values come
// from tracing the photo against a reference card (default) or from
// GPT-4o Vision; Mike confirms or corrects every value before it's saved.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertIcon, CameraIcon, PlusIcon, TrashIcon } from '../../components/icons'
import SignedImage from '../../components/SignedImage'
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, inputClass, Segmented, Spinner } from '../../components/ui'
import { formatMeasurement, formatPlusMinus, trimNumber } from '../../lib/format'
import { extractMeasurements } from '../../lib/openai'
import { supabase, uploadLayerFile } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { useOnlineStatus } from '../../lib/useOnlineStatus'
import { must, useQuery } from '../../lib/useQuery'
import { accuracyLevel } from './homography'
import { MEASUREMENT_PARTS, partLabel, sortByPart } from './measurementParts'
import ReferencePicker from './ReferencePicker'
import { describeReference, loadReference, resolveReference, saveReference } from './referenceCards'
import TraceMeasure from './TraceMeasure'

const LOW_CONFIDENCE = 0.7
const UNITS = ['in', 'ft', 'mm', 'cm']
const METHOD_KEY = 'cwi:capture-method'
const METHODS = [
  { value: 'trace', label: 'Trace with card' },
  { value: 'ai', label: 'AI read' },
]

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp' }
const extensionFor = (file) => EXTENSIONS[file.type] || file.name.split('.').pop()?.toLowerCase() || 'jpg'
const roundTo16th = (inches) => Math.round(inches * 16) / 16

function loadMethod() {
  try {
    return localStorage.getItem(METHOD_KEY) === 'ai' ? 'ai' : 'trace'
  } catch {
    return 'trace'
  }
}

let rowCounter = 0
const newRow = (fields = {}) => ({
  key: ++rowCounter,
  component: 'site_condition',
  dimension: '',
  extracted: null,
  confirmed: '',
  unit: 'in',
  confidence: null,
  plusMinus: null,
  source: 'manual', // manual | ai | trace
  include: true,
  ...fields,
})

function RowInfo({ row, onRemove }) {
  if (row.source === 'ai') {
    const low = row.confidence < LOW_CONFIDENCE
    return (
      <div className={`flex items-center gap-1.5 text-sm ${low ? 'font-medium text-amber-900' : 'text-slate-500'}`}>
        {low && <AlertIcon className="size-5 shrink-0" />}
        AI read {formatMeasurement(row.extracted, row.unit)} · {Math.round(row.confidence * 100)}% confident
        {low && ' — please verify'}
      </div>
    )
  }
  if (row.source === 'trace') {
    const level = accuracyLevel(row.plusMinus, row.extracted)
    const tone = { good: 'text-green-700', fair: 'text-amber-800', poor: 'font-medium text-red-700' }[level]
    return (
      <div className={`flex items-center gap-1.5 text-sm ${tone}`}>
        {level === 'poor' && <AlertIcon className="size-5 shrink-0" />}
        Traced {formatMeasurement(row.extracted)} · {formatPlusMinus(row.plusMinus)}
        {level === 'poor' && ' — check with a tape'}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between text-sm text-slate-500">
      Entered manually
      <button type="button" className="flex size-11 items-center justify-center text-slate-500" onClick={onRemove} aria-label="Remove">
        <TrashIcon className="size-5" />
      </button>
    </div>
  )
}

function CaptureSession({ jobId, onDone, onCancel }) {
  const [method, setMethod] = useState(loadMethod)
  const [reference, setReference] = useState(loadReference)
  const [part, setPart] = useState('head_jam')
  const [stage, setStage] = useState('choose') // choose | analyzing | tracing | review
  const [photoFile, setPhotoFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [photoPath, setPhotoPath] = useState(null)
  const [rows, setRows] = useState([])
  const [aiNotes, setAiNotes] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const uploadRef = useRef(null)
  const tracingFrom = useRef('choose')

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl])

  // Tracing needs a sized reference; "No card" only applies to AI reads
  const traceReference = reference.long && reference.short ? reference : resolveReference({ id: 'cwi' })

  function changeMethod(value) {
    setMethod(value)
    try {
      localStorage.setItem(METHOD_KEY, value)
    } catch {
      // not remembered — fine
    }
  }

  function changeReference(ref) {
    setReference(ref)
    saveReference(ref)
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setPhotoFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setPhotoPath(null)
    setError(null)
    setAiNotes('')
    setRows([])

    // The raw photo is saved as-is while Mike traces or the AI reads it
    const upload = uploadLayerFile(1, jobId, file, extensionFor(file))
    uploadRef.current = upload
    upload.then((row) => setPhotoPath(row.storage_path)).catch(() => {})

    if (method === 'trace') {
      tracingFrom.current = 'choose'
      setStage('tracing')
      return
    }

    setStage('analyzing')
    const [uploaded, extraction] = await Promise.allSettled([
      upload,
      extractMeasurements(file, partLabel(part), describeReference(reference)),
    ])

    if (uploaded.status === 'rejected') {
      setError(`The photo couldn't be saved: ${uploaded.reason.message}. Check your connection and try again.`)
      setStage('choose')
      return
    }

    let extracted = []
    if (extraction.status === 'fulfilled') {
      setAiNotes(extraction.value.notes || '')
      extracted = extraction.value.measurements.map((m) =>
        newRow({
          component: part,
          dimension: m.dimension,
          extracted: m.value,
          confirmed: trimNumber(m.value),
          unit: UNITS.includes(m.unit) ? m.unit : 'in',
          confidence: m.confidence,
          source: 'ai',
        }),
      )
      if (!extracted.length) setError('No measurements could be read from this photo. Trace it, enter values below, or retake it.')
    } else {
      setError(`Couldn't read measurements automatically (${extraction.reason.message}). Trace the photo or enter values below.`)
    }
    setRows(extracted.length ? extracted : [newRow({ component: part })])
    setStage('review')
  }

  async function finishTracing(traced) {
    try {
      await uploadRef.current
    } catch (err) {
      setError(`The photo couldn't be saved: ${err.message}. Check your connection and retake it.`)
      setStage('choose')
      return
    }
    const tracedRows = traced.map((t) =>
      newRow({
        component: t.component,
        dimension: t.dimension,
        extracted: Math.round(t.value * 1000) / 1000,
        confirmed: trimNumber(roundTo16th(t.value)),
        plusMinus: t.plusMinus,
        source: 'trace',
      }),
    )
    // Replace earlier traced values and blank manual rows; keep AI reads
    setRows((list) => [
      ...list.filter((r) => r.source === 'ai' || (r.source === 'manual' && (r.dimension || r.confirmed !== ''))),
      ...tracedRows,
    ])
    setStage('review')
  }

  const updateRow = (key, patch) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function save() {
    const toSave = rows.filter(
      (r) => r.include && r.dimension.trim() && r.confirmed !== '' && Number.isFinite(Number(r.confirmed)),
    )
    if (!toSave.length) return setError('Enter at least one measurement with a name and a number.')

    setSaving(true)
    setError(null)
    try {
      must(
        await supabase.from('measurements').insert(
          toSave.map((r) => ({
            job_id: jobId,
            component: r.component,
            dimension: r.dimension.trim(),
            value_extracted: r.extracted,
            value_confirmed: Number(r.confirmed),
            unit: r.unit,
            cv_confidence: r.confidence,
            photo_url: photoPath,
            confirmed_by_mike: true,
          })),
        ),
      )
      toast(`Saved ${toSave.length} measurement${toSave.length === 1 ? '' : 's'}`)
      onDone()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  const cameraInput = (
    <input id="layer1-camera" type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFile} />
  )

  if (stage === 'tracing') {
    return (
      <TraceMeasure
        file={photoFile}
        reference={traceReference}
        onReferenceChange={changeReference}
        onCancel={() => setStage(tracingFrom.current)}
        onDone={finishTracing}
      />
    )
  }

  if (stage === 'choose') {
    return (
      <div className="space-y-4">
        <Segmented options={METHODS} value={method} onChange={changeMethod} />

        {method === 'trace' ? (
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              Tape a <strong>CWI measurement card</strong> (or a sheet of letter paper) flat on the wall or frame, right next to the
              opening. Then take <strong>one photo</strong> that shows the whole opening and the whole card.
            </p>
            <p>You&apos;ll mark the card, then trace the opening — widths and heights are worked out for you.</p>
            <Link to="/measure-card" className="inline-block min-h-11 py-2 font-semibold text-blue-700">
              Print a CWI measurement card →
            </Link>
          </div>
        ) : (
          <>
            <Field label="What are you photographing?">
              <select className={inputClass} value={part} onChange={(e) => setPart(e.target.value)}>
                {MEASUREMENT_PARTS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">Reference card in the photo</span>
              <ReferencePicker value={reference} onChange={changeReference} allowNone />
            </div>
            <p className="text-sm text-slate-500">A tape measure or reference card in the shot makes the AI much more accurate.</p>
          </>
        )}

        {cameraInput}
        <label
          htmlFor="layer1-camera"
          className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl bg-blue-700 text-lg font-bold text-white active:bg-blue-800"
        >
          <CameraIcon className="size-12" />
          Take measurement photo
        </label>
        <ErrorMessage error={error} />
        <Button variant="secondary" className="w-full" onClick={onCancel}>
          Done capturing
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {previewUrl && <img src={previewUrl} alt="" className="size-24 shrink-0 rounded-lg object-cover" />}
        <div className="min-w-0">
          <div className="text-sm text-slate-500">Layer 1 · measurement photo</div>
          <div className="text-lg font-semibold">Review measurements</div>
          {stage === 'analyzing' && (
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700" />
              Saving photo & reading measurements…
            </div>
          )}
        </div>
      </div>

      {stage === 'review' && (
        <>
          <ErrorMessage error={error} />
          {aiNotes && (
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              <span className="font-semibold">AI notes: </span>
              {aiNotes}
            </div>
          )}
          <p className="text-sm text-slate-600">Check each value and what it belongs to. Correct anything that looks wrong.</p>

          {rows.map((row) => {
            const flagged =
              (row.source === 'ai' && row.confidence < LOW_CONFIDENCE) ||
              (row.source === 'trace' && accuracyLevel(row.plusMinus, row.extracted) === 'poor')
            return (
              <Card key={row.key} className={`space-y-3 p-3 ${flagged ? 'border-amber-400 bg-amber-50' : ''}`}>
                <div className="flex items-center gap-2">
                  <select
                    className={`${inputClass} flex-1`}
                    value={row.component}
                    onChange={(e) => updateRow(row.key, { component: e.target.value })}
                    aria-label="Component"
                  >
                    {MEASUREMENT_PARTS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex min-h-11 items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="size-5 accent-blue-700"
                      checked={row.include}
                      onChange={(e) => updateRow(row.key, { include: e.target.checked })}
                    />
                    Save
                  </label>
                </div>
                <input
                  className={inputClass}
                  placeholder="Dimension (e.g. width)"
                  value={row.dimension}
                  onChange={(e) => updateRow(row.key, { dimension: e.target.value })}
                  aria-label="Dimension"
                />
                <div className="flex gap-2">
                  <input
                    className={`${inputClass} flex-1 text-lg font-semibold`}
                    inputMode="decimal"
                    placeholder="Value"
                    value={row.confirmed}
                    onChange={(e) => updateRow(row.key, { confirmed: e.target.value })}
                    aria-label="Confirmed value"
                  />
                  <select
                    className={`${inputClass} w-24`}
                    value={row.unit}
                    onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                    aria-label="Unit"
                  >
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <RowInfo row={row} onRemove={() => setRows((list) => list.filter((r) => r.key !== row.key))} />
              </Card>
            )
          })}

          <div className="grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={() => setRows((list) => [...list, newRow()])}>
              <PlusIcon className="size-5" /> Add value
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                tracingFrom.current = 'review'
                setStage('tracing')
              }}
            >
              {rows.some((r) => r.source === 'trace') ? 'Re-trace photo' : 'Trace this photo'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {cameraInput}
            <label
              htmlFor="layer1-camera"
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-800 active:bg-slate-100"
            >
              Retake photo
            </label>
            <Button onClick={save} disabled={saving || !photoPath}>
              {saving ? 'Saving…' : photoPath ? 'Confirm & save' : 'Saving photo…'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export default function Layer1Capture({ jobId }) {
  const online = useOnlineStatus()
  const [capturing, setCapturing] = useState(false)
  const [sessionKey, setSessionKey] = useState(0)

  const { data: measurements, error, loading, reload } = useQuery(`measurements:${jobId}`, async () =>
    must(await supabase.from('measurements').select('*').eq('job_id', jobId).order('created_at')),
  )
  const { data: photos, reload: reloadPhotos } = useQuery(`layer1-photos:${jobId}`, async () =>
    must(
      await supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', jobId)
        .eq('layer', 1)
        .order('created_at', { ascending: false }),
    ),
  )

  async function editValue(m) {
    const next = window.prompt(`${partLabel(m.component)} — ${m.dimension || 'value'} (${m.unit})`, trimNumber(m.value_confirmed))
    if (next === null) return
    const value = Number(next)
    if (!Number.isFinite(value)) return toast('Enter a number', 'error')
    const { error: updateError } = await supabase
      .from('measurements')
      .update({ value_confirmed: value, confirmed_by_mike: true })
      .eq('id', m.id)
    if (updateError) return toast(updateError.message, 'error')
    reload()
  }

  async function remove(m) {
    if (!window.confirm(`Delete ${partLabel(m.component)} — ${m.dimension}?`)) return
    const { error: deleteError } = await supabase.from('measurements').delete().eq('id', m.id)
    if (deleteError) return toast(deleteError.message, 'error')
    reload()
  }

  if (capturing) {
    return (
      <CaptureSession
        key={sessionKey}
        jobId={jobId}
        onCancel={() => setCapturing(false)}
        onDone={() => {
          reload()
          reloadPhotos()
          setSessionKey((k) => k + 1) // fresh session for the next photo
        }}
      />
    )
  }

  const sorted = sortByPart(measurements || [])

  return (
    <div className="space-y-4">
      <Button className="min-h-20 w-full rounded-2xl text-lg" disabled={!online} onClick={() => setCapturing(true)}>
        <CameraIcon className="size-8" />
        Start Measurement Capture
      </Button>
      {!online && <p className="text-center text-sm text-amber-800">Measurement capture needs an internet connection.</p>}

      <ErrorMessage error={error} />
      {loading && !measurements && <Spinner />}
      {measurements && measurements.length === 0 && (
        <EmptyState title="No measurements yet">
          Photograph the opening with a measurement card beside it, then trace it.
        </EmptyState>
      )}

      {sorted.length > 0 && (
        <Card className="divide-y divide-slate-100">
          {sorted.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-1 pr-1 pl-4">
              <div className="min-w-0 flex-1 py-2">
                <div className="text-sm text-slate-500">{partLabel(m.component)}</div>
                <div className="font-medium break-words">
                  {m.dimension || 'Measurement'}:{' '}
                  <span className="font-bold">{formatMeasurement(m.value_confirmed, m.unit)}</span>
                </div>
                {m.value_extracted !== null && Math.abs(m.value_extracted - m.value_confirmed) > 1 / 32 && (
                  <div className="text-xs text-slate-500">
                    {m.cv_confidence === null ? 'Traced' : 'AI read'} {formatMeasurement(m.value_extracted, m.unit)} — adjusted
                  </div>
                )}
              </div>
              {!m.confirmed_by_mike && <Badge tone="amber">Unconfirmed</Badge>}
              <Button variant="ghost" className="px-2" onClick={() => editValue(m)}>
                Edit
              </Button>
              <button
                type="button"
                className="flex size-11 items-center justify-center text-slate-400"
                onClick={() => remove(m)}
                aria-label="Delete measurement"
              >
                <TrashIcon className="size-5" />
              </button>
            </div>
          ))}
        </Card>
      )}

      {photos?.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Measurement photo library ({photos.length})
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <SignedImage key={p.id} layer={1} path={p.storage_path} className="aspect-square w-full rounded-lg object-cover" link />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

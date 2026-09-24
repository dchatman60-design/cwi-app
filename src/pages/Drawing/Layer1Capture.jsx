// LAYER 1 — CV Measurement Capture (foundation).
// Raw photos go, unmodified, to the measurement-photos bucket. Values come
// from tracing the photo against a reference card (default) or from
// GPT-4o Vision; Mike confirms or corrects every value before it's saved.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertIcon, CameraIcon, PlusIcon, TrashIcon } from '../../components/icons'
import SignedImage from '../../components/SignedImage'
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, inputClass, Segmented, Sheet, Spinner } from '../../components/ui'
import { formatMeasurement, formatPlusMinus } from '../../lib/format'
import { extractMeasurements } from '../../lib/openai'
import { supabase, uploadLayerFile } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { useOnlineStatus } from '../../lib/useOnlineStatus'
import { must, useQuery } from '../../lib/useQuery'
import { accuracyLevel } from './homography'
import MoveToOpeningSheet from '../Openings/MoveToOpeningSheet'
import MeasurementFields from './MeasurementFields'
import { hasValue, MEASUREMENT_PARTS, partLabel, sortByPart, splitValue, toMeasurementRow, UNITS } from './measurementParts'
import ReferencePicker from './ReferencePicker'
import { describeReference, loadReference, resolveReference, saveReference } from './referenceCards'
import TraceMeasure from './TraceMeasure'

const LOW_CONFIDENCE = 0.7
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
  fraction: 0,
  unit: 'in',
  note: '',
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

function CaptureSession({ jobId, openingId, onDone, onCancel }) {
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
    const upload = uploadLayerFile(1, jobId, file, extensionFor(file), openingId)
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
          ...splitValue(m.value, UNITS.includes(m.unit) ? m.unit : 'in'),
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

  const isBlank = (r) => r.source === 'manual' && !r.dimension.trim() && r.confirmed === '' && !r.fraction && !r.note.trim()

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
        ...splitValue(roundTo16th(t.value), 'in'),
        plusMinus: t.plusMinus,
        source: 'trace',
      }),
    )
    // Replace earlier traced values and blank manual rows; keep AI reads
    setRows((list) => [
      ...list.filter((r) => r.source === 'ai' || (r.source === 'manual' && !isBlank(r))),
      ...tracedRows,
    ])
    setStage('review')
  }

  const updateRow = (key, patch) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)))


  async function save() {
    const prepared = rows.filter((r) => r.include && !isBlank(r)).map((r) => ({ r, ...toMeasurementRow(r) }))
    const invalid = prepared.find((p) => p.error)
    if (invalid) return setError(invalid.error)
    if (!prepared.length) return setError('Enter at least one value or note.')

    setSaving(true)
    setError(null)
    try {
      must(
        await supabase.from('measurements').insert(
          prepared.map(({ r, row }) => ({
            ...row,
            job_id: jobId,
            opening_id: openingId,
            value_extracted: r.extracted,
            cv_confidence: r.confidence,
            photo_url: photoPath,
            confirmed_by_mike: true,
          })),
        ),
      )
      toast(`Saved ${prepared.length} measurement${prepared.length === 1 ? '' : 's'}`)
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
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-semibold">{partLabel(row.component)}</span>
                  <label className="flex min-h-11 shrink-0 items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="size-5 accent-blue-700"
                      checked={row.include}
                      onChange={(e) => updateRow(row.key, { include: e.target.checked })}
                    />
                    Save
                  </label>
                </div>
                <MeasurementFields value={row} onChange={(patch) => updateRow(row.key, patch)} idPrefix={`row-${row.key}`} />
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

/** Add or edit one entry by hand — values, types, conditions. No photo needed. */
function MeasurementForm({ jobId, openingId, measurement, onClose, onSaved }) {
  const [fields, setFields] = useState(() => ({
    component: measurement?.component ?? 'head_jam',
    dimension: measurement?.dimension ?? '',
    ...splitValue(measurement && hasValue(measurement) ? measurement.value_confirmed : null, measurement?.unit || 'in'),
    unit: measurement?.unit || 'in',
    note: measurement?.note ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function save() {
    const { row, error: invalid } = toMeasurementRow(fields)
    if (invalid) return setError(invalid)
    setSaving(true)
    setError(null)
    try {
      if (measurement) {
        const patch = { ...row, confirmed_by_mike: true }
        if (!row.note && measurement.note) patch.note = null
        must(await supabase.from('measurements').update(patch).eq('id', measurement.id))
      } else {
        must(await supabase.from('measurements').insert({ ...row, job_id: jobId, opening_id: openingId, confirmed_by_mike: true }))
      }
      toast(measurement ? 'Entry updated' : 'Entry added')
      onSaved()
      onClose()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      title={measurement ? 'Edit entry' : 'Add entry'}
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-slate-500">
        For hand-measured values, types and conditions (e.g. threshold type, surface bolts sticking), or any custom component.
      </p>
      <MeasurementFields value={fields} onChange={(patch) => setFields((f) => ({ ...f, ...patch }))} idPrefix="entry" />
      <ErrorMessage error={error} className="mt-3" />
    </Sheet>
  )
}

/** Rows for this opening (or, with no opening, the job's unassigned rows). */
const forOpening = (query, openingId) => (openingId ? query.eq('opening_id', openingId) : query.is('opening_id', null))

export default function Layer1Capture({ jobId, openingId = null }) {
  const online = useOnlineStatus()
  const [capturing, setCapturing] = useState(false)
  const [sessionKey, setSessionKey] = useState(0)
  const [editing, setEditing] = useState(null) // null | 'new' | measurement
  const [moving, setMoving] = useState(false)

  const { data: measurements, error, loading, reload } = useQuery(`measurements:${jobId}:${openingId}`, async () =>
    must(await forOpening(supabase.from('measurements').select('*').eq('job_id', jobId), openingId).order('created_at')),
  )
  const { data: photos, reload: reloadPhotos } = useQuery(`layer1-photos:${jobId}:${openingId}`, async () =>
    must(
      await forOpening(supabase.from('job_photos').select('*').eq('job_id', jobId).eq('layer', 1), openingId).order('created_at', {
        ascending: false,
      }),
    ),
  )

  async function remove(m) {
    if (!window.confirm(`Delete ${partLabel(m.component)}${m.dimension ? ` — ${m.dimension}` : ''}?`)) return
    const { error: deleteError } = await supabase.from('measurements').delete().eq('id', m.id)
    if (deleteError) return toast(deleteError.message, 'error')
    reload()
  }

  if (capturing) {
    return (
      <CaptureSession
        key={sessionKey}
        jobId={jobId}
        openingId={openingId}
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
      <Button variant="secondary" className="w-full" onClick={() => setEditing('new')}>
        <PlusIcon className="size-5" /> Add entry without a photo
      </Button>

      <ErrorMessage error={error} />
      {loading && !measurements && <Spinner />}
      {measurements && measurements.length === 0 && (
        <EmptyState title="No measurements yet">
          Photograph the opening with a measurement card beside it and trace it, or add entries by hand.
        </EmptyState>
      )}

      {sorted.length > 0 && (
        <Card className="divide-y divide-slate-100">
          {sorted.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-1 pr-1 pl-4">
              <div className="min-w-0 flex-1 py-2">
                <div className="text-sm text-slate-500">{partLabel(m.component)}</div>
                {(m.dimension || hasValue(m)) && (
                  <div className="font-medium break-words">
                    {m.dimension || 'Measurement'}
                    {hasValue(m) && (
                      <>
                        : <span className="font-bold">{formatMeasurement(m.value_confirmed, m.unit)}</span>
                      </>
                    )}
                  </div>
                )}
                {m.note && <div className="text-sm break-words text-slate-700">{m.note}</div>}
                {m.value_extracted !== null && hasValue(m) && Math.abs(m.value_extracted - m.value_confirmed) > 1 / 32 && (
                  <div className="text-xs text-slate-500">
                    {m.cv_confidence === null ? 'Traced' : 'AI read'} {formatMeasurement(m.value_extracted, m.unit)} — adjusted
                  </div>
                )}
              </div>
              {!m.confirmed_by_mike && <Badge tone="amber">Unconfirmed</Badge>}
              <Button variant="ghost" className="px-2" onClick={() => setEditing(m)}>
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
      {sorted.length > 0 && (
        <Button variant="ghost" className="-mt-2 w-full" onClick={() => setMoving(true)}>
          Move to another opening…
        </Button>
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
      {moving && (
        <MoveToOpeningSheet
          jobId={jobId}
          fromOpeningId={openingId}
          onClose={() => setMoving(false)}
          onMoved={() => {
            reload()
            reloadPhotos()
          }}
        />
      )}
      {editing && (
        <MeasurementForm
          jobId={jobId}
          openingId={openingId}
          measurement={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}

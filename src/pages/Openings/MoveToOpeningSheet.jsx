import { useState } from 'react'
import SignedImage from '../../components/SignedImage'
import { Button, Card, EmptyState, ErrorMessage, Field, inputClass, Sheet, Spinner } from '../../components/ui'
import { formatDateTime, formatMeasurement, trimNumber } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import { hasValue, partLabel, sortByPart } from '../Drawing/measurementParts'
import { isService } from '../Quotes/quotes'
import { moveToOpening } from './openings'

const GENERAL = 'general'

function PickGroup({ title, rows, picked, onChange }) {
  if (!rows.length) return null
  const allPicked = rows.every((r) => picked.has(r.key))
  const setAll = (on) => onChange(rows.map((r) => r.key), on)
  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          {title} ({rows.length})
        </h3>
        <Button variant="ghost" className="px-2 text-sm" onClick={() => setAll(!allPicked)}>
          {allPicked ? 'Clear' : 'Select all'}
        </Button>
      </div>
      <Card className="divide-y divide-slate-100">
        {rows.map((r) => (
          <label key={r.key} className="flex min-h-12 items-center gap-3 px-4 py-2 active:bg-slate-50">
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-blue-700"
              checked={picked.has(r.key)}
              onChange={(e) => onChange([r.key], e.target.checked)}
            />
            {r.thumb}
            <span className="min-w-0 flex-1">
              <span className="block break-words">{r.label}</span>
              {r.detail && <span className="block text-sm break-words text-slate-500">{r.detail}</span>}
            </span>
          </label>
        ))}
      </Card>
    </section>
  )
}

const PHOTO_KINDS = { 1: 'Measurement photo', 2: 'Marked-up photo or sketch', 3: 'Diagram' }

/** Restrict a query to one section: an opening, or General (no opening). */
const inSection = (query, openingId) => (openingId ? query.eq('opening_id', openingId) : query.is('opening_id', null))

/**
 * Move things out of one section (an opening, or General when fromOpeningId
 * is null) into another opening or General: its measurements, its photos
 * from `photoLayers` (1 = measurement photos, 2 = marked-up photos and
 * sketches, 3 = diagrams), and any quote lines passed in `items`. Mount only
 * while open.
 */
export default function MoveToOpeningSheet({
  jobId,
  fromOpeningId = null,
  measurements: withMeasurements = true,
  photoLayers = [],
  items = [],
  onClose,
  onMoved,
}) {
  const [target, setTarget] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const { data: openings } = useQuery(`move-openings:${jobId}`, async () =>
    must(await supabase.from('openings').select('id, opening_name').eq('job_id', jobId).order('created_at')),
  )
  const { data: measurements, error: measurementsError } = useQuery(
    `move-measurements:${jobId}:${fromOpeningId}:${withMeasurements}`,
    async () =>
      withMeasurements
        ? sortByPart(must(await inSection(supabase.from('measurements').select('*').eq('job_id', jobId), fromOpeningId)))
        : [],
  )
  const { data: photos, error: photosError } = useQuery(`move-photos:${jobId}:${fromOpeningId}:${photoLayers}`, async () =>
    photoLayers.length
      ? must(
          await inSection(supabase.from('job_photos').select('*').eq('job_id', jobId).in('layer', photoLayers), fromOpeningId).order(
            'created_at',
            { ascending: false },
          ),
        )
      : [],
  )
  const loadError = measurementsError || photosError

  const destinations = [
    ...(openings || []).filter((o) => o.id !== fromOpeningId).map((o) => ({ value: o.id, label: o.opening_name })),
    ...(fromOpeningId ? [{ value: GENERAL, label: 'General — not in an opening' }] : []),
  ]
  const measurementRows = (measurements || []).map((m) => ({
    key: `m:${m.id}`,
    label: [partLabel(m.component), m.dimension].filter(Boolean).join(' · '),
    detail: [hasValue(m) && formatMeasurement(m.value_confirmed, m.unit), m.note].filter(Boolean).join(' — '),
  }))
  const photoRows = (photos || []).map((p) => ({
    key: `p:${p.id}`,
    label: PHOTO_KINDS[p.layer],
    detail: formatDateTime(p.created_at),
    thumb: <SignedImage layer={p.layer} path={p.storage_path} className="size-16 shrink-0 rounded-md object-cover" />,
  }))
  const itemRows = items.map((i) => ({
    key: `i:${i.id}`,
    label: isService(i) ? i.description : `Pemko ${i.sku}`,
    detail: isService(i) ? 'Labor / service' : `Qty ${trimNumber(i.quantity)}${i.uom && i.uom !== 'ea' ? ` ${i.uom}` : ''}`,
  }))

  const togglePicked = (keys, on) =>
    setPicked((set) => {
      const next = new Set(set)
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)))
      return next
    })
  const idsOf = (prefix) => [...picked].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))

  async function move() {
    setSaving(true)
    setError(null)
    try {
      await moveToOpening({
        jobId,
        toOpeningId: target === GENERAL ? null : target,
        measurementIds: idsOf('m:'),
        photoIds: idsOf('p:'),
        itemIds: idsOf('i:'),
      })
      toast(`Moved to ${destinations.find((d) => d.value === target)?.label.replace(/ —.*/, '')}`)
      onMoved?.()
      onClose()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  const loading = openings === undefined || measurements === undefined || photos === undefined
  const nothing = !loading && !measurementRows.length && !photoRows.length && !itemRows.length

  return (
    <Sheet
      open
      title={fromOpeningId ? 'Move to another opening' : 'Assign to an opening'}
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={move} disabled={saving || !target || !picked.size}>
          {saving ? 'Moving…' : picked.size ? `Move ${picked.size} selected` : 'Select what to move'}
        </Button>
      }
    >
      <ErrorMessage error={loadError} className="mb-3" />
      {loading && !loadError && <Spinner />}
      {nothing && <EmptyState title="Nothing to move here" />}
      {!loading && !nothing && (
        <div className="space-y-5">
          {destinations.length ? (
            <Field label="Move to">
              <select className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose an opening…</option>
                {destinations.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Add the opening first — on the job&apos;s Openings tab — then come back to move these into it.
            </p>
          )}
          <PickGroup title="Measurements" rows={measurementRows} picked={picked} onChange={togglePicked} />
          {measurementRows.length > 0 && (
            <p className="-mt-3 text-xs text-slate-500">
              A measurement photo moves too, once all of its measurements are in the same opening.
            </p>
          )}
          <PickGroup title="Photos & sketches" rows={photoRows} picked={picked} onChange={togglePicked} />
          <PickGroup title="Quote lines" rows={itemRows} picked={picked} onChange={togglePicked} />
          <ErrorMessage error={error} />
        </div>
      )}
    </Sheet>
  )
}

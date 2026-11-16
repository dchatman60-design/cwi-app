import { useState } from 'react'
import { Button, ErrorMessage, Field, inputClass, Sheet, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'
import { useAuth } from '../../context/auth'
import { toast } from '../../lib/toast'
import { hasRealDescription, PRODUCT_COLUMNS, saveProductDescription } from './catalog'

/**
 * Write or add to a Pemko part's description. The new text is used everywhere
 * the part shows up, and (optionally) on lines already on draft quotes.
 * `onSaved(product)` gets the updated catalog row.
 */
export default function EditDescriptionSheet({ product, onClose, onSaved }) {
  const { profile } = useAuth()
  const real = hasRealDescription(product)
  const [description, setDescription] = useState(real ? product.description : '')
  const [notes, setNotes] = useState(product.notes || '')
  const [updateDrafts, setUpdateDrafts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const original = product.original_description
  const showOriginal = original && original !== product.description && hasRealDescription({ description: original })

  async function save() {
    if (!description.trim()) return setError('Enter a description.')
    setSaving(true)
    setError(null)
    try {
      const { product: saved, linesUpdated } = await saveProductDescription(product, {
        description,
        notes,
        userId: profile?.id,
        updateDraftQuotes: updateDrafts,
      })
      toast(linesUpdated ? `Description saved · updated on ${linesUpdated} draft quote line${linesUpdated === 1 ? '' : 's'}` : 'Description saved')
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      title={`Describe ${product.sku}`}
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save description'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field
          label="Description"
          hint="What it is, in plain words — this is what shows on quotes and in search."
        >
          <textarea
            autoFocus
            rows={4}
            className={`${inputClass} min-h-28`}
            placeholder="e.g. Saddle threshold, mill aluminum, 5 in. wide × 1/2 in. high"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {showOriginal && (
          <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Pemko catalog text</div>
            <div className="mt-1">{original}</div>
            <button
              type="button"
              className="mt-2 font-medium text-blue-700"
              onClick={() => setDescription(original)}
            >
              Use the catalog text
            </button>
          </div>
        )}
        <Field label="Notes (internal)" hint="Install tips, where it's used, what to pair it with. Not shown to customers.">
          <textarea
            rows={3}
            className={`${inputClass} min-h-20`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            className="size-5"
            checked={updateDrafts}
            onChange={(e) => setUpdateDrafts(e.target.checked)}
          />
          <span>Also update this part on draft quotes</span>
        </label>
        <ErrorMessage error={error} />
      </div>
    </Sheet>
  )
}

/** Same sheet, loading the catalog part by id first (used from quote lines). */
export function EditDescriptionById({ productId, onClose, onSaved }) {
  const { data, error } = useQuery(`product:${productId}`, async () =>
    must(await supabase.from('pemko_products').select(PRODUCT_COLUMNS).eq('id', productId).single()),
  )
  if (data) return <EditDescriptionSheet product={data} onClose={onClose} onSaved={onSaved} />
  return (
    <Sheet open title="Describe part" onClose={onClose}>
      {error ? <ErrorMessage error={error} /> : <Spinner />}
    </Sheet>
  )
}

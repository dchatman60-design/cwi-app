import { useState } from 'react'
import { PlusIcon } from '../../components/icons'
import { Card, inputClass } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { scopePresets } from './scope'

const boxClass = inputClass.replace('block w-full ', '')

/**
 * "Scope on proposal" for one door: tap the work being done, or type your
 * own line. Saves as you go. The proposal lists these under the door.
 */
export default function ScopeEditor({ opening, onSaved }) {
  const [items, setItems] = useState(() => opening.scope_items || [])
  const [custom, setCustom] = useState('')
  const presets = scopePresets(opening.opening_type)
  const extras = items.filter((i) => !presets.some((p) => p.toLowerCase() === i.toLowerCase()))
  const has = (line) => items.some((i) => i.toLowerCase() === line.toLowerCase())

  async function save(next) {
    const previous = items
    setItems(next)
    const { error } = await supabase.from('openings').update({ scope_items: next }).eq('id', opening.id)
    if (error) {
      setItems(previous)
      toast(error.message, 'error')
    } else {
      onSaved?.(next)
    }
  }

  const toggle = (line) => save(has(line) ? items.filter((i) => i.toLowerCase() !== line.toLowerCase()) : [...items, line])

  function addCustom(e) {
    e.preventDefault()
    const line = custom.trim()
    if (!line) return
    if (!has(line)) save([...items, line])
    setCustom('')
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="font-semibold">Scope on proposal</h3>
        <p className="text-xs text-slate-500">What the customer sees for this door. Prices aren&apos;t shown per door — only the total.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[...presets, ...extras].map((line) => {
          const on = has(line)
          return (
            <button
              key={line}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(line)}
              className={`min-h-10 rounded-full border px-3 text-left text-sm font-medium ${
                on ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {on ? '✓ ' : '+ '}
              {line}
            </button>
          )
        })}
      </div>
      <form onSubmit={addCustom} className="flex gap-2">
        <input
          className={`${boxClass} min-w-0 flex-1`}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Add your own line…"
          aria-label="Add a scope line"
        />
        <button
          type="submit"
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 font-semibold text-slate-800 active:bg-slate-100"
        >
          <PlusIcon className="size-5" /> Add
        </button>
      </form>
    </Card>
  )
}

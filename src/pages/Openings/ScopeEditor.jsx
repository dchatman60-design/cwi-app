import { useState } from 'react'
import { PlusIcon } from '../../components/icons'
import { Card, inputClass } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { FINISHES, mainScope, scopePart, scopePresets, withFinish } from './scope'

const boxClass = inputClass.replace('block w-full ', '')

/**
 * "Scope on proposal" for one door: tap the work being done, or type your
 * own line. Saves as you go. The proposal lists these under the door.
 */
export default function ScopeEditor({ opening, onSaved }) {
  const [items, setItems] = useState(() => opening.scope_items || [])
  const [custom, setCustom] = useState('')
  const main = mainScope(opening.opening_type)
  const presets = scopePresets(opening.opening_type)
  const others = presets.filter((p) => !main.some((m) => m.line === p))
  const same = (a, b) => a.toLowerCase() === b.toLowerCase()
  const has = (line) => items.some((i) => same(i, line))
  // A main checkbox is on for its plain line or any variant of the same part
  // ("interlocking weatherstripping" checks Weatherstrip)
  const samePart = (a, b) => {
    const pa = scopePart(a)
    const pb = scopePart(b)
    return Boolean(pa && pb && pa.key === pb.key)
  }
  const mainItem = (m) => items.find((i) => same(i, m.line) || samePart(i, m.line))
  const extras = items.filter((i) => !presets.some((p) => same(p, i)) && !main.some((m) => samePart(i, m.line)))
  const [finish, setFinish] = useState(opening.finish || '')
  const [customFinish, setCustomFinish] = useState(
    opening.finish && !FINISHES.includes(opening.finish) ? opening.finish : '',
  )

  async function saveFinish(next, { allDoors = false } = {}) {
    const previous = finish
    setFinish(next)
    let query = supabase.from('openings').update({ finish: next || null })
    query = allDoors ? query.eq('job_id', opening.job_id) : query.eq('id', opening.id)
    const { error } = await query
    if (error) {
      setFinish(previous)
      toast(error.message, 'error')
    } else if (allDoors) {
      toast(next ? `${next} set on every door on this job` : 'Finish cleared on every door on this job')
    }
  }

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

  // Adding a line for a part that's already there swaps it ("weatherstripping" → "interlocking weatherstripping")
  const add = (line) => {
    const without = scopePart(line) ? items.filter((i) => !samePart(i, line)) : items
    return save([...without, line])
  }
  const toggle = (line) => (has(line) ? save(items.filter((i) => !same(i, line))) : add(line))
  const toggleMain = (m) => {
    const current = mainItem(m)
    return current ? save(items.filter((i) => i !== current)) : add(m.line)
  }

  function addCustom(e) {
    e.preventDefault()
    const line = custom.trim()
    if (!line) return
    if (!has(line)) add(line)
    setCustom('')
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="font-semibold">Work on this door</h3>
        <p className="text-xs text-slate-500">Listed under this door on the proposal (as &ldquo;Furnish and install …&rdquo;). The proposal shows one total, not per-door prices.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {main.map((m) => {
          const current = mainItem(m)
          const variant = current && scopePart(current)?.variant
          return (
            <label
              key={m.line}
              className={`flex min-h-12 min-w-0 items-center gap-2 rounded-lg border px-2.5 text-[15px] leading-tight font-semibold first:col-span-2 ${
                current ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white text-slate-800'
              }`}
            >
              <input type="checkbox" className="size-5 shrink-0 accent-blue-700" checked={Boolean(current)} onChange={() => toggleMain(m)} />
              <span className="min-w-0">
                {m.label}
                {variant && <span className="block text-xs font-medium capitalize">{variant}</span>}
              </span>
            </label>
          )
        })}
      </div>
      <div>
        <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Finish</div>
        <p className="text-xs text-slate-500">
          Printed on the proposal, e.g. &ldquo;{withFinish('Furnish and install threshold', finish || 'Brass')}&rdquo;.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {['', ...FINISHES].map((f) => (
            <button
              key={f || 'none'}
              type="button"
              aria-pressed={finish === f}
              onClick={() => saveFinish(f)}
              className={`min-h-10 rounded-full border px-3 text-sm font-medium ${
                finish === f ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {f || 'None'}
            </button>
          ))}
          <input
            className={`${boxClass} min-h-10 w-32 rounded-full py-1 text-sm`}
            placeholder="Other…"
            aria-label="Other finish"
            value={customFinish}
            onChange={(e) => setCustomFinish(e.target.value)}
            onBlur={() => customFinish.trim() && customFinish.trim() !== finish && saveFinish(customFinish.trim())}
          />
        </div>
        {finish && (
          <button type="button" className="mt-2 text-sm font-medium text-blue-700" onClick={() => saveFinish(finish, { allDoors: true })}>
            Use {finish.toLowerCase()} on every door on this job
          </button>
        )}
      </div>
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Other work</div>
      <div className="flex flex-wrap gap-2">
        {[...others, ...extras].map((line) => {
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

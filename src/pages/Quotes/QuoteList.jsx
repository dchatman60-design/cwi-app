import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlusIcon } from '../../components/icons'
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, inputClass, PageHeader, Sheet, Spinner } from '../../components/ui'
import { currency, formatDateTime } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'
import { createQuote, QUOTE_LIST_SELECT, QUOTE_STATUSES, quoteTitle, quoteTotals } from './quotes'

function NewQuoteSheet({ onClose }) {
  const navigate = useNavigate()
  const [jobId, setJobId] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const { data: jobs } = useQuery('new-quote-jobs', async () =>
    must(await supabase.from('jobs').select('id, job_name, site_address').order('created_at', { ascending: false })),
  )

  async function create() {
    setSaving(true)
    try {
      const quote = await createQuote({ jobId: jobId || null, title: title.trim() || null })
      navigate(`/quotes/${quote.id}`)
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      title="New quote"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={create} disabled={saving}>
          {saving ? 'Creating…' : 'Create quote'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Job" hint="Linking a job pulls in its confirmed measurements.">
          <select className={inputClass} value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">No job yet</option>
            {jobs?.map((j) => (
              <option key={j.id} value={j.id}>
                {j.job_name}
                {j.site_address ? ` — ${j.site_address}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" hint="Optional — defaults to the job name.">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <ErrorMessage error={error} />
      </div>
    </Sheet>
  )
}

export default function QuoteList() {
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useState('all')

  const { data, error, loading } = useQuery('quotes', async () =>
    must(await supabase.from('quotes').select(QUOTE_LIST_SELECT).order('updated_at', { ascending: false })),
  )
  const filtered = (data || []).filter((q) => status === 'all' || q.status === status)
  // Options sit right under their main quote
  const quotes = filtered
    .filter((q) => !q.parent_quote_id || !filtered.some((p) => p.id === q.parent_quote_id))
    .flatMap((q) => [q, ...filtered.filter((o) => o.parent_quote_id === q.id)])
  const parentOf = (q) => (data || []).find((p) => p.id === q.parent_quote_id)

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="Takeoffs & proposals"
        action={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon className="size-5" /> New
          </Button>
        }
      />
      <div className="space-y-3 px-4">
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="all">All quotes</option>
          {QUOTE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {data && <PipelineSummary quotes={data} status={status} onPick={setStatus} />}

        <ErrorMessage error={error} />
        {loading && !data && <Spinner />}
        {data && quotes.length === 0 && (
          <EmptyState title="No quotes yet">Start one here, from a job, or from Product Search.</EmptyState>
        )}
        {quotes.length > 0 && (
          <Card className="divide-y divide-slate-100">
            {quotes.map((q) => (
              <Link
                key={q.id}
                to={`/quotes/${q.id}`}
                className={`flex min-h-16 items-center gap-3 py-3 pr-4 ${q.parent_quote_id && quotes.some((p) => p.id === q.parent_quote_id) ? 'border-l-4 border-l-blue-200 pl-6' : 'pl-4'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold break-words">{quoteTitle(q)}</div>
                  {q.parent_quote_id && parentOf(q) && (
                    <div className="text-xs text-blue-700">Option for {quoteTitle(parentOf(q))}</div>
                  )}
                  <div className="text-sm break-words text-slate-500">
                    {q.items.length} item{q.items.length === 1 ? '' : 's'} · {formatDateTime(q.updated_at || q.created_at)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold">{currency(quoteTotals(q, q.items).total)}</div>
                  {q.items_only && <div className="text-xs text-slate-500">Option</div>}
                  <Badge>{QUOTE_STATUSES.find((s) => s.value === q.status)?.label || q.status}</Badge>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>

      {creating && <NewQuoteSheet onClose={() => setCreating(false)} />}
    </div>
  )
}

/**
 * Pipeline totals by status — Sent, Draft and Accepted — each with its count.
 * Option / add-on quotes are shown on their own line under each total so they
 * don't inflate it. Tapping a tile filters the list to that status.
 */
function PipelineSummary({ quotes, status, onPick }) {
  const sum = (list) => list.reduce((t, q) => t + quoteTotals(q, q.items).total, 0)
  const tiles = [
    { value: 'sent', label: 'Sent', hint: 'Proposals out' },
    { value: 'draft', label: 'Draft', hint: 'Being prepared' },
    { value: 'accepted', label: 'Accepted', hint: 'Won' },
  ].map((t) => {
    const list = quotes.filter((q) => q.status === t.value)
    const main = list.filter((q) => !q.items_only)
    const options = list.filter((q) => q.items_only)
    return { ...t, total: sum(main), count: main.length, optionTotal: sum(options), optionCount: options.length }
  })
  const open = tiles.filter((t) => t.value !== 'accepted')

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Pipeline</span>
        <span className="text-xs text-slate-500">
          Sent + draft: <span className="font-semibold text-slate-800">{currency(open.reduce((t, x) => t + x.total, 0))}</span>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onPick(status === t.value ? 'all' : t.value)}
            aria-pressed={status === t.value}
            className={`min-w-0 rounded-lg p-2.5 text-left ring-1 ${
              status === t.value ? 'bg-blue-50 ring-blue-300' : 'bg-slate-50 ring-slate-200'
            }`}
          >
            <div className="text-xs font-semibold text-slate-600">{t.label}</div>
            <div className="mt-0.5 text-lg leading-tight font-bold break-words tabular-nums">{currency(t.total)}</div>
            <div className="text-xs text-slate-500">
              {t.count} proposal{t.count === 1 ? '' : 's'}
            </div>
            {t.optionCount > 0 && (
              <div className="mt-1 text-xs text-slate-500">+ {currency(t.optionTotal)} options</div>
            )}
          </button>
        ))}
      </div>
    </Card>
  )
}

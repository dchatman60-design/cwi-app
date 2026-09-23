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
  const quotes = (data || []).filter((q) => status === 'all' || q.status === status)

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

        <ErrorMessage error={error} />
        {loading && !data && <Spinner />}
        {data && quotes.length === 0 && (
          <EmptyState title="No quotes yet">Start one here, from a job, or from Product Search.</EmptyState>
        )}
        {quotes.length > 0 && (
          <Card className="divide-y divide-slate-100">
            {quotes.map((q) => (
              <Link key={q.id} to={`/quotes/${q.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold break-words">{quoteTitle(q)}</div>
                  <div className="text-sm break-words text-slate-500">
                    {q.items.length} item{q.items.length === 1 ? '' : 's'} · {formatDateTime(q.updated_at || q.created_at)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold">{currency(quoteTotals(q, q.items).total)}</div>
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

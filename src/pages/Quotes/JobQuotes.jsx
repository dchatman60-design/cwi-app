import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlusIcon } from '../../components/icons'
import { Badge, Button, Card, EmptyState, ErrorMessage, Spinner } from '../../components/ui'
import { currency, formatDateTime } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'
import { createQuote, QUOTE_LIST_SELECT, QUOTE_STATUSES, quoteTitle, quoteTotals } from './quotes'

export default function JobQuotes({ jobId }) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const { data: quotes, error, loading } = useQuery(`job-quotes:${jobId}`, async () =>
    must(await supabase.from('quotes').select(QUOTE_LIST_SELECT).eq('job_id', jobId).order('created_at', { ascending: false })),
  )

  async function newQuote() {
    setCreating(true)
    try {
      const quote = await createQuote({ jobId })
      navigate(`/quotes/${quote.id}`)
    } catch (err) {
      setCreateError(err)
      setCreating(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={newQuote} disabled={creating}>
        <PlusIcon className="size-5" /> New quote for this job
      </Button>
      <ErrorMessage error={error || createError} />
      {loading && !quotes && <Spinner />}
      {quotes?.length === 0 && <EmptyState title="No quotes yet" />}
      {quotes?.length > 0 && (
        <Card className="divide-y divide-slate-100">
          {quotes.map((q) => (
            <Link key={q.id} to={`/quotes/${q.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium break-words">{quoteTitle(q)}</div>
                <div className="text-sm text-slate-500">{formatDateTime(q.created_at)}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{currency(quoteTotals(q, q.items).total)}</div>
                <Badge>{QUOTE_STATUSES.find((s) => s.value === q.status)?.label || q.status}</Badge>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}

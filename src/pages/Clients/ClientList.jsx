import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlusIcon, SearchIcon } from '../../components/icons'
import { Badge, Button, Card, EmptyState, ErrorMessage, inputClass, PageHeader, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'
import ClientForm from './ClientForm'

export default function ClientList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [adding, setAdding] = useState(false)

  const { data, error, loading } = useQuery('clients', async () =>
    must(await supabase.from('clients').select('*').order('client_name')),
  )

  const term = search.trim().toLowerCase()
  const clients = (data || []).filter(
    (c) =>
      (showInactive || c.is_active !== false) &&
      (!term ||
        [c.client_name, c.contact_name, c.email, c.phone, c.address].some((v) => v?.toLowerCase().includes(term))),
  )

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={data && `${clients.length} shown`}
        action={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon className="size-5" /> New
          </Button>
        }
      />

      <div className="px-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className={`${inputClass} pl-10`}
            placeholder="Search name, contact, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="size-5 accent-blue-700"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive clients
        </label>
      </div>

      <div className="px-4">
        <ErrorMessage error={error} />
        {loading && !data && <Spinner />}
        {data && clients.length === 0 && (
          <EmptyState title={term ? 'No clients match' : 'No clients yet'}>
            {!term && 'Add your first client with the New button.'}
          </EmptyState>
        )}
        {clients.length > 0 && (
          <Card className="divide-y divide-slate-100">
            {clients.map((c) => (
              <Link key={c.id} to={`/clients/${c.id}`} className="block min-h-14 px-4 py-3 active:bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold break-words">{c.client_name}</span>
                  {c.is_active === false && <Badge>Inactive</Badge>}
                </div>
                {(c.contact_name || c.phone) && (
                  <div className="text-sm break-words text-slate-500">
                    {[c.contact_name, c.phone].filter(Boolean).join(' · ')}
                  </div>
                )}
              </Link>
            ))}
          </Card>
        )}
      </div>

      {adding && (
        <ClientForm onClose={() => setAdding(false)} onSaved={(client) => navigate(`/clients/${client.id}`)} />
      )}
    </div>
  )
}

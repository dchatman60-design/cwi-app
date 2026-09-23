import { useState } from 'react'
import { PlusIcon } from '../../components/icons'
import { Badge, Button, Card, ErrorMessage, PageHeader, Spinner } from '../../components/ui'
import { useAuth } from '../../context/auth'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'
import UserForm from './UserForm'

function UserRows({ users, onSelect, currentUserId }) {
  return (
    <Card className="divide-y divide-slate-100">
      {users.map((u) => (
        <button
          key={u.id}
          type="button"
          onClick={() => onSelect(u)}
          className="block min-h-16 w-full px-4 py-3 text-left active:bg-slate-50"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold break-words">
              {u.full_name}
              {u.id === currentUserId && <span className="font-normal text-slate-500"> (you)</span>}
            </span>
            {u.is_admin && <Badge tone="blue">Admin</Badge>}
          </div>
          <div className="text-sm break-all text-slate-500">{[u.role, u.email].filter(Boolean).join(' · ')}</div>
        </button>
      ))}
    </Card>
  )
}

export default function UserList() {
  const { profile } = useAuth()
  const [editing, setEditing] = useState(null) // null | 'new' | user

  const { data, error, loading, reload } = useQuery('app-users', async () =>
    must(await supabase.from('app_users').select('*').order('full_name')),
  )
  const active = (data || []).filter((u) => u.is_active)
  const inactive = (data || []).filter((u) => !u.is_active)

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Who can sign in and be assigned tasks"
        action={
          <Button onClick={() => setEditing('new')}>
            <PlusIcon className="size-5" /> Add
          </Button>
        }
      />
      <div className="space-y-6 px-4">
        <ErrorMessage error={error} />
        {loading && !data && <Spinner />}
        {active.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
              Active ({active.length})
            </h2>
            <UserRows users={active} onSelect={setEditing} currentUserId={profile.id} />
          </section>
        )}
        {inactive.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
              Deactivated ({inactive.length})
            </h2>
            <p className="mb-2 text-sm text-slate-500">
              Hidden from assignment dropdowns. Their task history is kept.
            </p>
            <UserRows users={inactive} onSelect={setEditing} currentUserId={profile.id} />
          </section>
        )}
      </div>

      {editing && (
        <UserForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />
      )}
    </div>
  )
}

import { useState } from 'react'
import { Button, ErrorMessage, Field, inputClass, Sheet } from '../../components/ui'
import { useAuth } from '../../context/auth'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must } from '../../lib/useQuery'

/** Add or edit an app user. Admins can't remove their own admin access or deactivate themselves. */
export default function UserForm({ user, onClose, onSaved }) {
  const { profile, refreshProfile } = useAuth()
  const isSelf = user?.id === profile.id
  const [form, setForm] = useState(() => ({
    full_name: user?.full_name ?? '',
    role: user?.role ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    is_admin: user?.is_admin ?? false,
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function persist(patch, message) {
    setSaving(true)
    setError(null)
    try {
      if (user) must(await supabase.from('app_users').update(patch).eq('id', user.id))
      else must(await supabase.from('app_users').insert({ ...patch, is_active: true }))
      toast(message)
      if (isSelf) refreshProfile()
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.code === '23505' ? 'Another user already has that email address.' : err)
      setSaving(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim()) return setError('Full name is required.')
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Enter a valid email — it’s how this person signs in.')
    persist(
      {
        full_name: form.full_name.trim(),
        role: form.role.trim() || null,
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        is_admin: isSelf ? true : form.is_admin,
      },
      user ? 'User updated' : 'User added',
    )
  }

  function toggleActive() {
    const next = !user.is_active
    if (!next && !window.confirm(`Deactivate ${user.full_name}? They won't be able to sign in or be assigned tasks.`))
      return
    persist({ is_active: next }, next ? 'User reactivated' : 'User deactivated')
  }

  return (
    <Sheet
      open
      title={user ? 'Edit user' : 'Add user'}
      onClose={onClose}
      footer={
        <Button type="submit" form="user-form" className="w-full" disabled={saving}>
          {saving ? 'Saving…' : user ? 'Save changes' : 'Add user'}
        </Button>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name" required>
          <input className={inputClass} value={form.full_name} onChange={set('full_name')} required />
        </Field>
        <Field label="Role" hint="e.g. Owner, Field Sales, Accounting / Operations">
          <input className={inputClass} value={form.role} onChange={set('role')} />
        </Field>
        <Field label="Email" required hint="They'll sign in with a code sent to this address. Reminders go here too.">
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            className={inputClass}
            value={form.email}
            onChange={set('email')}
            required
          />
        </Field>
        <Field label="Phone">
          <input type="tel" inputMode="tel" className={inputClass} value={form.phone} onChange={set('phone')} />
        </Field>
        <label className="flex min-h-11 items-center gap-3 rounded-lg bg-white px-3 ring-1 ring-slate-200">
          <input
            type="checkbox"
            className="size-5 accent-blue-700"
            checked={isSelf || form.is_admin}
            disabled={isSelf}
            onChange={set('is_admin')}
          />
          <span>
            <span className="font-medium">Admin</span>
            <span className="block text-xs text-slate-500">
              {isSelf ? "You can't remove your own admin access." : 'Can manage users.'}
            </span>
          </span>
        </label>
        <ErrorMessage error={error} />
      </form>

      {user && !isSelf && (
        <Button
          variant={user.is_active ? 'danger' : 'secondary'}
          className="mt-8 w-full"
          onClick={toggleActive}
          disabled={saving}
        >
          {user.is_active ? 'Deactivate user' : 'Reactivate user'}
        </Button>
      )}
    </Sheet>
  )
}

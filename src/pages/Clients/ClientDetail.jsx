import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MailIcon, MapIcon, PhoneIcon, PlusIcon } from '../../components/icons'
import { Badge, Button, Card, EmptyState, ErrorMessage, PageHeader, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import JobForm from '../Jobs/JobForm'
import { jobStatusLabel, jobStatusTone } from '../Jobs/jobStatus'
import LinkedTasks from '../Tasks/LinkedTasks'
import ClientForm from './ClientForm'

function ContactButton({ href, label, children }) {
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noreferrer"
      className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-blue-700 active:bg-slate-50"
    >
      {children}
      {label}
    </a>
  )
}

export default function ClientDetail() {
  const { id } = useParams()
  const [editing, setEditing] = useState(false)
  const [addingJob, setAddingJob] = useState(false)

  const { data: client, error, loading, reload } = useQuery(`client:${id}`, async () =>
    must(await supabase.from('clients').select('*').eq('id', id).maybeSingle()),
  )
  const { data: jobs, reload: reloadJobs } = useQuery(`client-jobs:${id}`, async () =>
    must(
      await supabase
        .from('jobs')
        .select('id, job_name, site_address, status')
        .eq('client_id', id)
        .order('created_at', { ascending: false }),
    ),
  )

  async function toggleActive() {
    const next = client.is_active === false
    if (!next && !window.confirm(`Mark ${client.client_name} as inactive? They'll be hidden from lists.`)) return
    const { error: updateError } = await supabase.from('clients').update({ is_active: next }).eq('id', id)
    if (updateError) return toast(updateError.message, 'error')
    toast(next ? 'Client reactivated' : 'Client marked inactive')
    reload()
  }

  if (loading && !client) return <Spinner />
  if (error) return <ErrorMessage error={error} className="m-4" />
  if (!client) return <EmptyState title="Client not found" />

  return (
    <div>
      <PageHeader
        title={client.client_name}
        subtitle={client.contact_name}
        back="/clients"
        action={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      />

      {client.is_active === false && (
        <div className="px-4 pb-2">
          <Badge>Inactive</Badge>
        </div>
      )}

      {(client.phone || client.email || client.address) && (
        <div className="flex gap-3 px-4">
          {client.phone && (
            <ContactButton href={`tel:${client.phone.replace(/[^\d+]/g, '')}`} label="Call">
              <PhoneIcon className="size-5" />
            </ContactButton>
          )}
          {client.email && (
            <ContactButton href={`mailto:${client.email}`} label="Email">
              <MailIcon className="size-5" />
            </ContactButton>
          )}
          {client.address && (
            <ContactButton href={`https://maps.apple.com/?q=${encodeURIComponent(client.address)}`} label="Map">
              <MapIcon className="size-5" />
            </ContactButton>
          )}
        </div>
      )}

      <Card className="mx-4 mt-4 divide-y divide-slate-100">
        {[
          ['Phone', client.phone],
          ['Email', client.email],
          ['Address', client.address],
          ['Notes', client.notes],
        ]
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label} className="px-4 py-3">
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</div>
              <div className="mt-0.5 break-words whitespace-pre-wrap">{value}</div>
            </div>
          ))}
      </Card>

      <section className="mt-6 px-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold">Jobs</h2>
          <Button variant="ghost" onClick={() => setAddingJob(true)}>
            <PlusIcon className="size-5" /> New job
          </Button>
        </div>
        {jobs?.length ? (
          <Card className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <Link key={job.id} to={`/jobs/${job.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium break-words">{job.job_name}</div>
                  {job.site_address && <div className="text-sm break-words text-slate-500">{job.site_address}</div>}
                </div>
                <Badge tone={jobStatusTone(job.status)}>{jobStatusLabel(job.status)}</Badge>
              </Link>
            ))}
          </Card>
        ) : (
          <p className="text-sm text-slate-500">No jobs for this client yet.</p>
        )}
      </section>

      <section className="mt-6 px-4">
        <h2 className="mb-2 text-lg font-bold">Tasks</h2>
        <LinkedTasks clientId={id} />
      </section>

      <div className="mt-8 px-4">
        <Button variant="secondary" className="w-full" onClick={toggleActive}>
          {client.is_active === false ? 'Reactivate client' : 'Mark client inactive'}
        </Button>
      </div>

      {editing && <ClientForm client={client} onClose={() => setEditing(false)} onSaved={reload} />}
      {addingJob && (
        <JobForm defaults={{ client_id: id }} onClose={() => setAddingJob(false)} onSaved={reloadJobs} />
      )}
    </div>
  )
}

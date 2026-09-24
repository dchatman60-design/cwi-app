import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackIcon, CloseIcon } from './icons'

export const inputClass =
  'block w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none disabled:bg-slate-100'

const buttonVariants = {
  primary: 'bg-blue-700 text-white active:bg-blue-800 disabled:bg-blue-300',
  secondary: 'bg-white text-slate-800 border border-slate-300 active:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-red-600 text-white active:bg-red-700 disabled:bg-red-300',
  dangerOutline: 'bg-white text-red-700 border border-red-200 active:bg-red-50 disabled:text-red-300',
  ghost: 'text-blue-700 active:bg-blue-50 disabled:text-slate-400',
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold transition-colors disabled:cursor-not-allowed ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card({ className = '', ...props }) {
  // Let a passed-in background or border color replace the defaults (two
  // conflicting Tailwind classes don't reliably override each other)
  const bg = /(^|\s)bg-/.test(className) ? '' : 'bg-white'
  const border = /(^|\s)border-[a-z]+-\d/.test(className) ? '' : 'border-slate-200'
  return <div className={`rounded-xl border ${border} ${bg} ${className}`} {...props} />
}

/** Page title bar. `back` shows a back arrow (to that path, or history if true). */
export function PageHeader({ title, subtitle, back, action }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-start gap-2 px-4 pt-4 pb-3">
      {back && (
        <button
          type="button"
          onClick={() => (back === true ? navigate(-1) : navigate(back))}
          className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 active:bg-slate-200"
          aria-label="Back"
        >
          <BackIcon />
        </button>
      )}
      <div className="min-w-0 flex-1 pt-1.5">
        <h1 className="text-2xl leading-tight font-bold break-words text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm break-words text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Field({ label, hint, children, required }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

/** Full-screen panel for forms — keeps inputs clear of the phone keyboard. */
export function Sheet({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50" role="dialog" aria-modal="true">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onClose}
          className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          aria-label="Close"
        >
          <CloseIcon />
        </button>
        <h2 className="min-w-0 flex-1 truncate py-3 text-lg font-semibold">{title}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      {footer && (
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      )}
    </div>
  )
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-slate-500">
      <span className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, children }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  )
}

export function ErrorMessage({ error, className = '' }) {
  if (!error) return null
  const message = typeof error === 'string' ? error : error.message || 'Something went wrong.'
  return (
    <div className={`rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 ${className}`}>
      {message}
    </div>
  )
}

const badgeTones = {
  slate: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-red-600 text-white',
  redSoft: 'bg-red-100 text-red-800',
}

export function Badge({ tone = 'slate', children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${badgeTones[tone]}`}>
      {children}
    </span>
  )
}

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`flex rounded-lg bg-slate-200 p-1 ${className}`} role="radiogroup">
      {options.map((opt) => {
        const optValue = typeof opt === 'object' ? opt.value : opt
        const label = typeof opt === 'object' ? opt.label : opt
        const selected = optValue === value
        return (
          <button
            key={String(optValue)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(optValue)}
            className={`min-h-10 flex-1 rounded-md px-2 text-sm font-semibold ${
              selected ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function Toaster() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const onToast = (e) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((list) => [...list, { id, ...e.detail }])
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3500)
    }
    window.addEventListener('cwi:toast', onToast)
    return () => window.removeEventListener('cwi:toast', onToast)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 print:hidden">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`max-w-md rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
            t.tone === 'error' ? 'bg-red-700' : 'bg-slate-900'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}

import { useState } from 'react'
import { Button, ErrorMessage, Field, inputClass } from '../components/ui'
import { supabase } from '../lib/supabase'

/**
 * Email sign-in with a one-time code. A code (rather than only a link) keeps
 * sign-in inside the installed iPhone app — links open in Safari instead.
 */
export default function SignIn() {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function sendCode(e) {
    e.preventDefault()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) return
    setBusy(true)
    setError(null)
    try {
      const { data: onTeam, error: rpcError } = await supabase.rpc('is_team_email', {
        check_email: cleanEmail,
      })
      if (!rpcError && onTeam === false) {
        setError("That email isn't on the CWI team list. Ask an admin to add you.")
        return
      }
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: window.location.href },
      })
      if (otpError) throw otpError
      setEmail(cleanEmail)
      setStep('code')
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (verifyError) setError('That code is invalid or expired. Check the email or send a new code.')
    // On success the auth listener swaps this screen for the app.
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <span className="inline-block rounded-lg bg-slate-900 px-3 py-1.5 text-xl font-black text-white">
          CWI
        </span>
        <h1 className="mt-4 text-2xl font-bold">CWI Field App</h1>
        <p className="mt-1 text-slate-500">Custom Weatherstrip, Inc.</p>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-4">
          <Field label="Work email">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
            />
          </Field>
          <ErrorMessage error={error} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          <p className="text-slate-600">
            We sent a sign-in code to <strong className="break-all">{email}</strong>. Enter it below,
            or tap the link in the email.
          </p>
          <Field label="Sign-in code">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${inputClass} text-center text-2xl tracking-[0.3em]`}
            />
          </Field>
          <ErrorMessage error={error} />
          <Button type="submit" className="w-full" disabled={busy || code.length < 6}>
            {busy ? 'Checking…' : 'Sign in'}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setStep('email')
              setCode('')
              setError(null)
            }}
          >
            Use a different email
          </Button>
        </form>
      )}
    </div>
  )
}

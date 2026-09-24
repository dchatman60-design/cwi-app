import { inputClass } from './ui'

/** Number field that saves on blur (or Enter) instead of on every keystroke. */
export default function NumberInput({ value, onCommit, className = '', ...props }) {
  return (
    <input
      key={String(value)}
      defaultValue={value ?? ''}
      inputMode="decimal"
      className={`${inputClass} ${className}`}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onBlur={(e) => {
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n !== Number(value)) onCommit(n)
        else e.target.value = value ?? ''
      }}
      {...props}
    />
  )
}

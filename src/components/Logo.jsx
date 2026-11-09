// CWI monogram — serif capitals like the business card, in a framed square.
// One drawing for the app header, sign-in, the proposal letterhead and the
// home-screen icon (public/favicon.svg matches it).

const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif"

/** Square mark. `inverted` = white square for dark backgrounds. */
export function LogoMark({ className = 'size-10', inverted = false, title = 'CWI' }) {
  const bg = inverted ? '#ffffff' : '#0f172a'
  const fg = inverted ? '#0f172a' : '#ffffff'
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={title}>
      <rect width="120" height="120" rx="14" fill={bg} />
      <rect x="7" y="7" width="106" height="106" rx="9" fill="none" stroke={fg} strokeWidth="2" />
      <text x="60" y="72" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="40" letterSpacing="1" fill={fg}>
        CWI
      </text>
      <line x1="30" y1="86" x2="90" y2="86" stroke={fg} strokeWidth="1.5" />
    </svg>
  )
}

/** Mark + company name, for letterheads. */
export function LogoLockup({ className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark className="size-16 shrink-0" />
      <div className="leading-tight" style={{ fontFamily: SERIF }}>
        <div className="text-xl font-bold tracking-wide text-slate-900">CUSTOM WEATHERSTRIP, INC.</div>
        <div className="text-base text-slate-700 italic">Doors &amp; Windows</div>
      </div>
    </div>
  )
}

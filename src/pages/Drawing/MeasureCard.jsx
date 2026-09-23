import { PrintIcon } from '../../components/icons'
import { Button, PageHeader } from '../../components/ui'

// Printable CWI measurement card (US letter). All SVG units are inches.
// The 4 target centers sit exactly 7.000" × 9.500" apart — these are the
// "CWI card" dimensions in referenceCards.js.
const TARGETS = [
  [0.75, 0.75],
  [7.75, 0.75],
  [7.75, 10.25],
  [0.75, 10.25],
]
const FONT = 'Helvetica, Arial, sans-serif'

function Target({ x, y }) {
  const r = 0.32
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke="#000" strokeWidth="0.025" />
      {/* Checkered quadrants make the exact center easy to spot, even in a blurry photo */}
      <path d={`M ${x} ${y} L ${x + r} ${y} A ${r} ${r} 0 0 0 ${x} ${y - r} Z`} fill="#000" />
      <path d={`M ${x} ${y} L ${x - r} ${y} A ${r} ${r} 0 0 0 ${x} ${y + r} Z`} fill="#000" />
      <path d={`M ${x - r - 0.18} ${y} H ${x + r + 0.18} M ${x} ${y - r - 0.18} V ${y + r + 0.18}`} stroke="#000" strokeWidth="0.012" />
    </g>
  )
}

function Text({ x, y, size, weight = 400, anchor = 'start', fill = '#0f172a', children }) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} textAnchor={anchor} fill={fill} fontFamily={FONT}>
      {children}
    </text>
  )
}

export default function MeasureCard() {
  // Each step is one or two printed lines
  const steps = [
    ['Print on US letter paper at 100% ("Actual size" — not "Fit to page").'],
    ['Check the 6-inch bar below with a tape measure. If it is not exactly 6", reprint.'],
    ['Tape the card flat on the wall or door frame, right beside the opening —', 'on the same flat surface you are measuring. Card stock keeps it flat.'],
    ['Take one photo showing the whole opening and all 4 round targets.'],
    ['In the app: Trace with card → CWI card. Put the blue points on the target centers.'],
  ]
  let lineNo = 0

  return (
    <div className="px-0 print:p-0">
      <style>{'@page { size: letter portrait; margin: 0; }'}</style>

      <div className="print:hidden">
        <PageHeader title="Measurement card" subtitle="Print it, tape it beside the opening, photograph both" back />
        <div className="space-y-3 px-4 pb-4 text-sm text-slate-600">
          <p>
            The card gives photos a known size so traced measurements come out in real inches. Print it from a computer if you
            can, at <strong>100% / Actual size</strong>, then check the 6-inch bar with a tape.
          </p>
          <Button className="w-full" onClick={() => window.print()}>
            <PrintIcon className="size-5" /> Print card
          </Button>
        </div>
      </div>

      <svg
        viewBox="0 0 8.5 11"
        className="mx-auto block h-auto w-full max-w-md border border-slate-300 bg-white print:h-[11in] print:w-[8.5in] print:max-w-none print:border-0"
        role="img"
        aria-label="CWI measurement card"
      >
        <rect width="8.5" height="11" fill="#fff" />

        {/* Guide lines between target centers */}
        <path d="M 0.75 0.75 H 7.75 V 10.25 H 0.75 Z" fill="none" stroke="#94a3b8" strokeWidth="0.01" strokeDasharray="0.08 0.06" />
        <Text x={4.25} y={0.62} size={0.13} anchor="middle" fill="#475569">
          7.000 in between target centers
        </Text>
        <g transform="rotate(-90 0.62 5.5)">
          <Text x={0.62} y={5.5} size={0.13} anchor="middle" fill="#475569">
            9.500 in between target centers
          </Text>
        </g>

        {TARGETS.map(([x, y]) => (
          <Target key={`${x}-${y}`} x={x} y={y} />
        ))}

        <Text x={4.25} y={2.05} size={0.62} weight={900} anchor="middle">
          CWI
        </Text>
        <Text x={4.25} y={2.55} size={0.3} weight={700} anchor="middle">
          MEASUREMENT CARD
        </Text>
        <Text x={4.25} y={2.9} size={0.16} anchor="middle" fill="#475569">
          Custom Weatherstrip, Inc. · CWI Field App
        </Text>

        {steps.flatMap((lines, i) =>
          lines.map((line, j) => (
            <Text key={line} x={j === 0 ? 1.35 : 1.58} y={3.75 + lineNo++ * 0.36} size={0.15} fill="#1e293b">
              {j === 0 ? `${i + 1}.  ${line}` : line}
            </Text>
          )),
        )}

        {/* 6-inch check bar */}
        <g>
          <rect x={1.25} y={6.9} width={6} height={0.16} fill="#0f172a" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <g key={i}>
              <path d={`M ${1.25 + i} 6.72 V 7.24`} stroke="#0f172a" strokeWidth="0.015" />
              <Text x={1.25 + i} y={7.45} size={0.14} anchor="middle">
                {i}
              </Text>
            </g>
          ))}
          <Text x={4.25} y={7.75} size={0.15} weight={700} anchor="middle">
            This bar must measure exactly 6 inches
          </Text>
        </g>

        <Text x={4.25} y={9.2} size={0.13} anchor="middle" fill="#475569">
          Keep the card flat and the whole opening in the photo. Stand back and hold the phone level.
        </Text>
      </svg>
    </div>
  )
}

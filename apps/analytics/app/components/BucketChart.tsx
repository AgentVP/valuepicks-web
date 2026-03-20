'use client'

import type { BucketStat } from '@/lib/goalTrackingUtils'

export type BucketChartDatum = BucketStat & { roiPct?: number }

interface BucketChartProps {
  title: string
  data: BucketChartDatum[]
  betType: 'over' | 'under'
  /** Optional formatter for bucket cell (e.g. EV % "0-5%", "70%+"). */
  bucketLabel?: (bucket: number) => string
}

export default function BucketChart({ title, data, bucketLabel }: BucketChartProps) {
  const showRoi = data.length > 0 && data.some((d) => d.roiPct != null)
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden shadow-lg">
      <h2 className="text-lg font-bold text-white text-center py-3 border-b border-[var(--card-border)] bg-[var(--card)]/80">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
              <th className="text-left py-2.5 px-3 text-[var(--ice)]/90 font-semibold">Bucket</th>
              <th className="text-right py-2.5 px-3 text-[var(--ice)]/90 font-semibold">Total Bets</th>
              <th className="text-right py-2.5 px-3 text-[var(--ice)]/90 font-semibold">Wins</th>
              <th className="text-right py-2.5 px-3 text-[var(--ice)]/90 font-semibold">Losses</th>
              <th className="text-right py-2.5 px-3 text-[var(--ice)]/90 font-semibold">Win %</th>
              {showRoi && (
                <th className="text-right py-2.5 px-3 text-[var(--ice)]/90 font-semibold">ROI</th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => {
              const losses = d.total - d.wins
              const highlight = showRoi && d.roiPct != null
                ? d.roiPct > 0 && d.total > 0
                : d.winPct > 58 && d.total > 0
              return (
                <tr
                  key={d.bucket}
                  className={`border-b border-[var(--card-border)]/50 ${
                    highlight ? 'bg-[var(--win)]/15' : ''
                  }`}
                >
                  <td className="py-2 px-3 text-[var(--ice)] font-medium">{bucketLabel ? bucketLabel(d.bucket) : d.bucket}</td>
                  <td className="py-2 px-3 text-right text-[var(--ice)]/90">{d.total}</td>
                  <td className="py-2 px-3 text-right text-[var(--ice)]/90">{d.wins}</td>
                  <td className="py-2 px-3 text-right text-[var(--ice)]/90">{losses}</td>
                  <td className="py-2 px-3 text-right text-[var(--ice)]/90">
                    {d.total > 0 ? `${d.winPct}%` : '—'}
                  </td>
                  {showRoi && (
                    <td className={`py-2 px-3 text-right font-semibold ${d.roiPct != null && d.roiPct > 0 && d.total > 0 ? 'text-[var(--win)]' : 'text-[var(--ice)]/90'}`}>
                      {d.total > 0 && d.roiPct != null ? `${d.roiPct > 0 ? '+' : ''}${d.roiPct}%` : '—'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--ice)]/60 text-center py-2">
        {showRoi ? 'Rows with positive ROI highlighted in green.' : 'Rows with Win % &gt;58% highlighted in green.'}
      </p>
    </div>
  )
}

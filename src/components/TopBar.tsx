import { useEffect, useState } from 'react'
import type { SessionState } from '../hooks/useTutorSession'
import { STATUS } from '../lib/status'

interface Props {
  title: string
  state: SessionState
  startedAt: number | null
  onEnd: () => void
  onSimulateDrop?: () => void
}

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function TopBar({ title, state, startedAt, onEnd, onSimulateDrop }: Props) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (startedAt === null) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [startedAt])

  const status = STATUS[state]
  const sessionActive = state !== 'idle' && state !== 'connecting'

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-5 backdrop-blur">
      <div className="flex items-center gap-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Lesson</span>
        <h1 className="text-lg font-semibold text-slate-100">{title}</h1>
        <span className={`flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium ${status.text}`}>
          <span className={`h-2 w-2 rounded-full ${status.dot} ${status.pulse ? 'animate-pulse' : ''}`} />
          {status.label}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {import.meta.env.DEV && onSimulateDrop && sessionActive && (
          <button
            onClick={onSimulateDrop}
            className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
            title="Dev only: simulate a dropped avatar connection"
          >
            Simulate drop
          </button>
        )}
        <span className="font-mono text-sm tabular-nums text-slate-300" aria-label="Session timer">
          {startedAt === null ? '00:00' : formatElapsed(now - startedAt)}
        </span>
        <button
          onClick={onEnd}
          className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500"
        >
          End Session
        </button>
      </div>
    </header>
  )
}

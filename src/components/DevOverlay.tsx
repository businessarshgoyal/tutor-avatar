import { useEffect, useRef, useState } from 'react'
import type { LatencySample } from '../hooks/useTutorSession'
import type { AvatarProviderKind, RawAvatarEvent } from '../providers'

interface Props {
  avatarKind: AvatarProviderKind
  events: RawAvatarEvent[]
  latency: LatencySample | null
  onClear: () => void
}

const SOURCE_COLORS: Record<string, string> = {
  synthesia: 'text-fuchsia-300',
  livekit: 'text-sky-300',
  speech: 'text-emerald-300',
  tts: 'text-amber-300',
  server: 'text-slate-300',
  latency: 'text-rose-300',
}

function fmt(payload: unknown): string {
  if (payload === undefined) return ''
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

/** Dev-only: raw transport payloads (LiveKit / Synthesia RPCs / speech) plus response latency. */
export function DevOverlay({ avatarKind, events, latency, onClear }: Props) {
  const [open, setOpen] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [events, open])

  return (
    <div className="fixed right-3 bottom-3 z-50 w-[520px] max-w-[45vw] rounded-lg border border-slate-700/80 bg-slate-950/95 font-mono text-[11px] text-slate-300 shadow-xl backdrop-blur">
      <div className="flex items-center gap-3 border-b border-slate-800 px-3 py-1.5">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-100">
          {open ? '▾' : '▸'} dev
        </button>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">avatar: {avatarKind}</span>
        <span className={latency ? 'text-rose-300' : 'text-slate-500'} title="End of your speech → avatar starts talking">
          latency: {latency ? `${latency.ms} ms` : '—'}
        </span>
        <span className="ml-auto text-slate-500">{events.length} events</span>
        <button type="button" onClick={onClear} className="text-slate-500 hover:text-slate-200">
          clear
        </button>
      </div>
      {open && (
        <div ref={listRef} className="max-h-64 overflow-y-auto px-3 py-2 leading-snug">
          {events.length === 0 && <div className="text-slate-600">No raw events yet.</div>}
          {events.map((e, i) => (
            <div key={`${e.at}-${i}`} className="flex gap-2 whitespace-pre-wrap break-all">
              <span className="shrink-0 text-slate-600">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>
              <span className={`shrink-0 ${SOURCE_COLORS[e.source] ?? 'text-slate-400'}`}>{e.source}</span>
              <span className="text-slate-100">{e.name}</span>
              <span className="text-slate-400">{fmt(e.payload)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

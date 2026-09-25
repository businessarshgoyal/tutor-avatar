import type { SessionState } from '../hooks/useTutorSession'

export interface StatusStyle {
  label: string
  ring: string
  dot: string
  text: string
  pulse: boolean
}

export const STATUS: Record<SessionState, StatusStyle> = {
  idle: { label: 'Idle', ring: 'ring-slate-600', dot: 'bg-slate-500', text: 'text-slate-400', pulse: false },
  connecting: { label: 'Connecting', ring: 'ring-amber-400', dot: 'bg-amber-400', text: 'text-amber-300', pulse: true },
  listening: { label: 'Listening', ring: 'ring-emerald-400', dot: 'bg-emerald-400', text: 'text-emerald-300', pulse: false },
  thinking: { label: 'Thinking', ring: 'ring-violet-400', dot: 'bg-violet-400', text: 'text-violet-300', pulse: true },
  speaking: { label: 'Speaking', ring: 'ring-sky-400', dot: 'bg-sky-400', text: 'text-sky-300', pulse: true },
  error: { label: 'Error', ring: 'ring-rose-500', dot: 'bg-rose-500', text: 'text-rose-300', pulse: false },
  reconnecting: { label: 'Reconnecting', ring: 'ring-orange-400', dot: 'bg-orange-400', text: 'text-orange-300', pulse: true },
}

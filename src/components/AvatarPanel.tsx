import { useEffect, useRef } from 'react'
import type { SessionState } from '../hooks/useTutorSession'
import { STATUS } from '../lib/status'
import type { AvatarProvider } from '../providers'

interface Props {
  avatar: AvatarProvider
  state: SessionState
  micOn: boolean
  errorMessage: string | null
  onReconnect: () => void
}

export function AvatarPanel({ avatar, state, micOn, errorMessage, onReconnect }: Props) {
  const mount = useRef<HTMLDivElement>(null)
  const status = STATUS[state]

  useEffect(() => {
    if (!mount.current) return
    avatar.attach(mount.current)
    return () => avatar.detach()
  }, [avatar])

  return (
    <section className="flex min-h-0 flex-1 flex-col p-5" aria-label="Avatar">
      <div
        className={`relative flex-1 overflow-hidden rounded-2xl bg-slate-950 ring-4 transition-shadow duration-500 ${status.ring} ${
          status.pulse ? 'animate-[ringpulse_1.8s_ease-in-out_infinite]' : ''
        }`}
      >
        <div ref={mount} className="absolute inset-0" />

        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-medium text-white">
          <span className={`h-2.5 w-2.5 rounded-full ${status.dot} ${status.pulse ? 'animate-pulse' : ''}`} />
          {status.label}
        </div>

        {micOn && state !== 'idle' && (
          <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm text-white">
            <span className="relative flex h-3 w-3">
              {state === 'listening' && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
            </span>
            Mic on
          </div>
        )}

        {(state === 'connecting' || state === 'reconnecting') && (
          <Overlay>
            <Spinner />
            <p className="text-lg text-slate-100">{state === 'connecting' ? 'Connecting to your tutor…' : 'Connection dropped, reconnecting…'}</p>
          </Overlay>
        )}

        {state === 'error' && (
          <Overlay>
            <p className="text-lg font-medium text-rose-300">Something went wrong</p>
            {errorMessage && <p className="max-w-md text-center text-sm text-slate-300">{errorMessage}</p>}
            <button onClick={onReconnect} className="mt-2 rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white">
              Try to reconnect
            </button>
          </Overlay>
        )}
      </div>
    </section>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 backdrop-blur-sm">{children}</div>
}

function Spinner() {
  return <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-600 border-t-slate-100" />
}

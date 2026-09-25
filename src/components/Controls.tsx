import { useState } from 'react'
import type { SessionState } from '../hooks/useTutorSession'

interface Props {
  state: SessionState
  micOn: boolean
  micError: string | null
  onToggleMic: () => void
  onSend: (text: string) => void
  onInterrupt: () => void
}

export function Controls({ state, micOn, micError, onToggleMic, onSend, onInterrupt }: Props) {
  const [text, setText] = useState('')
  const canTalk = state === 'listening' || state === 'thinking' || state === 'speaking'
  const canInterrupt = state === 'speaking' || state === 'thinking'
  const listening = micOn && state === 'listening'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || !canTalk) return
    onSend(text)
    setText('')
  }

  return (
    <div className="shrink-0 border-t border-slate-800 bg-slate-900/60 px-5 py-3">
      <form onSubmit={submit} className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMic}
          disabled={!canTalk}
          aria-pressed={micOn}
          aria-label={micOn ? 'Turn microphone off' : 'Turn microphone on'}
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
            micOn ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
          }`}
        >
          {listening && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />}
          <MicIcon muted={!micOn} />
        </button>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!canTalk}
          placeholder={micOn ? 'Mic is on — or type your question…' : 'Type your question…'}
          className="h-11 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!canTalk || !text.trim()}
          className="h-11 rounded-lg bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
        >
          Send
        </button>
        <button
          type="button"
          onClick={onInterrupt}
          disabled={!canInterrupt}
          className="h-11 rounded-lg border border-amber-500/60 px-4 text-sm font-medium text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
        >
          I didn't get that
        </button>
      </form>
      {micError && <p className="mt-2 text-xs text-rose-300">{micError}</p>}
    </div>
  )
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="relative h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      {muted && <path d="M4 4l16 16" />}
    </svg>
  )
}

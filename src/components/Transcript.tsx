import { useEffect, useRef } from 'react'
import type { SessionState, TranscriptMessage } from '../hooks/useTutorSession'

interface Props {
  messages: TranscriptMessage[]
  state: SessionState
}

export function Transcript({ messages, state }: Props) {
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, state])

  return (
    <section className="flex min-h-0 flex-1 flex-col border-l border-slate-800 bg-slate-900/40" aria-label="Transcript">
      <div className="flex h-11 shrink-0 items-center border-b border-slate-800 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
        Live transcript
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <p className="text-sm text-slate-500">Your conversation will appear here.</p>}
        {messages.map((m) => (m.role === 'student' ? <StudentBubble key={m.id} message={m} /> : <TutorBubble key={m.id} message={m} />))}
        {state === 'thinking' && (
          <div className="flex items-center gap-1.5 pl-1 text-violet-300" aria-label="Tutor is thinking">
            <Dot delay="0ms" />
            <Dot delay="150ms" />
            <Dot delay="300ms" />
          </div>
        )}
        <div ref={bottom} />
      </div>
    </section>
  )
}

function StudentBubble({ message }: { message: TranscriptMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-600/90 px-4 py-2.5 text-sm text-white shadow">
        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-100/80">You</div>
        {message.sentences.join(' ')}
      </div>
    </div>
  )
}

function TutorBubble({ message }: { message: TranscriptMessage }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-slate-700/80 bg-slate-800 px-4 py-2.5 text-sm leading-relaxed text-slate-200 shadow">
        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300/80">Tutor</div>
        <p>
          {message.sentences.map((s, i) => {
            const current = i === message.speakingIndex
            const cutHere = message.interruptedAt === i
            return (
              <span key={i}>
                <span
                  className={`rounded px-0.5 transition-colors duration-300 ${
                    current ? 'bg-sky-400/25 text-sky-100' : cutHere ? 'text-slate-400' : ''
                  }`}
                >
                  {s}
                </span>
                {cutHere && (
                  <span className="mx-1 inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                    interrupted
                  </span>
                )}{' '}
              </span>
            )
          })}
        </p>
      </div>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: delay }} />
}

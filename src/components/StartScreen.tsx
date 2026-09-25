interface Props {
  title: string
  onStart: () => void
}

export function StartScreen({ title, onStart }: Props) {
  return (
    <main className="flex h-full items-center justify-center bg-slate-950 text-slate-100">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Lesson</p>
        <h1 className="mt-2 text-4xl font-bold">{title}</h1>
        <p className="mt-4 text-slate-400">
          Talk with your AI tutor face to face. Ask questions out loud or by typing, and interrupt any time you get lost.
        </p>
        <ul className="mt-6 space-y-2 text-left text-sm text-slate-300">
          <li className="flex gap-2"><span className="text-emerald-400">•</span> Base cases and recursive cases</li>
          <li className="flex gap-2"><span className="text-emerald-400">•</span> Factorial and Fibonacci in Python, C++ and Java</li>
          <li className="flex gap-2"><span className="text-emerald-400">•</span> Recursion vs. loops and stack overflows</li>
        </ul>
        <button
          onClick={onStart}
          className="mt-8 w-full rounded-xl bg-sky-600 py-3 text-lg font-semibold text-white transition hover:bg-sky-500"
        >
          Start Lesson
        </button>
        <p className="mt-3 text-xs text-slate-500">You'll be asked for microphone access once the session begins.</p>
      </div>
    </main>
  )
}

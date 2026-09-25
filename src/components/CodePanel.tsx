import { useState } from 'react'
import { Highlight, Prism, themes } from 'prism-react-renderer'
import type { CodeExample, Language } from '../providers'

// prism-react-renderer bundles python and cpp; java is loaded from prismjs.
;(globalThis as typeof globalThis & { Prism: typeof Prism }).Prism = Prism
await import('prismjs/components/prism-java')

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'python', label: 'Python' },
  { id: 'cpp', label: 'C++' },
  { id: 'java', label: 'Java' },
]

interface Props {
  example: CodeExample
}

export function CodePanel({ example }: Props) {
  const [lang, setLang] = useState<Language>('python')
  const [copied, setCopied] = useState(false)
  const code = example.code[lang]

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-t border-slate-800 bg-slate-950" aria-label="Code">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-800 px-4">
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{example.title}</span>
          <div className="flex gap-1" role="tablist">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                role="tab"
                aria-selected={lang === l.id}
                onClick={() => setLang(l.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  lang === l.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={copy}
          className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-white"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <Highlight theme={themes.nightOwl} code={code} language={lang}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="flex-1 overflow-auto px-4 py-3 font-mono text-[13px] leading-6">
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} className="table-row">
                <span className="table-cell select-none pr-4 text-right text-slate-600">{i + 1}</span>
                <span className="table-cell">
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </section>
  )
}

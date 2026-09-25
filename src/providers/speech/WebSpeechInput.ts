import { Emitter } from '../emitter'
import type { SpeechInputEventName, SpeechInputEvents, SpeechInputProvider } from './SpeechInputProvider'

interface RecognitionAlternative {
  transcript: string
  confidence: number
}
interface RecognitionResult {
  isFinal: boolean
  length: number
  [index: number]: RecognitionAlternative
}
interface RecognitionResultList {
  length: number
  [index: number]: RecognitionResult
}
interface RecognitionResultEvent extends Event {
  resultIndex: number
  results: RecognitionResultList
}
interface RecognitionErrorEvent extends Event {
  error: string
  message: string
}
interface Recognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: ((e: Event) => void) | null
  onend: ((e: Event) => void) | null
  onresult: ((e: RecognitionResultEvent) => void) | null
  onerror: ((e: RecognitionErrorEvent) => void) | null
  onspeechstart: ((e: Event) => void) | null
  onspeechend: ((e: Event) => void) | null
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Ignore interim results shorter than this so a cough or echo doesn't count as an interruption. */
const MIN_INTERIM_CHARS = 4

/**
 * Browser Web Speech API (Chrome/Edge). Restarts itself while active because the
 * engine stops after silence; `stop()` flips `active` so the restart loop exits.
 */
export class WebSpeechInput implements SpeechInputProvider {
  readonly supported = recognitionCtor() !== null
  private emitter = new Emitter<SpeechInputEvents>()
  private rec: Recognition | null = null
  private active = false
  private inUtterance = false

  async start(): Promise<void> {
    if (this.active) return
    const Ctor = recognitionCtor()
    if (!Ctor) {
      this.emitter.emit('onError', 'Speech recognition is not supported in this browser. Please type your questions.')
      return
    }
    this.active = true
    this.spawn(Ctor)
  }

  async stop(): Promise<void> {
    this.active = false
    this.inUtterance = false
    this.rec?.abort()
    this.rec = null
  }

  on<E extends SpeechInputEventName>(event: E, handler: NonNullable<SpeechInputEvents[E]>): () => void {
    return this.emitter.on(event, handler)
  }

  private spawn(Ctor: RecognitionCtor) {
    const rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const text = result[0]?.transcript.trim() ?? ''
        this.emitter.emit('onRaw', 'speech.result', { text, isFinal: result.isFinal, confidence: result[0]?.confidence })
        if (result.isFinal) {
          const at = performance.now()
          this.inUtterance = false
          this.emitter.emit('onSpeechEnd', at)
          if (text) this.emitter.emit('onTranscript', text)
        } else if (!this.inUtterance && text.length >= MIN_INTERIM_CHARS) {
          this.inUtterance = true
          this.emitter.emit('onSpeechStart')
        }
      }
    }
    rec.onspeechstart = () => this.emitter.emit('onRaw', 'speech.speechstart')
    rec.onspeechend = () => this.emitter.emit('onRaw', 'speech.speechend')
    rec.onerror = (e) => {
      this.emitter.emit('onRaw', 'speech.error', { error: e.error, message: e.message })
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.active = false
        this.emitter.emit('onError', 'Microphone access was denied. You can still type your questions below.')
      } else if (e.error === 'audio-capture') {
        this.active = false
        this.emitter.emit('onError', 'No microphone found. You can still type your questions below.')
      }
      // 'no-speech' / 'network' / 'aborted' fall through to onend, which restarts while active.
    }
    rec.onend = () => {
      this.emitter.emit('onRaw', 'speech.end')
      if (this.rec !== rec) return
      this.rec = null
      this.inUtterance = false
      if (this.active) setTimeout(() => this.active && !this.rec && this.spawn(Ctor), 150)
    }
    this.rec = rec
    try {
      rec.start()
    } catch {
      // start() throws if called while already started; onend will reschedule.
    }
  }
}

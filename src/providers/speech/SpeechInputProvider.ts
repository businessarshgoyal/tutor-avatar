/**
 * Microphone + speech-to-text. Synthesia does not do STT, so the real avatar provider
 * composes one of these; the mock avatar provides its own simulated questions.
 */
export interface SpeechInputEvents {
  /** The student began an utterance (first interim result / VAD). */
  onSpeechStart: () => void
  /** A final transcript for one utterance. */
  onTranscript: (text: string) => void
  /** The utterance ended; `at` is performance.now() at that moment. */
  onSpeechEnd: (at: number) => void
  onError: (message: string) => void
  onRaw?: (name: string, payload?: unknown) => void
}

export type SpeechInputEventName = keyof SpeechInputEvents

export interface SpeechInputProvider {
  readonly supported: boolean
  start(): Promise<void>
  stop(): Promise<void>
  on<E extends SpeechInputEventName>(event: E, handler: NonNullable<SpeechInputEvents[E]>): () => void
}

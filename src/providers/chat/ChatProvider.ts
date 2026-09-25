export type Language = 'python' | 'cpp' | 'java'

export interface CodeExample {
  title: string
  code: Record<Language, string>
}

export interface ChatMessage {
  role: 'student' | 'tutor'
  content: string
}

export interface ChatChunk {
  /** One complete sentence, ready to be spoken. */
  sentence: string
  /** Optional code the tutor wants shown alongside this sentence. */
  code?: CodeExample
}

export interface ChatProvider {
  /**
   * Streams the tutor's reply one sentence at a time. Consumers stop
   * iterating (or abort the signal) to interrupt generation.
   */
  stream(history: ChatMessage[], signal?: AbortSignal): AsyncIterable<ChatChunk>
}

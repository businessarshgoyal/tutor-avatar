export type AvatarErrorCode =
  | 'disconnected'
  | 'permission'
  | 'quota'
  | 'concurrency'
  | 'avatar_lost'
  | 'unknown'

export interface AvatarError {
  code: AvatarErrorCode
  message: string
}

export interface SpeakingEndInfo {
  /** True when playback was cut short by stopSpeaking(). */
  interrupted: boolean
  /** Seconds of audio actually played, when the backend reports it. */
  playbackPosition?: number
}

/** Untyped payload for the dev overlay: whatever the underlying transport surfaced. */
export interface RawAvatarEvent {
  at: number
  source: string
  name: string
  payload?: unknown
}

export interface AvatarEvents {
  onUserSpeech: (text: string) => void
  /** The student started talking while the tutor was speaking. */
  onInterrupt: () => void
  onSpeakingStart: () => void
  onSpeakingEnd: (info: SpeakingEndInfo) => void
  onError: (error: AvatarError) => void
  onSpeakingProgress?: (spokenText: string) => void
  /** Emitted when the user's utterance ends (used to measure response latency). */
  onUserSpeechEnd?: (at: number) => void
  onRawEvent?: (event: RawAvatarEvent) => void
}

export type AvatarEventName = keyof AvatarEvents

export interface AvatarProvider {
  startSession(): Promise<void>
  endSession(): Promise<void>
  /** Resolves when the utterance has finished playing (or was interrupted). */
  speak(text: string): Promise<void>
  stopSpeaking(): Promise<void>
  startListening(): Promise<void>
  stopListening(): Promise<void>
  /** Typed fallback: treated exactly like recognized speech. */
  sendUserText(text: string): void
  attach(container: HTMLElement): void
  detach(): void
  on<E extends AvatarEventName>(event: E, handler: NonNullable<AvatarEvents[E]>): () => void
  simulateDisconnect?(): void
}

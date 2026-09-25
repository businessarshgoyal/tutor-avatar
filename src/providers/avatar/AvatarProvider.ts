export type AvatarErrorCode = 'disconnected' | 'permission' | 'unknown'

export interface AvatarError {
  code: AvatarErrorCode
  message: string
}

export interface AvatarEvents {
  /** Fired when the student's speech has been transcribed. */
  onUserSpeech: (text: string) => void
  /** Fired when the current utterance was cut off before finishing. */
  onInterrupt: () => void
  onSpeakingStart: () => void
  onSpeakingEnd: () => void
  onError: (error: AvatarError) => void
  /** Optional progress hook: the portion of the utterance spoken so far. */
  onSpeakingProgress?: (spokenText: string) => void
}

export type AvatarEventName = keyof AvatarEvents

export interface AvatarProvider {
  /** Connects to the avatar service. Resolves once the avatar is ready. */
  startSession(): Promise<void>
  endSession(): Promise<void>
  /**
   * Speaks a single utterance. Resolves when speaking finishes or is
   * interrupted. Emits onSpeakingStart / onSpeakingEnd / onInterrupt.
   */
  speak(text: string): Promise<void>
  stopSpeaking(): Promise<void>
  /** Open / close the microphone. Transcripts arrive via onUserSpeech. */
  startListening(): Promise<void>
  stopListening(): Promise<void>
  /** Text fallback for students without a mic; routed through onUserSpeech. */
  sendUserText(text: string): void
  /** Mount point for the avatar's video/image surface. */
  attach(container: HTMLElement): void
  detach(): void
  on<E extends AvatarEventName>(event: E, handler: NonNullable<AvatarEvents[E]>): () => void
  /** Dev-only helper implemented by mocks to test the reconnect flow. */
  simulateDisconnect?(): void
}

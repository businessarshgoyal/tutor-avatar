import type { AvatarProvider } from './avatar/AvatarProvider'
import { MockAvatarProvider } from './avatar/MockAvatarProvider'
import { SynthesiaAvatarProvider } from './avatar/SynthesiaAvatarProvider'
import type { ChatProvider } from './chat/ChatProvider'
import { MockChatProvider } from './chat/MockChatProvider'
import { ServerTtsProvider } from './speech/SpeechSynthesisProvider'
import { WebSpeechInput } from './speech/WebSpeechInput'

export type AvatarProviderKind = 'mock' | 'synthesia'

export interface Providers {
  avatar: AvatarProvider
  chat: ChatProvider
  avatarKind: AvatarProviderKind
}

/**
 * Switch with `VITE_AVATAR_PROVIDER=mock|synthesia` (see .env.example). Defaults to
 * the mock so the app runs offline with no server.
 */
export function resolveAvatarKind(): AvatarProviderKind {
  return import.meta.env.VITE_AVATAR_PROVIDER === 'synthesia' ? 'synthesia' : 'mock'
}

/**
 * Single swap point. Nothing else in the app should import a concrete provider.
 * The brain is still MockChatProvider regardless of the avatar choice.
 */
export function createProviders(kind: AvatarProviderKind = resolveAvatarKind()): Providers {
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8787'
  const avatar: AvatarProvider =
    kind === 'synthesia'
      ? new SynthesiaAvatarProvider({ apiBaseUrl, speechInput: new WebSpeechInput(), tts: new ServerTtsProvider(apiBaseUrl) })
      : new MockAvatarProvider()
  return { avatar, chat: new MockChatProvider(), avatarKind: kind }
}

export type { AvatarProvider, AvatarError, AvatarEvents, RawAvatarEvent, SpeakingEndInfo } from './avatar/AvatarProvider'
export type { ChatProvider, ChatChunk, ChatMessage, CodeExample, Language } from './chat/ChatProvider'

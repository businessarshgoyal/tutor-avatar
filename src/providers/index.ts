import type { AvatarProvider } from './avatar/AvatarProvider'
import { MockAvatarProvider } from './avatar/MockAvatarProvider'
import type { ChatProvider } from './chat/ChatProvider'
import { MockChatProvider } from './chat/MockChatProvider'

export interface Providers {
  avatar: AvatarProvider
  chat: ChatProvider
}

/**
 * Single swap point: replace the mocks with the Synthesia SDK adapter and the
 * real LLM client here. Nothing else in the app should import a concrete
 * provider.
 */
export function createProviders(): Providers {
  return {
    avatar: new MockAvatarProvider(),
    chat: new MockChatProvider(),
  }
}

export type { AvatarProvider, AvatarError, AvatarEvents } from './avatar/AvatarProvider'
export type { ChatProvider, ChatChunk, ChatMessage, CodeExample, Language } from './chat/ChatProvider'

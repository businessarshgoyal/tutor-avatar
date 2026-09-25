# AI Tutor — talking avatar frontend

Vite + React + TypeScript + Tailwind frontend for an AI programming tutor with a
real-time avatar. Everything runs against mock providers today; the real
Synthesia Interactive Avatar SDK and LLM plug in behind two interfaces.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint
```

## Architecture

```
src/providers/
  avatar/AvatarProvider.ts      interface: startSession, endSession, speak, stopSpeaking,
                                startListening, stopListening, sendUserText, attach/detach,
                                events: onUserSpeech, onInterrupt, onSpeakingStart,
                                        onSpeakingEnd, onError, (onSpeakingProgress)
  avatar/MockAvatarProvider.ts  placeholder avatar, timed word-by-word "speech",
                                simulated mic transcripts, simulateDisconnect()
  chat/ChatProvider.ts          interface: stream(history, signal) -> AsyncIterable<ChatChunk>
  chat/MockChatProvider.ts      canned recursion answers streamed sentence by sentence
  index.ts                      createProviders() — the single swap point
src/hooks/useTutorSession.ts    session state machine (idle → connecting → listening ⇄
                                thinking ⇄ speaking, plus error / reconnecting),
                                transcript, interrupt handling, mic permission flow
src/components/                 TopBar, AvatarPanel, Transcript, CodePanel, Controls, StartScreen
```

Components and the session hook only depend on `AvatarProvider` / `ChatProvider`.
To go live, implement both interfaces against the real services and return them
from `createProviders()`.

### Swapping in Synthesia

- `attach(container)` is where the SDK should mount its `<video>`.
- `speak(text)` should resolve when the utterance finishes or is cut off; emit
  `onSpeakingStart` / `onSpeakingEnd`, and `onInterrupt` when `stopSpeaking()`
  cuts an utterance short.
- Route STT transcripts through `onUserSpeech`; typed input arrives via
  `sendUserText`.
- Emit `onError({ code: 'disconnected' })` on a dropped stream — the hook
  retries `startSession()` and shows the reconnect state.

### Interrupt semantics

Any new student input (mic, text, or the "I didn't get that" button) while the
tutor is thinking/speaking calls `stopSpeaking()`, marks the current tutor
message with an `interrupted` tag at the sentence that was cut off, aborts the
chat stream, and immediately starts streaming the answer to the new question.

# AI Tutor — talking avatar frontend

Vite + React + TypeScript + Tailwind frontend for an AI programming tutor with a
real-time avatar. The avatar can be the offline mock or the real Synthesia
Interactive Avatar (via LiveKit); the brain is still `MockChatProvider`.

```bash
npm install
npm run dev      # http://localhost:5173 — mock avatar, no server needed
npm run build    # tsc -b && vite build
npm run lint
```

### Real avatar

```bash
cp server/.env.example server/.env   # fill in Synthesia / LiveKit / OpenAI keys (server-only)
(cd server && npm install && npm run dev)   # http://localhost:8787
cp .env.example .env && sed -i 's/=mock/=synthesia/' .env
npm run dev
```

`VITE_AVATAR_PROVIDER=mock|synthesia` picks the avatar. In dev a bottom-right
overlay shows raw LiveKit/Synthesia/speech payloads and the latency from the end
of your utterance to the avatar starting to talk. Speech input uses the browser
Web Speech API (Chrome/Edge); typing always works.

How the real path works (see `docs/synthesia-mapping.md` for the full write-up):
the server mints LiveKit tokens, creates a room and asks Synthesia to join it
(`POST /api/interactive-avatars/sessions`); the browser joins with `livekit-client`,
attaches the avatar's video/audio tracks in the avatar panel, streams TTS PCM to
the avatar over the `lk.audio_stream` byte stream, receives
`lk.playback_started/finished` RPCs, and interrupts with `lk.clear_buffer`.
On tab close a `sendBeacon` hits `POST /api/session/:id/end` to tear the room down.

## Architecture

```
src/providers/
  avatar/AvatarProvider.ts      interface: startSession, endSession, speak, stopSpeaking,
                                startListening, stopListening, sendUserText, attach/detach,
                                events: onUserSpeech, onInterrupt, onSpeakingStart,
                                        onSpeakingEnd, onError, (onSpeakingProgress)
  avatar/MockAvatarProvider.ts  placeholder avatar, timed word-by-word "speech",
                                simulated mic transcripts, simulateDisconnect()
  avatar/SynthesiaAvatarProvider.ts  livekit-client room + Synthesia avatar data-stream protocol
  speech/SpeechInputProvider.ts  STT interface (WebSpeechInput = browser Web Speech API)
  speech/SpeechSynthesisProvider.ts  TTS interface (ServerTtsProvider streams PCM from /api/tts)
  chat/ChatProvider.ts          interface: stream(history, signal) -> AsyncIterable<ChatChunk>
  chat/MockChatProvider.ts      canned recursion answers streamed sentence by sentence
  index.ts                      createProviders() — the single swap point
src/hooks/useTutorSession.ts    session state machine (idle → connecting → listening ⇄
                                thinking ⇄ speaking, plus error / reconnecting),
                                transcript, interrupt handling, mic permission flow
src/components/                 TopBar, AvatarPanel, Transcript, CodePanel, Controls, StartScreen, DevOverlay
server/                         Express: POST /api/session, POST /api/session/:id/end,
                                POST /api/tts, CORS + rate limits + retries + redacted logs
```

Components and the session hook only depend on `AvatarProvider` / `ChatProvider`.
To go live, implement both interfaces against the real services and return them
from `createProviders()`.

### Interrupt semantics

Any new student input (mic, text, or the "I didn't get that" button) while the
tutor is thinking/speaking calls `stopSpeaking()`, marks the current tutor
message with an `interrupted` tag at the sentence that was cut off, aborts the
chat stream, and immediately starts streaming the answer to the new question.

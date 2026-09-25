# Synthesia Interactive Avatar → AvatarProvider mapping

Sources (read 2026-09-25): docs.synthesia.io/reference — `ia-concepts`, `ia-overview`,
`ia-livekit-plugin-reference`, `createinteractiveavatarsession`, `createinteractiveavatar`,
`ia-operational-trust`, `interactive-avatar-minimal-quickstart`; plus the source of
`livekit-plugins-synthesia==1.8.3` and `livekit-agents` (`voice/avatar/_datastream_io.py`)
to confirm the wire protocol the plugin uses.

## 1. How the API actually works

**There is no Synthesia browser SDK, no embed, and no conversational API.** Synthesia only
does one thing: it renders a lip-synced avatar into *your* LiveKit room, driven by *audio
you send it*. Everything else (mic capture, STT, the brain, TTS, interruption) is yours.

```
[your agent (speech audio producer)] --LiveKit byte stream `lk.audio_stream`--> [Synthesia worker]
        ^  RPC lk.playback_started / lk.playback_finished                          |
        |  RPC lk.clear_buffer (interrupt)                                           | publishes lip-synced
        |                                                                            v video+audio tracks
[LiveKit room] <----------------------------------------------------------- [browser: livekit-client]
```

| Concern | What the docs say |
| --- | --- |
| **Session creation** | `POST https://developers.synthesia.io/api/interactive-avatars/sessions` with `{ avatarIds: ["av_…"], livekitUrl: "wss://…", livekitToken }`. **You** mint the LiveKit token for the avatar participant (identity `synthesia-avatar-agent`, kind `agent`, grants publish/subscribe/data, attribute `lk.publish_on_behalf=<identity of the participant that will send audio>`). Returns `201 { id: "ses_…", status: "active", createdAt }`. Errors are RFC 9457 problem+json; branch on `code` (`concurrency_limit`/429, `quota_exceeded`/`feature_not_in_plan`/402, `insufficient_scope`/403). Retry only on 5xx/timeouts, honor `Retry-After`, **reuse the same token when retrying**. Freemium = 1 concurrent session; $0.10/min. |
| **Auth** | `Authorization: Bearer <SYNTHESIA_API_KEY>`, key needs the `interactive_avatars` scope. Docs: "workspace-bound secret, must never reach frontend code." LiveKit API key/secret are also server-only. The browser gets **only** a LiveKit URL + a short-lived participant JWT. There is no Synthesia session token for the browser. |
| **Embedding** | None. "No no-code embed. You build the UI wrapper." The avatar is a normal remote participant; the browser connects with `livekit-client`, subscribes to the `synthesia-avatar-agent` participant's video+audio tracks and attaches them to `<video>`/`<audio>` elements. Token should be minted with `sync_streams: true` to keep A/V in sync. |
| **Teardown** | No DELETE endpoint documented. A session ends when the room disconnects / the avatar participant is removed. Server-side teardown = LiveKit RoomService `deleteRoom` (or `removeParticipant`). |
| **User speech events** | **Not provided by Synthesia.** "No session list, transcript, recording, or webhook/event system. Capture transcripts on your own side via your STT provider." Options: browser Web Speech API, or an STT provider in the agent. |
| **Speaking text** | **Synthesia does not accept text.** It accepts PCM audio over a LiveKit byte stream (topic `lk.audio_stream`, attributes `sample_rate`, `num_channels`, one stream per utterance; closing the stream = end of segment). You need a TTS to turn the mock brain's sentences into audio. The worker calls back `lk.playback_started` / `lk.playback_finished` RPCs on the sender → these are the real `onSpeakingStart` / `onSpeakingEnd`. |
| **Interruption events** | **Not provided.** Interruption is your agent's VAD/turn-detection deciding to cut off; you then RPC `lk.clear_buffer` to the worker, which stops playback and answers `lk.playback_finished { interrupted: true }`. |
| **Errors** | Plugin surfaces only two events: `session_ended` (room disconnected) and `error` (avatar stopped publishing video while room connected). In the browser these are `RoomEvent.Disconnected` and `ParticipantDisconnected` / `TrackUnpublished` for the avatar identity. |
| **Supported path** | Official plugin is **Python only** (`livekit-plugins-synthesia`, `livekit-agents ≥ 1.8.2`); "Node.js agents are not supported." The byte-stream/RPC protocol above is LiveKit's generic avatar protocol (used by all avatar plugins) and is implementable from Node or the browser via `livekit-client`/`livekit-server-sdk`, but it is not documented by Synthesia as a public contract. |

## 2. Mapping to `AvatarProvider`

| Interface member | Synthesia reality | Fit |
| --- | --- | --- |
| `startSession()` | `POST /api/session` on our server → server mints 2 LiveKit tokens (browser + avatar), calls Synthesia, returns `{ livekitUrl, token, roomName, avatarIdentity, sessionId }`. Provider connects the room and waits for the avatar's video track (cold start up to ~30–60 s). | fits |
| `endSession()` | Disconnect room + `sendBeacon('/api/session/:id/end')` → server `deleteRoom`. | fits |
| `attach(container)` / `detach()` | Attach the avatar participant's `RemoteVideoTrack`/`RemoteAudioTrack` to elements inside `container`. Must handle track arriving *after* attach (cold start) and browser autoplay policy (Start Lesson click gives us the user gesture). | fits |
| `speak(text)` | **Does not fit as-is.** Needs text → TTS audio → byte stream. Synthesia has no voice. Something must own TTS. | change |
| `stopSpeaking()` | RPC `lk.clear_buffer` to the avatar + abort in-flight TTS. | fits (once speech pipeline exists) |
| `startListening()` / `stopListening()` / `onUserSpeech` | Not Synthesia. Needs an STT source: browser Web Speech API (Chrome-only, free, no key) or server STT. Currently the mock fakes it. | change (split out) |
| `onInterrupt` | Not a Synthesia event. Fired by us when STT/VAD detects user speech while `speaking`. | change (app-owned) |
| `onSpeakingStart` / `onSpeakingEnd` | Real: `lk.playback_started` / `lk.playback_finished` RPCs from the worker. `onSpeakingEnd` carries `interrupted: boolean` + `playbackPosition`. | fits, enrich payload |
| `onSpeakingProgress(spokenText)` | No word timing from Synthesia. Approximate from `playback_started` time + TTS audio duration (or TTS word timestamps if the provider gives them). | keep, approximate |
| `onError` | `RoomEvent.Disconnected`, avatar `ParticipantDisconnected`/`TrackUnpublished`, token expiry, 402/429 from server. | fits, add codes |
| `sendUserText(text)` | Pure app concern, unchanged. | fits |
| `simulateDisconnect?()` | Dev-only; can `room.disconnect()`. | fits |

## 3. Proposed interface changes

1. **Split speech input out of `AvatarProvider`.** New `SpeechInputProvider { start(); stop(); on('transcript', {text, final}); on('speechStart'); on('speechEnd') }`.
   Implementations: `MockSpeechInput` (today's simulated questions), `WebSpeechInput` (browser
   `SpeechRecognition`). `useTutorSession` derives `onInterrupt` = `speechStart` while state is
   `speaking`, and `onUserSpeech` = final transcript. `speechEnd` timestamp is the start of the
   "end of my speech → avatar starts talking" latency measurement.
2. **Split speech output (TTS) out too.** New `SpeechSynthesisProvider { synthesize(text, signal): AsyncIterable<PcmChunk> }`.
   `SynthesiaAvatarProvider.speak(text)` = `for chunk of tts.synthesize(text) → byteStream.write(chunk)`.
   `AvatarProvider.speak(text)` keeps its signature so components/hook don't change; the TTS
   dependency is injected in `createProviders()`. Needs one TTS key (OpenAI / ElevenLabs /
   Cartesia via our Node server so the key stays server-side) — **there is no key-free option
   that yields raw PCM in the browser** (Web `speechSynthesis` can't be captured).
3. **Enrich events:** `onSpeakingEnd({ interrupted, playbackPosition })`, `onError({ code: 'disconnected' | 'permission' | 'quota' | 'concurrency' | 'avatar_lost' | 'unknown', … })`,
   and `onRawEvent(payload)` for the dev overlay (every RPC, track event, session response).
4. **`startSession()` returns/exposes `sessionInfo`** (`sessionId`, `roomName`) so `endSession`
   and the `sendBeacon` teardown can reference it.

## 4. Architecture options

**A. Documented path (Python agent) — most faithful to the docs.**
`/server` (Node) = browser-facing facade: mints browser token with `RoomAgentDispatch`, rate
limit, CORS, teardown via LiveKit `deleteRoom`. `/agent` (Python) = `livekit-agents` +
`livekit-plugins-synthesia` + STT/TTS via LiveKit Inference (no extra keys). The brain must run
inside the agent → MockChatProvider would need a Python twin, or the agent calls back into a
small `POST /api/brain` on the Node server that streams MockChatProvider's sentences. Sentence
highlighting in the transcript comes over LiveKit transcription text streams. Pros: supported,
best latency, proper VAD/turn detection. Cons: second runtime (Python), brain moves off the
browser, more moving parts than the user asked for.

**B. Node-only, browser drives the avatar directly (what the request literally asks for).**
`/server` (Node) calls Synthesia REST, mints tokens (`publish_on_behalf` = the browser's identity),
proxies TTS. `SynthesiaAvatarProvider` in the browser uses `livekit-client` to render the avatar,
streams TTS PCM to it over `lk.audio_stream`, handles `lk.playback_*` RPCs, sends
`lk.clear_buffer` on interrupt. `WebSpeechInput` handles mic/STT (Chrome). Brain stays
`MockChatProvider` in the browser, untouched. Pros: single extra runtime, mock brain + hook +
components unchanged, matches "fetch session from our backend / mount in our panel / fire our
events". Cons: relies on LiveKit's avatar data-stream protocol which Synthesia documents only
via the Python plugin (risk of breakage if the worker changes contract); STT quality/availability
depends on the browser; still needs a TTS key.

Recommendation: **B** for this milestone (it satisfies steps 2–4 with the existing frontend
architecture and keeps the mock brain), with the interface split in §3 so A can be adopted later
by swapping `createProviders()` only.

## 5. What I need from you to run step 4 (real verification)

- `SYNTHESIA_API_KEY` with the `interactive_avatars` scope, on a plan that includes Interactive Avatars.
- An eligible avatar id (`av_…`) — synthetic or personal avatar, **stock avatars don't work**; create one with `POST /api/interactive-avatars/avatars { sourceId }` and poll until `completed`.
- LiveKit Cloud project: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (free tier is enough).
- One TTS key (recommend `OPENAI_API_KEY` → `gpt-4o-mini-tts`/`tts-1` PCM output; ElevenLabs or Cartesia also fine).
- Which option (A or B) above.

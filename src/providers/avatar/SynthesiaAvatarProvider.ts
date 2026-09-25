import {
  ConnectionState,
  type ByteStreamWriter,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client'
import { Emitter } from '../emitter'
import type { SpeechInputProvider } from '../speech/SpeechInputProvider'
import type { SpeechSynthesisProvider } from '../speech/SpeechSynthesisProvider'
import type { AvatarError, AvatarEventName, AvatarEvents, AvatarProvider } from './AvatarProvider'

/**
 * LiveKit's avatar data-stream protocol, as implemented by `livekit-agents`
 * (`voice/avatar/_datastream_io.py`) and consumed by the Synthesia avatar worker:
 *  - we push 16-bit PCM over a byte stream on `lk.audio_stream`; one stream per utterance,
 *    closing it marks the end of the segment;
 *  - the worker calls back `lk.playback_started` / `lk.playback_finished` RPCs;
 *  - we call `lk.clear_buffer` on the worker to interrupt.
 */
const AUDIO_STREAM_TOPIC = 'lk.audio_stream'
const RPC_PLAYBACK_STARTED = 'lk.playback_started'
const RPC_PLAYBACK_FINISHED = 'lk.playback_finished'
const RPC_CLEAR_BUFFER = 'lk.clear_buffer'

const AVATAR_JOIN_TIMEOUT_MS = 90_000
const AVATAR_WARMUP_MS = 1_500
const CLEAR_BUFFER_ACK_TIMEOUT_MS = 1_500

export interface BrowserSession {
  sessionId: string
  livekitUrl: string
  token: string
  roomName: string
  identity: string
  avatarIdentity: string
  expiresAt: string
}

export interface SynthesiaAvatarProviderOptions {
  apiBaseUrl: string
  speechInput: SpeechInputProvider
  tts: SpeechSynthesisProvider
}

interface PendingUtterance {
  resolve: () => void
  startedAt: number | null
  bytes: number
  sampleRate: number
  channels: number
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class SynthesiaAvatarProvider implements AvatarProvider {
  private emitter = new Emitter<AvatarEvents>()
  private room: Room | null = null
  private session: BrowserSession | null = null
  private video: HTMLVideoElement | null = null
  private attached: RemoteTrack[] = []
  private ttsAbort: AbortController | null = null
  private writer: ByteStreamWriter | null = null
  private pending: PendingUtterance | null = null
  private speaking = false
  private listening = false
  private lastUserSpeechEnd: number | null = null
  private ending = false
  private readonly opts: SynthesiaAvatarProviderOptions
  private readonly beacon = () => this.sendTeardownBeacon()

  constructor(opts: SynthesiaAvatarProviderOptions) {
    this.opts = opts
    const { speechInput } = opts
    speechInput.on('onSpeechStart', () => {
      this.raw('speech', 'speechStart')
      if (this.speaking) {
        this.emitter.emit('onInterrupt')
        void this.stopSpeaking()
      }
    })
    speechInput.on('onSpeechEnd', (at) => {
      this.lastUserSpeechEnd = at
      this.emitter.emit('onUserSpeechEnd', at)
    })
    speechInput.on('onTranscript', (text) => {
      this.raw('speech', 'transcript', { text })
      this.emitter.emit('onUserSpeech', text)
    })
    speechInput.on('onError', (message) => {
      this.listening = false
      this.emitter.emit('onError', { code: 'permission', message })
    })
    speechInput.on('onRaw', (name, payload) => this.raw('speech', name, payload))
  }

  // ---- session -----------------------------------------------------------

  async startSession(): Promise<void> {
    await this.teardownRoom()
    this.ending = false

    const res = await fetch(`${this.opts.apiBaseUrl}/api/session`, { method: 'POST' })
    const body: unknown = await res.json().catch(() => null)
    const redacted = body && typeof body === 'object' && 'token' in body ? { ...body, token: '<redacted>' } : body
    this.raw('server', 'POST /api/session', { status: res.status, body: redacted })
    if (!res.ok) {
      const err = (body ?? {}) as { error?: string; message?: string }
      throw Object.assign(new Error(err.message ?? `Could not start avatar session (${res.status})`), { code: mapServerError(res.status, err.error) })
    }
    const session = body as BrowserSession
    this.session = session

    const room = new Room({ adaptiveStream: true, dynacast: false })
    this.room = room
    this.wireRoom(room, session)

    await room.connect(session.livekitUrl, session.token)
    this.raw('livekit', 'connected', { room: session.roomName, identity: session.identity })
    window.addEventListener('pagehide', this.beacon)

    await this.waitForAvatar(room, session.avatarIdentity)
  }

  async endSession(): Promise<void> {
    this.ending = true
    await this.stopSpeaking()
    await this.stopListening()
    const session = this.session
    await this.teardownRoom()
    if (session) {
      await fetch(`${this.opts.apiBaseUrl}/api/session/${encodeURIComponent(session.sessionId)}/end`, { method: 'POST', keepalive: true }).catch(() => undefined)
      this.raw('server', 'POST /api/session/:id/end', { sessionId: session.sessionId })
    }
  }

  private sendTeardownBeacon() {
    const session = this.session
    if (!session) return
    navigator.sendBeacon(`${this.opts.apiBaseUrl}/api/session/${encodeURIComponent(session.sessionId)}/end`)
  }

  private async teardownRoom() {
    window.removeEventListener('pagehide', this.beacon)
    this.resolvePending()
    const room = this.room
    this.room = null
    this.session = null
    this.detachTracks()
    if (room) {
      room.removeAllListeners()
      await room.disconnect()
    }
  }

  private wireRoom(room: Room, session: BrowserSession) {
    room.registerRpcMethod(RPC_PLAYBACK_STARTED, async (data) => {
      this.raw('synthesia', RPC_PLAYBACK_STARTED, { caller: data.callerIdentity, payload: data.payload })
      if (data.callerIdentity !== session.avatarIdentity) return 'reject'
      this.onPlaybackStarted()
      return 'ok'
    })
    room.registerRpcMethod(RPC_PLAYBACK_FINISHED, async (data) => {
      let payload: { playback_position?: number; interrupted?: boolean } = {}
      try {
        payload = JSON.parse(data.payload)
      } catch {
        /* worker sent a non-JSON payload; treat as a plain finish */
      }
      this.raw('synthesia', RPC_PLAYBACK_FINISHED, { caller: data.callerIdentity, payload })
      if (data.callerIdentity !== session.avatarIdentity) return 'reject'
      this.onPlaybackFinished(Boolean(payload.interrupted), payload.playback_position)
      return 'ok'
    })

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        this.raw('livekit', 'TrackSubscribed', { participant: participant.identity, kind: track.kind, source: pub.source })
        if (participant.identity === session.avatarIdentity) this.attachTrack(track)
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        this.raw('livekit', 'TrackUnsubscribed', { participant: participant.identity, kind: track.kind })
        track.detach()
        this.attached = this.attached.filter((t) => t !== track)
      })
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => this.raw('livekit', 'ParticipantConnected', { identity: p.identity, kind: p.kind, attributes: p.attributes }))
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        this.raw('livekit', 'ParticipantDisconnected', { identity: p.identity })
        if (p.identity === session.avatarIdentity && !this.ending) {
          this.fail({ code: 'avatar_lost', message: 'The avatar left the session unexpectedly.' })
        }
      })
      .on(RoomEvent.Disconnected, (reason) => {
        this.raw('livekit', 'Disconnected', { reason })
        if (!this.ending) this.fail({ code: 'disconnected', message: 'Connection to the avatar was lost.' })
      })
      .on(RoomEvent.Reconnecting, () => this.raw('livekit', 'Reconnecting'))
      .on(RoomEvent.Reconnected, () => this.raw('livekit', 'Reconnected'))
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => this.raw('livekit', 'ConnectionStateChanged', { state }))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        this.raw('livekit', 'AudioPlaybackStatusChanged', { canPlaybackAudio: room.canPlaybackAudio })
        if (!room.canPlaybackAudio) {
          const resume = () => void room.startAudio().catch(() => undefined)
          document.addEventListener('click', resume, { once: true })
        }
      })
      .on(RoomEvent.MediaDevicesError, (e: Error) => this.raw('livekit', 'MediaDevicesError', { message: e.message }))
  }

  private async waitForAvatar(room: Room, avatarIdentity: string) {
    const deadline = performance.now() + AVATAR_JOIN_TIMEOUT_MS
    while (performance.now() < deadline) {
      if (room.state === ConnectionState.Disconnected) throw new Error('Disconnected while waiting for the avatar.')
      const avatar = room.remoteParticipants.get(avatarIdentity)
      const pubs = [...(avatar?.trackPublications.values() ?? [])]
      const videoPub = pubs.find((p) => p.kind === Track.Kind.Video)
      const audioPub = pubs.find((p) => p.kind === Track.Kind.Audio)
      if (videoPub?.track && audioPub) {
        this.raw('synthesia', 'avatar tracks ready', { identity: avatarIdentity, waitedMs: Math.round(AVATAR_JOIN_TIMEOUT_MS - (deadline - performance.now())) })
        // The worker publishes its tracks slightly before its audio-stream handler is live;
        // audio sent in that window is dropped, so give it a moment before the first utterance.
        await sleep(AVATAR_WARMUP_MS)
        return
      }
      await sleep(200)
    }
    throw new Error('The avatar did not join in time. Please try again.')
  }

  private fail(error: AvatarError) {
    this.resolvePending()
    this.speaking = false
    this.emitter.emit('onError', error)
  }

  // ---- speaking ----------------------------------------------------------

  async speak(text: string): Promise<void> {
    const room = this.room
    const session = this.session
    if (!room || !session || room.state !== ConnectionState.Connected) return
    await this.stopSpeaking()

    const abort = new AbortController()
    this.ttsAbort = abort
    const done = new Promise<void>((resolve) => {
      this.pending = { resolve, startedAt: null, bytes: 0, sampleRate: 24_000, channels: 1 }
    })
    const pending = this.pending!

    try {
      const t0 = performance.now()
      const pcm = await this.opts.tts.synthesize(text, abort.signal)
      pending.sampleRate = pcm.format.sampleRate
      pending.channels = pcm.format.channels
      this.raw('tts', 'first byte', { ms: Math.round(performance.now() - t0), format: pcm.format })
      if (abort.signal.aborted) return

      const writer = await room.localParticipant.streamBytes({
        topic: AUDIO_STREAM_TOPIC,
        name: `AUDIO_${Date.now().toString(36)}`,
        destinationIdentities: [session.avatarIdentity],
        mimeType: 'audio/pcm',
        attributes: { sample_rate: String(pcm.format.sampleRate), num_channels: String(pcm.format.channels) },
      })
      this.writer = writer
      this.speaking = true
      this.raw('synthesia', 'audio stream opened', { streamId: writer.info.id, text })

      for await (const chunk of pcm.chunks) {
        if (abort.signal.aborted) break
        await writer.write(chunk)
        pending.bytes += chunk.byteLength
      }
      if (this.writer === writer) {
        this.writer = null
        await writer.close()
        this.raw('synthesia', 'audio stream closed', { bytes: pending.bytes, seconds: pcmSeconds(pending) })
      }
      if (abort.signal.aborted) return
    } catch (err) {
      if (abort.signal.aborted) return
      this.raw('tts', 'error', { message: err instanceof Error ? err.message : String(err) })
      this.speaking = false
      this.resolvePending()
      this.emitter.emit('onError', { code: 'unknown', message: 'Speech synthesis failed.' })
      return
    }

    // Safety net if the worker never sends lk.playback_finished.
    const fallbackMs = pcmSeconds(pending) * 1000 + 4_000
    const timer = setTimeout(() => {
      if (this.pending === pending) {
        this.raw('synthesia', 'playback_finished timeout, assuming done', { afterMs: fallbackMs })
        this.onPlaybackFinished(false)
      }
    }, fallbackMs)
    try {
      await done
    } finally {
      clearTimeout(timer)
    }
  }

  async stopSpeaking(): Promise<void> {
    const wasSpeaking = this.speaking || this.pending !== null
    this.ttsAbort?.abort()
    this.ttsAbort = null
    const writer = this.writer
    this.writer = null
    await writer?.close().catch(() => undefined)

    const room = this.room
    const session = this.session
    if (wasSpeaking && room && session && room.state === ConnectionState.Connected) {
      const pending = this.pending
      try {
        const res = await room.localParticipant.performRpc({ destinationIdentity: session.avatarIdentity, method: RPC_CLEAR_BUFFER, payload: '' })
        this.raw('synthesia', RPC_CLEAR_BUFFER, { response: res })
      } catch (err) {
        this.raw('synthesia', `${RPC_CLEAR_BUFFER} failed`, { message: err instanceof Error ? err.message : String(err) })
      }
      // Give the worker a moment to acknowledge with playback_finished{interrupted:true}.
      const ackDeadline = performance.now() + CLEAR_BUFFER_ACK_TIMEOUT_MS
      while (this.pending === pending && this.pending !== null && performance.now() < ackDeadline) await sleep(50)
      if (this.pending === pending && pending !== null) this.onPlaybackFinished(true)
    } else if (wasSpeaking) {
      this.onPlaybackFinished(true)
    }
    this.speaking = false
  }

  private onPlaybackStarted() {
    const pending = this.pending
    if (pending && pending.startedAt === null) {
      pending.startedAt = performance.now()
      if (this.lastUserSpeechEnd !== null) {
        const ms = Math.round(pending.startedAt - this.lastUserSpeechEnd)
        this.lastUserSpeechEnd = null
        this.raw('latency', 'user speech end → avatar speaking', { ms })
      }
    }
    this.speaking = true
    this.emitter.emit('onSpeakingStart')
  }

  private onPlaybackFinished(interrupted: boolean, playbackPosition?: number) {
    const pending = this.pending
    if (pending && pending.startedAt === null && !interrupted) this.onPlaybackStarted()
    this.pending = null
    this.speaking = false
    pending?.resolve()
    this.emitter.emit('onSpeakingEnd', { interrupted, playbackPosition })
  }

  private resolvePending() {
    const pending = this.pending
    this.pending = null
    pending?.resolve()
  }

  // ---- listening ---------------------------------------------------------

  async startListening(): Promise<void> {
    if (this.listening || !this.room) return
    this.listening = true
    await this.opts.speechInput.start()
  }

  async stopListening(): Promise<void> {
    if (!this.listening) return
    this.listening = false
    await this.opts.speechInput.stop()
  }

  sendUserText(text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return
    this.lastUserSpeechEnd = performance.now()
    this.emitter.emit('onUserSpeechEnd', this.lastUserSpeechEnd)
    this.emitter.emit('onUserSpeech', trimmed)
  }

  // ---- mounting ----------------------------------------------------------

  attach(container: HTMLElement): void {
    // Both avatar tracks go into ONE element so they share a MediaStream and stay lip-synced.
    this.video = document.createElement('video')
    this.video.autoplay = true
    this.video.playsInline = true
    this.video.className = 'absolute inset-0 h-full w-full object-cover bg-slate-950'
    container.appendChild(this.video)
    const avatar = this.session && this.room?.remoteParticipants.get(this.session.avatarIdentity)
    avatar?.trackPublications.forEach((pub) => pub.track && this.attachTrack(pub.track))
  }

  detach(): void {
    this.detachTracks()
    this.video?.remove()
    this.video = null
  }

  private attachTrack(track: RemoteTrack) {
    if (!this.video) return
    track.attach(this.video)
    if (!this.attached.includes(track)) this.attached.push(track)
  }

  private detachTracks() {
    this.attached.forEach((t) => t.detach())
    this.attached = []
  }

  // ---- events ------------------------------------------------------------

  on<E extends AvatarEventName>(event: E, handler: NonNullable<AvatarEvents[E]>): () => void {
    return this.emitter.on(event, handler)
  }

  simulateDisconnect(): void {
    void this.room?.disconnect()
  }

  private raw(source: string, name: string, payload?: unknown) {
    this.emitter.emit('onRawEvent', { at: Date.now(), source, name, payload })
  }
}

function pcmSeconds(p: { bytes: number; sampleRate: number; channels: number }): number {
  return p.bytes / (p.sampleRate * p.channels * 2)
}

function mapServerError(status: number, code?: string): AvatarError['code'] {
  if (code === 'concurrency_limit') return 'concurrency'
  if (code === 'quota_exceeded' || code === 'feature_not_in_plan' || status === 402) return 'quota'
  return 'unknown'
}

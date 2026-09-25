export interface PcmFormat {
  sampleRate: number
  channels: number
}

export interface PcmStream {
  format: PcmFormat
  /** 16-bit signed little-endian interleaved PCM chunks. */
  chunks: AsyncIterable<Uint8Array>
}

/** Text → PCM audio. Synthesia has no voice of its own; the avatar lip-syncs whatever this produces. */
export interface SpeechSynthesisProvider {
  synthesize(text: string, signal: AbortSignal): Promise<PcmStream>
}

/** Streams PCM from our server's /api/tts so the TTS key never reaches the browser. */
export class ServerTtsProvider implements SpeechSynthesisProvider {
  private readonly baseUrl: string
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async synthesize(text: string, signal: AbortSignal): Promise<PcmStream> {
    const res = await fetch(`${this.baseUrl}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    })
    if (!res.ok || !res.body) throw new Error(`TTS failed (${res.status})`)
    const format: PcmFormat = {
      sampleRate: Number(res.headers.get('X-Sample-Rate') ?? 24000),
      channels: Number(res.headers.get('X-Channels') ?? 1),
    }
    const reader = res.body.getReader()
    const chunks: AsyncIterable<Uint8Array> = {
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) return
            if (value) yield value
          }
        } finally {
          reader.releaseLock()
        }
      },
    }
    return { format, chunks }
  }
}

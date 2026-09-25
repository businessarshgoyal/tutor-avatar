import { config } from './config.js'

/** OpenAI `pcm` output: 24 kHz, 16-bit signed little-endian, mono. */
export const TTS_SAMPLE_RATE = 24_000
export const TTS_CHANNELS = 1

export class TtsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'TtsError'
  }
}

/** Streams raw PCM for `text`. The caller pipes `body` to the browser as it arrives. */
export async function synthesize(text: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.tts.openaiApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.tts.model, voice: config.tts.voice, input: text, response_format: 'pcm' }),
    signal,
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new TtsError(`TTS upstream responded ${res.status}: ${detail.slice(0, 200)}`, res.status)
  }
  return res.body
}

import { config } from './config.js'

/** Both backends are asked for 24 kHz, 16-bit signed little-endian, mono PCM. */
export const TTS_SAMPLE_RATE = 24_000
export const TTS_CHANNELS = 1

export class TtsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'TtsError'
  }
}

function request(text: string, signal: AbortSignal): Promise<Response> {
  const { tts } = config
  if (tts.provider === 'elevenlabs') {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(tts.voice)}/stream?output_format=pcm_${TTS_SAMPLE_RATE}`
    return fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': tts.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: tts.model }),
      signal,
    })
  }
  return fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: tts.model, voice: tts.voice, input: text, response_format: 'pcm' }),
    signal,
  })
}

/** Streams raw PCM for `text`. The caller pipes `body` to the browser as it arrives. */
export async function synthesize(text: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const res = await request(text, signal)
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new TtsError(`TTS upstream (${config.tts.provider}) responded ${res.status}: ${detail.slice(0, 200)}`, res.status)
  }
  return res.body
}

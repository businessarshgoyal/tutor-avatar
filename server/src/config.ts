import 'dotenv/config'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name} (see server/.env.example)`)
  return v
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback
}

export const config = {
  port: Number(optional('PORT', '8787')),
  frontendOrigin: optional('FRONTEND_ORIGIN', 'http://localhost:5173'),
  synthesia: {
    apiKey: required('SYNTHESIA_API_KEY'),
    apiUrl: optional('SYNTHESIA_API_URL', 'https://developers.synthesia.io'),
    avatarIds: required('SYNTHESIA_AVATAR_ID')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      // Gallery ids are shown as bare UUIDs in Synthesia; the API wants the `av_` namespace.
      .map((id) => (id.startsWith('av_') ? id : `av_${id}`)),
    avatarIdentity: optional('SYNTHESIA_AVATAR_IDENTITY', 'synthesia-avatar-agent'),
  },
  livekit: {
    url: required('LIVEKIT_URL'),
    apiKey: required('LIVEKIT_API_KEY'),
    apiSecret: required('LIVEKIT_API_SECRET'),
  },
  tts: {
    openaiApiKey: required('OPENAI_API_KEY'),
    model: optional('OPENAI_TTS_MODEL', 'gpt-4o-mini-tts'),
    voice: optional('OPENAI_TTS_VOICE', 'alloy'),
  },
  /** Rooms are deleted this long after the last participant leaves (belt-and-braces for lost beacons). */
  roomEmptyTimeoutSec: Number(optional('ROOM_EMPTY_TIMEOUT_SEC', '60')),
  /** Hard cap on a session; the room is torn down when it expires. */
  maxSessionMinutes: Number(optional('MAX_SESSION_MINUTES', '30')),
}

/** Every value that must never appear in a log line. */
export const SECRET_VALUES: string[] = [
  config.synthesia.apiKey,
  config.livekit.apiKey,
  config.livekit.apiSecret,
  config.tts.openaiApiKey,
]

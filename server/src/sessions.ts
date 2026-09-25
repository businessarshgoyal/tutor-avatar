import { randomBytes } from 'node:crypto'
import { config } from './config.js'
import { createRoom, deleteRoom, mintAvatarToken, mintStudentToken } from './livekit.js'
import { log } from './log.js'
import { SynthesiaError, startSynthesiaSession } from './synthesia.js'

export interface BrowserSession {
  sessionId: string
  livekitUrl: string
  token: string
  roomName: string
  identity: string
  avatarIdentity: string
  expiresAt: string
}

interface ActiveSession {
  roomName: string
  createdAt: number
  timer: ReturnType<typeof setTimeout>
}

const active = new Map<string, ActiveSession>()

export function activeCount(): number {
  return active.size
}

export async function createSession(): Promise<BrowserSession> {
  const suffix = randomBytes(6).toString('hex')
  const roomName = `tutor-${suffix}`
  const identity = `student-${suffix}`
  const ttlSec = config.maxSessionMinutes * 60

  await createRoom(roomName)
  const [token, avatarToken] = await Promise.all([mintStudentToken(roomName, identity, ttlSec), mintAvatarToken(roomName, identity)])

  let sessionId: string
  try {
    const s = await startSynthesiaSession({ avatarIds: config.synthesia.avatarIds, livekitUrl: config.livekit.url, livekitToken: avatarToken })
    sessionId = s.id
  } catch (e) {
    await deleteRoom(roomName)
    throw e
  }

  const timer = setTimeout(() => {
    log.info('session hit max duration, tearing down', { sessionId, roomName })
    void endSession(sessionId)
  }, ttlSec * 1000)
  active.set(sessionId, { roomName, createdAt: Date.now(), timer })
  log.info('session created', { sessionId, roomName, identity, active: active.size })

  return {
    sessionId,
    livekitUrl: config.livekit.url,
    token,
    roomName,
    identity,
    avatarIdentity: config.synthesia.avatarIdentity,
    expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
  }
}

/** Idempotent: unknown ids are ignored so a late beacon after a max-duration teardown is harmless. */
export async function endSession(sessionId: string): Promise<boolean> {
  const s = active.get(sessionId)
  if (!s) return false
  active.delete(sessionId)
  clearTimeout(s.timer)
  await deleteRoom(s.roomName)
  log.info('session ended', { sessionId, roomName: s.roomName, durationSec: Math.round((Date.now() - s.createdAt) / 1000), active: active.size })
  return true
}

export async function endAll(): Promise<void> {
  await Promise.all([...active.keys()].map((id) => endSession(id)))
}

export { SynthesiaError }

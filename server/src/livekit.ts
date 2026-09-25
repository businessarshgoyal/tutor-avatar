import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import { config } from './config.js'
import { log } from './log.js'

/** Participant attribute the Synthesia worker requires on its token: whose audio it lip-syncs. */
const ATTRIBUTE_PUBLISH_ON_BEHALF = 'lk.publish_on_behalf'
const AVATAR_TOKEN_TTL = '6h'

const httpUrl = config.livekit.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')
export const roomService = new RoomServiceClient(httpUrl, config.livekit.apiKey, config.livekit.apiSecret)

export async function createRoom(name: string): Promise<void> {
  await roomService.createRoom({
    name,
    emptyTimeout: config.roomEmptyTimeoutSec,
    maxParticipants: 3,
    syncStreams: true,
  })
}

export async function deleteRoom(name: string): Promise<void> {
  try {
    await roomService.deleteRoom(name)
  } catch (e) {
    // Already gone (empty-timeout) is the common case; only log anything else.
    const msg = e instanceof Error ? e.message : String(e)
    if (!/not found|does not exist/i.test(msg)) log.warn('deleteRoom failed', { room: name, error: e })
  }
}

/** Token for the student's browser: subscribes to the avatar, publishes only data (audio bytes + RPCs). */
export async function mintStudentToken(room: string, identity: string, ttlSec: number): Promise<string> {
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, { identity, name: 'Student', ttl: ttlSec })
  at.addGrant({
    room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: true,
  })
  return at.toJwt()
}

/** Token handed to Synthesia for the avatar worker; mirrors what livekit-plugins-synthesia mints. */
export async function mintAvatarToken(room: string, onBehalfOf: string): Promise<string> {
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: config.synthesia.avatarIdentity,
    name: 'Synthesia avatar',
    ttl: AVATAR_TOKEN_TTL,
    attributes: { [ATTRIBUTE_PUBLISH_ON_BEHALF]: onBehalfOf },
  })
  at.kind = 'agent'
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true })
  return at.toJwt()
}

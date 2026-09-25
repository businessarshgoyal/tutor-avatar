import { config } from './config.js'
import { log } from './log.js'

/** RFC 9457 problem details as returned by the Synthesia API. */
export interface Problem {
  type?: string
  title?: string
  status: number
  code?: string
  detail?: string | null
  requestId?: string | null
}

export class SynthesiaError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null,
    readonly retryable: boolean,
    readonly retryAfterSec: number | null,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'SynthesiaError'
  }
}

export interface StartSessionInput {
  avatarIds: string[]
  livekitUrl: string
  livekitToken: string
}

export interface SynthesiaSession {
  id: string
  status: string
  createdAt: string
}

const MAX_ATTEMPTS = 4
const BASE_DELAY_MS = 500
const REQUEST_TIMEOUT_MS = 75_000 // matches the endpoint's documented x-deadline-seconds

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function isProblem(body: unknown): body is Problem {
  return typeof body === 'object' && body !== null && typeof (body as Problem).status === 'number'
}

/**
 * POST /api/interactive-avatars/sessions with exponential backoff.
 * Per the docs: retries reuse the same livekitUrl/livekitToken, only transient failures
 * (network, timeout, 5xx, rate-limit 429) are retried, and Retry-After is honored.
 * Auth / plan / quota / concurrency / validation failures are surfaced immediately.
 */
export async function startSynthesiaSession(input: StartSessionInput): Promise<SynthesiaSession> {
  const url = `${config.synthesia.apiUrl.replace(/\/$/, '')}/api/interactive-avatars/sessions`
  let lastErr: SynthesiaError | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const outcome = await attemptOnce(url, input, attempt)
    if ('session' in outcome) return outcome.session
    lastErr = outcome.error
    if (!lastErr.retryable || attempt === MAX_ATTEMPTS) break
    const backoff = lastErr.retryAfterSec != null ? lastErr.retryAfterSec * 1000 : BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 250
    log.warn('synthesia session start failed, retrying', { attempt, backoffMs: Math.round(backoff), status: lastErr.status, code: lastErr.code })
    await sleep(backoff)
  }
  throw lastErr ?? new SynthesiaError('session start failed', null, null, false, null, null)
}

type Outcome = { session: SynthesiaSession } | { error: SynthesiaError }

async function attemptOnce(url: string, input: StartSessionInput, attempt: number): Promise<Outcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.synthesia.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
    const requestId = res.headers.get('request-id')
    const text = await res.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }

    if (res.status === 201 && body && typeof body === 'object' && typeof (body as SynthesiaSession).id === 'string') {
      log.info('synthesia session started', { attempt, sessionId: (body as SynthesiaSession).id, requestId })
      return { session: body as SynthesiaSession }
    }

    const problem = isProblem(body) ? body : null
    const code = problem?.code ?? null
    const retryAfter = res.headers.get('retry-after')
    const retryAfterSec = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null
    // 429 is retryable only when it is edge rate limiting; concurrency_limit means the user must end a session.
    const retryable = res.status >= 500 || (res.status === 429 && code !== 'concurrency_limit')
    const message = problem?.detail || problem?.title || `Synthesia responded ${res.status}`
    log.warn('synthesia session start rejected', { attempt, status: res.status, code, requestId, detail: problem?.detail ?? null })
    return { error: new SynthesiaError(message, res.status, code, retryable, retryAfterSec, requestId ?? problem?.requestId ?? null) }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    log.warn('synthesia session start network failure', { attempt, error: e, timedOut: aborted })
    return { error: new SynthesiaError(aborted ? 'Synthesia request timed out' : 'Could not reach Synthesia', null, aborted ? 'timeout' : 'network', true, null, null) }
  } finally {
    clearTimeout(timer)
  }
}

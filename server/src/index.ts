import { Readable } from 'node:stream'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { config } from './config.js'
import { log, redactString } from './log.js'
import { SynthesiaError, activeCount, createSession, endAll, endSession } from './sessions.js'
import { TTS_CHANNELS, TTS_SAMPLE_RATE, TtsError, synthesize } from './tts.js'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use(
  cors({
    origin: config.frontendOrigin,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  }),
)
app.use(express.json({ limit: '16kb' }))
// navigator.sendBeacon sends text/plain (or no body) — accept it for the teardown route.
app.use(express.text({ type: ['text/plain', 'application/octet-stream'], limit: '2kb' }))

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    log.info('http', { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start, ip: req.ip })
  })
  next()
})

const sessionLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many sessions started from this address; try again in a minute.' },
})

const ttsLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many speech requests.' },
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, activeSessions: activeCount() })
})

app.post('/api/session', sessionLimiter, async (_req, res, next) => {
  try {
    res.status(201).json(await createSession())
  } catch (e) {
    next(e)
  }
})

const teardown = async (req: Request, res: Response) => {
  const id = req.params.id
  if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) {
    res.status(400).json({ error: 'invalid_session_id' })
    return
  }
  const ended = await endSession(id)
  res.status(ended ? 204 : 404).end()
}
app.post('/api/session/:id/end', teardown)
app.delete('/api/session/:id', teardown)

app.post('/api/tts', ttsLimiter, async (req, res, next) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text || text.length > 1000) {
    res.status(400).json({ error: 'invalid_text', message: 'text must be 1–1000 characters' })
    return
  }
  const controller = new AbortController()
  req.on('close', () => controller.abort())
  try {
    const body = await synthesize(text, controller.signal)
    res.status(200)
    res.setHeader('Content-Type', 'audio/pcm')
    res.setHeader('X-Sample-Rate', String(TTS_SAMPLE_RATE))
    res.setHeader('X-Channels', String(TTS_CHANNELS))
    res.setHeader('Access-Control-Expose-Headers', 'X-Sample-Rate, X-Channels')
    Readable.fromWeb(body as import('node:stream/web').ReadableStream<Uint8Array>).pipe(res)
  } catch (e) {
    if (controller.signal.aborted) return
    next(e)
  }
})

const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof SynthesiaError) {
    const status = err.status !== null && err.status >= 400 && err.status < 500 ? err.status : 502
    log.warn('session creation failed', { status: err.status, code: err.code, requestId: err.requestId, message: err.message })
    res.status(status).json({ error: err.code ?? 'synthesia_error', message: redactString(err.message), retryable: err.retryable })
    return
  }
  if (err instanceof TtsError) {
    log.warn('tts failed', { upstreamStatus: err.status, message: err.message })
    res.status(502).json({ error: 'tts_failed', message: 'Speech synthesis failed' })
    return
  }
  log.error('unhandled error', { error: err })
  res.status(500).json({ error: 'internal', message: 'Internal server error' })
}
app.use(errorHandler)

const server = app.listen(config.port, () => {
  log.info('server listening', { port: config.port, frontendOrigin: config.frontendOrigin, avatarIds: config.synthesia.avatarIds })
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    log.info('shutting down, ending active sessions', { active: activeCount() })
    server.close()
    void endAll().finally(() => process.exit(0))
  })
}

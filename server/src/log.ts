import { SECRET_VALUES } from './config.js'

const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
const BEARER_RE = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi
const SECRET_KEY_RE = /(key|secret|token|authorization|password)$/i

export function redactString(s: string): string {
  let out = s
  for (const v of SECRET_VALUES) {
    if (v.length >= 6) out = out.split(v).join('[REDACTED]')
  }
  return out.replace(JWT_RE, '[REDACTED_JWT]').replace(BEARER_RE, '$1[REDACTED]')
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]'
  if (typeof value === 'string') return redactString(value)
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) && typeof v === 'string' ? '[REDACTED]' : redact(v, depth + 1)
    }
    return out
  }
  return value
}

type Level = 'debug' | 'info' | 'warn' | 'error'

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg: redactString(msg), ...(fields ? (redact(fields) as object) : {}) })
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n')
  else process.stdout.write(line + '\n')
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => write('debug', msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write('info', msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write('warn', msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write('error', msg, f),
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, CodeExample, Providers } from '../providers'
import { FACTORIAL } from '../providers/chat/MockChatProvider'

export type SessionState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error' | 'reconnecting'

export interface TranscriptMessage {
  id: number
  role: 'student' | 'tutor'
  sentences: string[]
  /** Index of the sentence currently being spoken; -1 when none. */
  speakingIndex: number
  /** Index of the sentence at which the reply was cut off. */
  interruptedAt?: number
  done: boolean
}

const RECONNECT_ATTEMPTS = 3
const CLARIFY_PROMPT = "I didn't get that, can you explain again?"
const RECOVERY_LINE = 'Sorry, we lost the connection for a moment. Where were we?'

let nextId = 1

export function useTutorSession(providers: Providers) {
  const { avatar, chat } = providers
  const [state, setState] = useState<SessionState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [messages, setMessagesState] = useState<TranscriptMessage[]>([])
  const messagesRef = useRef<TranscriptMessage[]>([])
  const setMessages = useCallback((update: (prev: TranscriptMessage[]) => TranscriptMessage[]) => {
    messagesRef.current = update(messagesRef.current)
    setMessagesState(messagesRef.current)
  }, [])
  const [code, setCode] = useState<CodeExample>(FACTORIAL)
  const [micOn, setMicOn] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)

  const generation = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const activeTutorId = useRef<number | null>(null)
  const micOnRef = useRef(false)
  const stateRef = useRef<SessionState>('idle')

  const updateState = useCallback((s: SessionState) => {
    stateRef.current = s
    setState(s)
  }, [])

  const patchMessage = useCallback((id: number, patch: Partial<TranscriptMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }, [setMessages])

  const cutOffActiveReply = useCallback(() => {
    const id = activeTutorId.current
    if (id === null) return
    activeTutorId.current = null
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && !m.done
          ? { ...m, done: true, interruptedAt: Math.max(m.speakingIndex, 0), speakingIndex: -1 }
          : m,
      ),
    )
  }, [setMessages])

  const historyFrom = (list: TranscriptMessage[]): ChatMessage[] =>
    list.map((m) => ({ role: m.role, content: m.sentences.join(' ') }))

  /** Cancels any in-flight reply and streams a new one for `question`. */
  const respond = useCallback(
    async (question: string | null) => {
      const gen = ++generation.current
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      await avatar.stopSpeaking()
      cutOffActiveReply()

      if (question) {
        setMessages((prev) => [
          ...prev,
          { id: nextId++, role: 'student', sentences: [question], speakingIndex: -1, done: true },
        ])
      }
      const history = historyFrom(messagesRef.current)

      const tutorId = nextId++
      activeTutorId.current = tutorId
      updateState('thinking')

      try {
        for await (const chunk of chat.stream(history, controller.signal)) {
          if (gen !== generation.current) return
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === tutorId)
            if (!existing) {
              return [...prev, { id: tutorId, role: 'tutor', sentences: [chunk.sentence], speakingIndex: 0, done: false }]
            }
            return prev.map((m) =>
              m.id === tutorId
                ? { ...m, sentences: [...m.sentences, chunk.sentence], speakingIndex: m.sentences.length }
                : m,
            )
          })
          if (chunk.code) setCode(chunk.code)
          updateState('speaking')
          await avatar.speak(chunk.sentence)
          if (gen !== generation.current) return
          updateState('thinking')
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) throw err
        return
      }

      if (gen !== generation.current) return
      activeTutorId.current = null
      patchMessage(tutorId, { done: true, speakingIndex: -1 })
      updateState('listening')
      if (micOnRef.current) void avatar.startListening()
    },
    [avatar, chat, cutOffActiveReply, patchMessage, setMessages, updateState],
  )

  /** Speaks a single scripted line without consulting the chat provider. */
  const say = useCallback(
    async (sentence: string) => {
      const gen = ++generation.current
      abortRef.current?.abort()
      const id = nextId++
      activeTutorId.current = id
      setMessages((prev) => [...prev, { id, role: 'tutor', sentences: [sentence], speakingIndex: 0, done: false }])
      updateState('speaking')
      await avatar.speak(sentence)
      if (gen !== generation.current) return
      activeTutorId.current = null
      patchMessage(id, { done: true, speakingIndex: -1 })
      updateState('listening')
      if (micOnRef.current) void avatar.startListening()
    },
    [avatar, patchMessage, setMessages, updateState],
  )

  const startSession = useCallback(async () => {
    setErrorMessage(null)
    setMessages(() => [])
    setCode(FACTORIAL)
    updateState('connecting')
    try {
      await avatar.startSession()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not connect to the avatar')
      updateState('error')
      return
    }
    setStartedAt(Date.now())
    void respond(null)
  }, [avatar, respond, setMessages, updateState])

  const endSession = useCallback(async () => {
    generation.current++
    abortRef.current?.abort()
    activeTutorId.current = null
    micOnRef.current = false
    setMicOn(false)
    await avatar.endSession()
    setStartedAt(null)
    updateState('idle')
  }, [avatar, updateState])

  const sendText = useCallback(
    (text: string) => {
      if (!['listening', 'thinking', 'speaking'].includes(stateRef.current)) return
      avatar.sendUserText(text)
    },
    [avatar],
  )

  const interrupt = useCallback(() => {
    if (stateRef.current !== 'speaking' && stateRef.current !== 'thinking') return
    void respond(CLARIFY_PROMPT)
  }, [respond])

  const toggleMic = useCallback(async () => {
    setMicError(null)
    if (micOnRef.current) {
      micOnRef.current = false
      setMicOn(false)
      await avatar.stopListening()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      setMicError(denied ? 'Microphone access was denied. You can still type your questions below.' : 'No microphone found. You can still type your questions below.')
      return
    }
    micOnRef.current = true
    setMicOn(true)
    if (stateRef.current === 'listening') await avatar.startListening()
  }, [avatar])

  const reconnect = useCallback(async () => {
    generation.current++
    abortRef.current?.abort()
    cutOffActiveReply()
    updateState('reconnecting')
    for (let attempt = 1; attempt <= RECONNECT_ATTEMPTS; attempt++) {
      try {
        await avatar.startSession()
        void say(RECOVERY_LINE)
        return
      } catch {
        await new Promise((r) => setTimeout(r, 800 * attempt))
      }
    }
    setErrorMessage('Could not reconnect to the avatar. Please end the session and try again.')
    updateState('error')
  }, [avatar, cutOffActiveReply, say, updateState])

  useEffect(() => {
    const offs = [
      avatar.on('onUserSpeech', (text) => {
        if (stateRef.current === 'idle' || stateRef.current === 'connecting') return
        void respond(text)
      }),
      avatar.on('onError', (error) => {
        if (error.code === 'disconnected') {
          void reconnect()
        } else {
          setErrorMessage(error.message)
          updateState('error')
        }
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [avatar, reconnect, respond, updateState])

  return {
    state,
    errorMessage,
    messages,
    code,
    micOn,
    micError,
    startedAt,
    startSession,
    endSession,
    sendText,
    interrupt,
    toggleMic,
    reconnect,
    simulateDisconnect: avatar.simulateDisconnect ? () => avatar.simulateDisconnect?.() : undefined,
  }
}

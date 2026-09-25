import type { AvatarEventName, AvatarEvents, AvatarProvider } from './AvatarProvider'
import { Emitter } from '../emitter'

const WORD_MS = 240
const CONNECT_MS = 1400

const SIMULATED_QUESTIONS = [
  'What is recursion?',
  'What is a base case?',
  'Can you show me factorial in code?',
  'How is recursion different from a loop?',
  'What happens with a stack overflow?',
]

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class MockAvatarProvider implements AvatarProvider {
  private emitter = new Emitter<AvatarEvents>()
  private surface: HTMLDivElement | null = null
  private caption: HTMLDivElement | null = null
  private connected = false
  private speakToken = 0
  private speaking = false
  private listenTimer: ReturnType<typeof setTimeout> | null = null
  private simulatedIndex = 0

  async startSession(): Promise<void> {
    await sleep(CONNECT_MS)
    this.connected = true
    this.render()
  }

  async endSession(): Promise<void> {
    await this.stopSpeaking()
    await this.stopListening()
    this.connected = false
    this.render()
  }

  async speak(text: string): Promise<void> {
    if (!this.connected) return
    const token = ++this.speakToken
    const words = text.split(/\s+/).filter(Boolean)
    this.speaking = true
    this.emitter.emit('onSpeakingStart')
    this.setCaption('')
    for (let i = 0; i < words.length; i++) {
      await sleep(WORD_MS)
      if (token !== this.speakToken) return
      const spoken = words.slice(0, i + 1).join(' ')
      this.setCaption(spoken)
      this.emitter.emit('onSpeakingProgress', spoken)
    }
    await sleep(WORD_MS)
    if (token !== this.speakToken) return
    this.speaking = false
    this.setCaption('')
    this.emitter.emit('onSpeakingEnd', { interrupted: false })
  }

  async stopSpeaking(): Promise<void> {
    this.speakToken++
    this.setCaption('')
    if (this.speaking) {
      this.speaking = false
      this.emitter.emit('onInterrupt')
      this.emitter.emit('onSpeakingEnd', { interrupted: true })
    }
  }

  async startListening(): Promise<void> {
    if (!this.connected || this.listenTimer) return
    this.listenTimer = setTimeout(() => {
      this.listenTimer = null
      const q = SIMULATED_QUESTIONS[this.simulatedIndex++ % SIMULATED_QUESTIONS.length]
      this.emitter.emit('onUserSpeech', q)
    }, 2800)
  }

  async stopListening(): Promise<void> {
    if (this.listenTimer) {
      clearTimeout(this.listenTimer)
      this.listenTimer = null
    }
  }

  sendUserText(text: string): void {
    const trimmed = text.trim()
    if (trimmed) this.emitter.emit('onUserSpeech', trimmed)
  }

  attach(container: HTMLElement): void {
    this.surface = document.createElement('div')
    this.surface.className = 'absolute inset-0 flex items-center justify-center'
    this.caption = document.createElement('div')
    this.caption.className =
      'absolute bottom-6 left-1/2 -translate-x-1/2 max-w-[80%] rounded-lg bg-black/70 px-4 py-2 text-center text-base text-white empty:hidden'
    container.appendChild(this.surface)
    container.appendChild(this.caption)
    this.render()
  }

  detach(): void {
    this.surface?.remove()
    this.caption?.remove()
    this.surface = this.caption = null
  }

  on<E extends AvatarEventName>(event: E, handler: NonNullable<AvatarEvents[E]>): () => void {
    return this.emitter.on(event, handler)
  }

  simulateDisconnect(): void {
    if (!this.connected) return
    this.speakToken++
    this.speaking = false
    this.setCaption('')
    void this.stopListening()
    this.connected = false
    this.render()
    this.emitter.emit('onError', { code: 'disconnected', message: 'Avatar stream dropped' })
  }

  private setCaption(text: string) {
    if (this.caption) this.caption.textContent = text
  }

  private render() {
    if (!this.surface) return
    this.surface.innerHTML = `
      <div class="relative flex h-full w-full items-center justify-center bg-gradient-to-b from-slate-800 to-slate-950">
        <svg viewBox="0 0 200 200" class="h-[62%] w-auto ${this.connected ? '' : 'opacity-40 grayscale'}" aria-label="Tutor avatar placeholder">
          <circle cx="100" cy="72" r="42" fill="#cbd5e1"/>
          <path d="M30 190c0-45 31-72 70-72s70 27 70 72" fill="#94a3b8"/>
          <circle cx="86" cy="68" r="5" fill="#0f172a"/>
          <circle cx="114" cy="68" r="5" fill="#0f172a"/>
          <path d="M84 90q16 12 32 0" stroke="#0f172a" stroke-width="4" fill="none" stroke-linecap="round"/>
        </svg>
      </div>`
  }
}

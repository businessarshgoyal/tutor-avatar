type Handler = (...args: never[]) => void

export class Emitter<Events extends { [K in keyof Events]: Handler | undefined }> {
  private handlers = new Map<keyof Events, Set<Handler>>()

  on<E extends keyof Events>(event: E, handler: NonNullable<Events[E]>): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler as Handler)
    return () => set!.delete(handler as Handler)
  }

  emit<E extends keyof Events>(event: E, ...args: Parameters<NonNullable<Events[E]>>): void {
    this.handlers.get(event)?.forEach((h) => (h as (...a: unknown[]) => void)(...args))
  }

  clear(): void {
    this.handlers.clear()
  }
}

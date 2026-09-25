import { useMemo } from 'react'
import { AvatarPanel } from './components/AvatarPanel'
import { CodePanel } from './components/CodePanel'
import { Controls } from './components/Controls'
import { StartScreen } from './components/StartScreen'
import { TopBar } from './components/TopBar'
import { Transcript } from './components/Transcript'
import { useTutorSession } from './hooks/useTutorSession'
import { createProviders } from './providers'

const LESSON_TITLE = 'Recursion'

export default function App() {
  const providers = useMemo(() => createProviders(), [])
  const session = useTutorSession(providers)

  if (session.state === 'idle') {
    return <StartScreen title={LESSON_TITLE} onStart={session.startSession} />
  }

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <TopBar
        title={LESSON_TITLE}
        state={session.state}
        startedAt={session.startedAt}
        onEnd={session.endSession}
        onSimulateDrop={session.simulateDisconnect}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] grid-rows-[minmax(0,1fr)_260px]">
        <AvatarPanel
          avatar={providers.avatar}
          state={session.state}
          micOn={session.micOn}
          errorMessage={session.errorMessage}
          onReconnect={session.reconnect}
        />
        <div className="row-span-2 flex min-h-0 flex-col">
          <Transcript messages={session.messages} state={session.state} />
        </div>
        <CodePanel example={session.code} />
      </div>
      <Controls
        state={session.state}
        micOn={session.micOn}
        micError={session.micError}
        onToggleMic={session.toggleMic}
        onSend={session.sendText}
        onInterrupt={session.interrupt}
      />
    </div>
  )
}

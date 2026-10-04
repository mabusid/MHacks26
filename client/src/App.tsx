import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import Stage from './components/Stage';
import type { WorldPhase } from './components/World';
import { planetTheme } from './format';
import Briefing from './screens/Briefing';
import Build from './screens/Build';
import Debrief from './screens/Debrief';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import { useRoom, type RoomData } from './useRoom';

// three.js is the bulk of the bundle: load it after the HUD so the game is usable first.
const World = lazy(() => import('./components/World'));

/** The 3D world is mounted once here and never remounted; screens are HUD layers on top of it. */
export default function App() {
  const data = useRoom();
  const inRoom = data.connected && !!data.me && !!data.room;
  const phase: WorldPhase = inRoom ? (data.room!.phase.tag.toLowerCase() as WorldPhase) : 'home';
  const round = data.current ?? data.next;
  const theme = planetTheme(inRoom ? round : undefined);

  return (
    <div className={`app ${theme}`}>
      <Suspense fallback={<div className="world" />}>
        <World phase={phase} theme={theme} />
      </Suspense>
      <div className={`veil veil-${phase}`} />
      <div className="layer">{!data.connected ? <Stage><p className="muted">Connecting…</p></Stage> : <Screen data={data} phase={phase} />}</div>
      {inRoom && <HostToast data={data} />}
    </div>
  );
}

function Screen({ data, phase }: { data: RoomData; phase: WorldPhase }) {
  switch (phase) {
    case 'home':
      return (
        <Stage>
          <Home />
        </Stage>
      );
    case 'lobby':
      return (
        <Stage>
          <Lobby data={data} />
        </Stage>
      );
    case 'briefing':
      return (
        <Stage>
          <Briefing data={data} />
        </Stage>
      );
    case 'build':
      return <Build data={data} />;
    case 'debrief':
      return (
        <Stage>
          <Debrief data={data} />
        </Stage>
      );
  }
}

/** "Ana left · Ben is host" — host changes are announced, never silent (design.md → Transitions). */
function HostToast({ data }: { data: RoomData }) {
  const host = data.room?.host.toHexString();
  const prev = useRef(host);
  const [msg, setMsg] = useState<string>();
  useEffect(() => {
    if (!host || prev.current === host) return;
    const was = data.members.find(m => m.identity.toHexString() === prev.current);
    const now = data.members.find(m => m.identity.toHexString() === host);
    prev.current = host;
    if (!now) return;
    const mine = data.me && now.identity.isEqual(data.me.identity);
    setMsg(`${was ? `${was.name} left · ` : ''}${mine ? 'You are' : `${now.name} is`} host now`);
  }, [host, data.members, data.me]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(undefined), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? (
    <div className="host-toast" role="status">
      ★ {msg}
    </div>
  ) : null;
}

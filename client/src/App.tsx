import Stage from './components/Stage';
import Briefing from './screens/Briefing';
import Build from './screens/Build';
import Debrief from './screens/Debrief';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import { useRoom } from './useRoom';

export default function App() {
  const data = useRoom();
  if (!data.connected) {
    return (
      <Stage>
        <p className="muted">Connecting…</p>
      </Stage>
    );
  }
  if (!data.me || !data.room) {
    return (
      <Stage>
        <Home />
      </Stage>
    );
  }

  const round = data.current ?? data.next;
  switch (data.room.phase.tag) {
    case 'Build':
      return <Build data={data} />;
    case 'Lobby':
      return (
        <Stage round={round}>
          <Lobby data={data} />
        </Stage>
      );
    case 'Briefing':
      return (
        <Stage round={round}>
          <Briefing data={data} />
        </Stage>
      );
    case 'Debrief':
      return (
        <Stage round={round}>
          <Debrief data={data} />
        </Stage>
      );
  }
}

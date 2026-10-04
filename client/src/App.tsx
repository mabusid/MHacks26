import Shell from './components/Shell';
import Briefing from './screens/Briefing';
import Build from './screens/Build';
import Debrief from './screens/Debrief';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import { useRoom } from './useRoom';

export default function App() {
  const data = useRoom();
  if (!data.connected) return <main className="screen">Connecting…</main>;
  if (!data.me || !data.room) return <Home />;

  const screen = (() => {
    switch (data.room.phase.tag) {
      case 'Lobby':
        return <Lobby data={data} />;
      case 'Briefing':
        return <Briefing data={data} />;
      case 'Build':
        return <Build data={data} />;
      case 'Debrief':
        return <Debrief data={data} />;
    }
  })();
  return <Shell data={data}>{screen}</Shell>;
}

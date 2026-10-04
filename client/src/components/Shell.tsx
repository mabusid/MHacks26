import type { ReactNode } from 'react';
import { planetTheme } from '../format';
import type { RoomData } from '../useRoom';
import CrewPanel from './CrewPanel';
import TopBar from './TopBar';

/** Game shell from docs/design.md: top bar, main area, crew sidebar (stacks on narrow screens). */
export default function Shell({ data, children, aside }: { data: RoomData; children: ReactNode; aside?: ReactNode }) {
  const { room, me, members, current, next } = data;
  if (!room || !me) return null;
  return (
    <div className={`shell ${planetTheme(current ?? next)}`}>
      <TopBar room={room} round={current ?? next} />
      <main className="shell-main">{children}</main>
      <aside className="shell-aside">
        <CrewPanel room={room} members={members} me={me} />
        {aside}
      </aside>
    </div>
  );
}

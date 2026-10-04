import { SHARED_VERSION, nightBand } from '@overburden/shared';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';

// Phase 0 placeholder: shows that client and module run the same shared code.
export default function App() {
  const { isActive } = useSpacetimeDB();
  const [info] = useTable(tables.serverInfo);
  const row = info[0];
  const clientBand = nightBand(354, false);
  const match = row && row.sharedVersion === SHARED_VERSION && row.moonNightBand === clientBand;

  return (
    <main style={{ padding: '2rem', maxWidth: 560 }}>
      <h1>Overburden</h1>
      <p>
        SpacetimeDB:{' '}
        <strong style={{ color: isActive ? 'var(--ok)' : 'var(--bad)' }}>{isActive ? 'connected' : 'disconnected'}</strong>
      </p>
      <p>
        Client shared v{SHARED_VERSION}, Moon night band {clientBand}
        <br />
        Module shared {row ? `v${row.sharedVersion}, Moon night band ${row.moonNightBand}` : '…'}
      </p>
      <p data-testid="shared-check">{row ? (match ? '✓ shared code matches' : '✗ mismatch') : 'waiting for module…'}</p>
    </main>
  );
}

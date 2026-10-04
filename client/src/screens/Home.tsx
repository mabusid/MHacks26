import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { NAME_MAX_LENGTH, ROOM_CODE_LENGTH, normalizeRoomCode, validateName } from '@overburden/shared';
import { reducers } from '../module_bindings';
import { useReducerCall } from '../useReducerCall';

const NAME_KEY = 'overburden/name';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function Home() {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState('');
  const create = useReducerCall(useReducer(reducers.createRoom));
  const join = useReducerCall(useReducer(reducers.joinRoom));

  const nameCheck = validateName(name);
  const pending = create.pending || join.pending;
  const error = create.error ?? join.error;

  function remember() {
    try {
      if (nameCheck.ok) localStorage.setItem(NAME_KEY, nameCheck.name);
    } catch {
      // Name just isn't remembered.
    }
  }

  return (
    <main className="screen">
      <p className="label">Mission control</p>
      <h1>Overburden</h1>
      <p className="muted">Four crew. One real planet. Two and a half minutes to build a base that survives.</p>

      <label className="field">
        Your name
        <input value={name} maxLength={NAME_MAX_LENGTH} onChange={e => setName(e.target.value)} placeholder="e.g. Sam" />
      </label>

      <button
        className="primary"
        disabled={!nameCheck.ok || pending}
        onClick={() => {
          remember();
          create.run({ name });
        }}
      >
        Create room
      </button>

      <form
        className="row"
        onSubmit={e => {
          e.preventDefault();
          remember();
          join.run({ code, name });
        }}
      >
        <input
          className="code-input"
          value={code}
          onChange={e => setCode(normalizeRoomCode(e.target.value))}
          placeholder="CODE"
          aria-label="Room code"
        />
        <button type="submit" disabled={!nameCheck.ok || code.length !== ROOM_CODE_LENGTH || pending}>
          Join
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </main>
  );
}

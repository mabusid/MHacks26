import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { NAME_MAX_LENGTH, ROOM_CODE_LENGTH, normalizeRoomCode, validateName } from '@overburden/shared';
import { unlockAudio } from '../audio';
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
    unlockAudio(); // a click: the one moment browsers let us enable sound
    try {
      if (nameCheck.ok) localStorage.setItem(NAME_KEY, nameCheck.name);
    } catch {
      // Name just isn't remembered.
    }
  }

  return (
    <div className="card home">
      <h1 className="title">Overburden</h1>
      <p className="muted">Build a base on a real planet. 2:30 on the clock.</p>

      <input value={name} maxLength={NAME_MAX_LENGTH} onChange={e => setName(e.target.value)} placeholder="Your name" aria-label="Your name" />

      <button
        className="primary big"
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
        <button type="submit" className="big" disabled={!nameCheck.ok || code.length !== ROOM_CODE_LENGTH || pending}>
          Join
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

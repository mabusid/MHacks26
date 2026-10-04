import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { NAME_MAX_LENGTH, ROOM_CODE_LENGTH, normalizeRoomCode, validateName } from '@mission-control/shared';
import { unlockAudio } from '../audio';
import { reducers } from '../module_bindings';
import { useReducerCall } from '../useReducerCall';

const NAME_KEY = 'mission-control/name';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

type Step = 'choose' | 'create' | 'join';

/** Start: two choices first, then one short form for the one you picked. */
export default function Home() {
  const [step, setStep] = useState<Step>('choose');
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState('');
  const create = useReducerCall(useReducer(reducers.createRoom));
  const join = useReducerCall(useReducer(reducers.joinRoom));

  const nameCheck = validateName(name);
  const pending = create.pending || join.pending;
  const error = step === 'create' ? create.error : step === 'join' ? join.error : undefined;

  function remember() {
    unlockAudio(); // a click: the one moment browsers let us enable sound
    try {
      if (nameCheck.ok) localStorage.setItem(NAME_KEY, nameCheck.name);
    } catch {
      // Name just isn't remembered.
    }
  }

  if (step === 'choose') {
    return (
      <div className="card home">
        <h1 className="title">Mission Control</h1>
        <button className="primary big" onClick={() => setStep('create')}>
          Create a team
        </button>
        <button className="secondary big" onClick={() => setStep('join')}>
          Join a team
        </button>
      </div>
    );
  }

  const joining = step === 'join';
  return (
    <form
      className="card home"
      onSubmit={e => {
        e.preventDefault();
        remember();
        if (joining) join.run({ code, name });
        else create.run({ name });
      }}
    >
      <button type="button" className="back-link" onClick={() => setStep('choose')}>
        ‹ Back
      </button>
      <h2 className="step-title">{joining ? 'Join a team' : 'Create a team'}</h2>
      <input autoFocus value={name} maxLength={NAME_MAX_LENGTH} onChange={e => setName(e.target.value)} placeholder="Your name" aria-label="Your name" />
      {joining && (
        <input
          className="code-input"
          value={code}
          onChange={e => setCode(normalizeRoomCode(e.target.value))}
          placeholder="TEAM CODE"
          aria-label="Team code"
        />
      )}
      <button type="submit" className="primary big" disabled={!nameCheck.ok || pending || (joining && code.length !== ROOM_CODE_LENGTH)}>
        {joining ? 'Join team' : 'Create team'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

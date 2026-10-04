import { useReducer } from 'spacetimedb/react';
import { reducers } from './module_bindings';
import { useReducerCall } from './useReducerCall';

export default function LeaveButton() {
  const leave = useReducerCall(useReducer(reducers.leaveRoom));
  return (
    <>
      <button className="secondary" onClick={() => leave.run()} disabled={leave.pending}>
        Leave room
      </button>
      {leave.error && <p className="error">{leave.error}</p>}
    </>
  );
}

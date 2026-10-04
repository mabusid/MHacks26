import type { ReactNode } from 'react';
import { planetTheme } from '../format';
import type { Round } from '../module_bindings/types';
import BaseScene from './BaseScene';

/** Backdrop + centered content for every screen except the build. */
export default function Stage({ round, children }: { round?: Round; children: ReactNode }) {
  return (
    <div className={`stage ${planetTheme(round)}`}>
      <BaseScene />
      <div className="stage-veil" />
      <div className="stage-content">{children}</div>
    </div>
  );
}

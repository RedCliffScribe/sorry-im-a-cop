import type { RuntimeState } from '../../domain/runtime/types';
import { useState } from 'react';

export function DevPanel({ state }: { state: RuntimeState }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details className="panel dev-panel" onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary>开发者视图</summary>
      {isOpen ? <pre>{JSON.stringify(state, null, 2)}</pre> : null}
    </details>
  );
}

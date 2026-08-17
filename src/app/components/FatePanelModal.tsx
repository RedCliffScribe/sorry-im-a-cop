import type { RuntimeState } from '../../domain/runtime/types';
import { RelationshipThreadPanelModal } from './RelationshipThreadPanelModal';

interface FatePanelModalProps {
  state: RuntimeState;
  onClose: () => void;
  onDeleteThread?: (threadId: string) => void | Promise<void>;
}

export function FatePanelModal({ state, onClose, onDeleteThread }: FatePanelModalProps) {
  return (
    <RelationshipThreadPanelModal
      state={state}
      kind="fate"
      title="缘份"
      subtitle="Fate"
      emptyText="暂无已知缘份"
      onClose={onClose}
      onDeleteThread={onDeleteThread}
    />
  );
}

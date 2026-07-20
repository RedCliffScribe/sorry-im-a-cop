import type { RuntimeState } from '../../domain/runtime/types';
import { RelationshipThreadPanelModal } from './RelationshipThreadPanelModal';

interface FatePanelModalProps {
  state: RuntimeState;
  onClose: () => void;
}

export function FatePanelModal({ state, onClose }: FatePanelModalProps) {
  return (
    <RelationshipThreadPanelModal
      state={state}
      kind="fate"
      title="缘份"
      subtitle="Fate"
      emptyText="暂无已知缘份"
      onClose={onClose}
    />
  );
}

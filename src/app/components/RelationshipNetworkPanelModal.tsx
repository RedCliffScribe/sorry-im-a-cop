import type { RuntimeState } from '../../domain/runtime/types';
import { RelationshipThreadPanelModal } from './RelationshipThreadPanelModal';

interface RelationshipNetworkPanelModalProps {
  state: RuntimeState;
  onClose: () => void;
}

export function RelationshipNetworkPanelModal({ state, onClose }: RelationshipNetworkPanelModalProps) {
  return (
    <RelationshipThreadPanelModal
      state={state}
      kind="network"
      title="人脉"
      subtitle="Network"
      emptyText="暂无已知人脉"
      onClose={onClose}
    />
  );
}

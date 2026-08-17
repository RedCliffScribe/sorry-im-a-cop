import type { RuntimeState } from '../../domain/runtime/types';
import { RelationshipThreadPanelModal } from './RelationshipThreadPanelModal';

interface RelationshipNetworkPanelModalProps {
  state: RuntimeState;
  onClose: () => void;
  onDeleteThread?: (threadId: string) => void | Promise<void>;
}

export function RelationshipNetworkPanelModal({
  state,
  onClose,
  onDeleteThread
}: RelationshipNetworkPanelModalProps) {
  return (
    <RelationshipThreadPanelModal
      state={state}
      kind="network"
      title="人脉"
      subtitle="Network"
      emptyText="暂无已知人脉"
      onClose={onClose}
      onDeleteThread={onDeleteThread}
    />
  );
}

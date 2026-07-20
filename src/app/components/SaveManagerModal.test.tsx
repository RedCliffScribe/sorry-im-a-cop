import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { RuntimeSaveRecord } from '../../domain/persistence/SaveRepository';
import { createPortableSaveZip } from '../../domain/persistence/portableSaveZipArchive';
import { SaveManagerModal } from './SaveManagerModal';

function createRecord(saveId: string): RuntimeSaveRecord {
  const runtimeState = createInitialRuntimeState();
  return {
    saveId,
    rollbackChainId: `chain_${saveId}`,
    saveName: saveId,
    saveKind: 'manual',
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    playerName: runtimeState.player.name,
    worldpackId: runtimeState.world.worldpackId,
    gameDateLabel: '1988-09-12 星期一 21:15',
    turnCounter: runtimeState.turnCounter,
    runtimeState
  };
}

function renderModal(onImportSaves: (records: RuntimeSaveRecord[]) => Promise<void>) {
  return render(
    <SaveManagerModal
      mode="load"
      saves={[]}
      isLoading={false}
      error={null}
      canSave={false}
      onSaveCurrent={vi.fn()}
      onLoadSave={vi.fn()}
      onDeleteSave={vi.fn()}
      onClearSaves={vi.fn()}
      onImportSaves={onImportSaves}
      onExportSaves={vi.fn()}
      onClose={vi.fn()}
    />
  );
}

function createJsonFile(value: unknown): File {
  const file = new File([JSON.stringify(value)], 'saves.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', {
    value: vi.fn().mockResolvedValue(JSON.stringify(value))
  });
  return file;
}

describe('SaveManagerModal import', () => {
  it('imports saves from the ZIP archive format', async () => {
    const onImportSaves = vi.fn().mockResolvedValue(undefined);
    const zipBytes = await createPortableSaveZip([createRecord('zip-save')]);
    const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
    new Uint8Array(zipBuffer).set(zipBytes);
    const file = new File([zipBuffer], 'saves.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(zipBuffer)
    });
    const { container } = renderModal(onImportSaves);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [file] }
    });

    await waitFor(() => expect(onImportSaves).toHaveBeenCalledTimes(1));
    const importedRecords = onImportSaves.mock.calls[0][0] as RuntimeSaveRecord[];
    expect(importedRecords).toHaveLength(1);
    expect(importedRecords[0].saveId).toBe('zip-save');
  });

  it('rejects the whole archive before import when a later save is invalid', async () => {
    const onImportSaves = vi.fn().mockResolvedValue(undefined);
    const validRecord = createRecord('valid');
    const invalidRecord = structuredClone(validRecord) as unknown as Record<string, unknown>;
    delete (invalidRecord.runtimeState as Record<string, unknown>).player;
    const { container } = renderModal(onImportSaves);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [createJsonFile({ version: 1, saves: [validRecord, invalidRecord] })]
      }
    });

    expect(await screen.findByText('导入失败，请确认文件是 CopV2 存档。')).toBeInTheDocument();
    await waitFor(() => expect(onImportSaves).not.toHaveBeenCalled());
  });
});

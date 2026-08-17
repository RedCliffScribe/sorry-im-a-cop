import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { RuntimeSaveRecord } from '../../domain/persistence/SaveRepository';
import {
  createPortableSaveZip,
  type PortableSaveBundle
} from '../../domain/persistence/portableSaveZipArchive';
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

function renderModal(onImportSaves: (bundle: PortableSaveBundle) => Promise<void>) {
  return render(
    <SaveManagerModal
      mode="load"
      saves={[]}
      isLoading={false}
      error={null}
      canSave={false}
      onSaveCurrent={vi.fn()}
      onLoadSave={vi.fn()}
      onRepairSave={vi.fn()}
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
    const importedBundle = onImportSaves.mock.calls[0][0] as PortableSaveBundle;
    expect(importedBundle.records).toHaveLength(1);
    expect(importedBundle.records[0].saveId).toBe('zip-save');
    expect(importedBundle.visualArchives).toEqual({});
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

  it('requires two confirmations before clearing every save', async () => {
    const onClearSaves = vi.fn().mockResolvedValue(undefined);
    const { runtimeState: _runtimeState, ...summary } = createRecord('clear-me');
    render(
      <SaveManagerModal
        mode="load"
        saves={[summary]}
        isLoading={false}
        error={null}
        canSave={false}
        onSaveCurrent={vi.fn()}
        onLoadSave={vi.fn()}
        onRepairSave={vi.fn()}
        onDeleteSave={vi.fn()}
        onClearSaves={onClearSaves}
        onImportSaves={vi.fn()}
        onExportSaves={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const confirmSpy = vi.spyOn(window, 'confirm');
    confirmSpy.mockReturnValueOnce(true).mockReturnValueOnce(false);

    fireEvent.click(screen.getByRole('button', { name: '清空存档' }));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(onClearSaves).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: '清空存档' }));

    await waitFor(() => expect(onClearSaves).toHaveBeenCalledTimes(1));
    confirmSpy.mockRestore();
  });

  it('lets the player explicitly choose whether exported saves include generated images', async () => {
    const onExportSaves = vi.fn().mockResolvedValue(undefined);
    const { runtimeState: _runtimeState, ...summary } = createRecord('export-me');
    render(
      <SaveManagerModal
        mode="load"
        saves={[summary]}
        isLoading={false}
        error={null}
        canSave={false}
        onSaveCurrent={vi.fn()}
        onLoadSave={vi.fn()}
        onRepairSave={vi.fn()}
        onDeleteSave={vi.fn()}
        onClearSaves={vi.fn()}
        onImportSaves={vi.fn()}
        onExportSaves={onExportSaves}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '包含文生图图片（文件可能较大）' }));
    fireEvent.click(screen.getByRole('button', { name: '导出存档' }));
    await waitFor(() => expect(onExportSaves).toHaveBeenCalledWith(true));
    expect(screen.getByRole('status')).toHaveTextContent('存档与文生图图片已导出');
  });

  it('runs a confirmed scoped save repair and shows its result', async () => {
    const onRepairSave = vi.fn().mockResolvedValue('存档修复完成：本次补齐 2 名人物。');
    const { runtimeState: _runtimeState, ...summary } = createRecord('repair-me');
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    render(
      <SaveManagerModal
        mode="load"
        saves={[summary]}
        isLoading={false}
        error={null}
        canSave={false}
        onSaveCurrent={vi.fn()}
        onLoadSave={vi.fn()}
        onRepairSave={onRepairSave}
        onDeleteSave={vi.fn()}
        onClearSaves={vi.fn()}
        onImportSaves={vi.fn()}
        onExportSaves={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const repairButton = screen.getByRole('button', { name: '存档修复' });
    const repairHelpId = repairButton.getAttribute('aria-describedby');
    expect(repairButton).toHaveAttribute(
      'title',
      expect.stringContaining('不会让 AI 重写整份存档')
    );
    expect(repairHelpId).toBeTruthy();
    expect(document.getElementById(repairHelpId!)).toHaveTextContent(
      '只审计并修复已识别的结构缺口'
    );

    fireEvent.click(repairButton);

    await waitFor(() => expect(onRepairSave).toHaveBeenCalledWith('repair-me'));
    expect(screen.getByRole('status')).toHaveTextContent('本次补齐 2 名人物');
    vi.restoreAllMocks();
  });
});

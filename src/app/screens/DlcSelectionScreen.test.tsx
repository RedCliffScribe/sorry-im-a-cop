import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OfficialDlcManifest } from '../../domain/dlc/types';
import { urbanLegendsFormalManifest } from '../../domain/dlc/urbanLegends/content';
import { DlcSelectionScreen } from './DlcSelectionScreen';

const mixedCompatibilityManifest: OfficialDlcManifest = {
  ...urbanLegendsFormalManifest,
  worldCompatibility: [
    ...urbanLegendsFormalManifest.worldCompatibility,
    {
      worldpackId: 'future_worldpack',
      status: 'unsupported',
      reason: '该扩展尚未完成此世界包的时代与机构适配。'
    }
  ]
};

describe('DlcSelectionScreen', () => {
  it('publishes released narrative and system DLCs unselected and keeps Alpha hidden', () => {
    const onContinue = vi.fn();
    render(
      <DlcSelectionScreen
        worldpackId="hk_1988"
        onBack={vi.fn()}
        onContinue={onContinue}
      />
    );

    expect(screen.getByRole('checkbox', { name: '将都市怪谈加入本局' })).not.toBeChecked();
    expect(screen.queryByText('都市怪谈 Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('都市怪谈')).toBeInTheDocument();
    expect(screen.getByText('警队晋升')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '将警队晋升加入本局' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '继续开局' }));
    expect(onContinue).toHaveBeenCalledWith([]);
  });

  it('adds the system DLC only after an explicit player choice', () => {
    const onContinue = vi.fn();
    render(
      <DlcSelectionScreen
        worldpackId="hk_1988"
        onBack={vi.fn()}
        onContinue={onContinue}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: '将警队晋升加入本局' });
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '继续开局' }));
    expect(onContinue).toHaveBeenCalledWith(['police_promotion']);
  });

  it('defaults released DLCs to unselected and submits only an explicit choice', () => {
    const onContinue = vi.fn();
    render(
      <DlcSelectionScreen
        worldpackId="hk_1988"
        manifests={[mixedCompatibilityManifest]}
        onBack={vi.fn()}
        onContinue={onContinue}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: '将都市怪谈加入本局' });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText('香港 1988')).toBeInTheDocument();
    expect(screen.getByText(/已为香港 1988/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续开局' }));
    expect(onContinue).toHaveBeenLastCalledWith([]);

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(screen.getByText('已选择')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续开局' }));
    expect(onContinue).toHaveBeenLastCalledWith(['urban_legends']);
  });

  it('greys out an incompatible DLC and shows the manifest reason', () => {
    const onContinue = vi.fn();
    render(
      <DlcSelectionScreen
        worldpackId="future_worldpack"
        manifests={[mixedCompatibilityManifest]}
        initialSelectedDlcIds={['urban_legends']}
        onBack={vi.fn()}
        onContinue={onContinue}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: '将都市怪谈加入本局' });
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText('该扩展尚未完成此世界包的时代与机构适配。')).toBeInTheDocument();
    expect(screen.getByText('不支持')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续开局' }));
    expect(onContinue).toHaveBeenCalledWith([]);
  });

  it('drops unknown initial selections instead of leaking them into a new save', () => {
    const onContinue = vi.fn();
    render(
      <DlcSelectionScreen
        worldpackId="hk_1988"
        manifests={[mixedCompatibilityManifest]}
        initialSelectedDlcIds={['unknown_dlc']}
        onBack={vi.fn()}
        onContinue={onContinue}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '继续开局' }));
    expect(onContinue).toHaveBeenCalledWith([]);
  });
});

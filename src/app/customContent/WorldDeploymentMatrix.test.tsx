import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HK_1988_ADAPTATION_DESCRIPTOR } from '../../domain/worldpack/adaptationRegistry';
import { WorldDeploymentMatrix } from './WorldDeploymentMatrix';

describe('WorldDeploymentMatrix', () => {
  it('defaults an unknown worldpack row to disabled', () => {
    render(
      <WorldDeploymentMatrix
        descriptors={[HK_1988_ADAPTATION_DESCRIPTOR]}
        deployments={[]}
        readOnly
      />
    );

    expect(screen.getByRole('combobox', {
      name: '香港 1988投放方式'
    })).toHaveValue('disabled');
    expect(screen.getByRole('checkbox', {
      name: '新游戏默认选中'
    })).toBeDisabled();
  });

  it('edits a deployment without allowing disabled content as a new-game default', () => {
    const onChange = vi.fn();
    const view = render(
      <WorldDeploymentMatrix
        descriptors={[HK_1988_ADAPTATION_DESCRIPTOR]}
        deployments={[]}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByRole('combobox', {
      name: '香港 1988投放方式'
    }), { target: { value: 'native' } });
    expect(onChange).toHaveBeenLastCalledWith([
      {
        worldpackId: 'hk_1988',
        mode: 'native',
        defaultEnabledForNewGame: false
      }
    ]);

    view.rerender(
      <WorldDeploymentMatrix
        descriptors={[HK_1988_ADAPTATION_DESCRIPTOR]}
        deployments={[
          {
            worldpackId: 'hk_1988',
            mode: 'native',
            defaultEnabledForNewGame: true
          }
        ]}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByRole('combobox', {
      name: '香港 1988投放方式'
    }), { target: { value: 'disabled' } });
    expect(onChange).toHaveBeenLastCalledWith([
      {
        worldpackId: 'hk_1988',
        mode: 'disabled',
        defaultEnabledForNewGame: false
      }
    ]);
  });
});

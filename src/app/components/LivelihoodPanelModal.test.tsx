import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { Actor } from '../../domain/runtime/types';
import { LivelihoodPanelModal } from './LivelihoodPanelModal';

function createHospitalState() {
  const state = createInitialRuntimeState({
    currentIdentity: 'civilian',
    civilianProfileId: 'hospital_nurse'
  });
  const profile = state.actors.player.roleProfiles.civilian!;
  const organizationId = profile.employerOrganizationId!;
  state.actors.actor_charge_nurse = {
    ...state.actors.player,
    actorId: 'actor_charge_nurse',
    name: '陈美珍',
    publicIdentity: '护士长',
    currentIdentity: 'civilian',
    presence: 'mentioned',
    visibility: 'player_known',
    organizationIds: [organizationId],
    organizationRelations: [
      {
        organizationId,
        relationType: 'manager',
        roleTitle: '护士长',
        departmentOrUnit: '急症室',
        summary: '负责排班和护理交接。',
        visibility: 'player_known',
        isPrimary: true
      }
    ]
  } as Actor;
  state.actors.player.roleProfiles.civilian = {
    ...profile,
    workUnitSummary: '急症室',
    livelihoodActorIds: ['actor_charge_nurse']
  };
  state.dynamicEvents.currentMatters.matter_shift = {
    id: 'matter_shift',
    title: '夜班顶更',
    summary: '护士长询问玩家能否临时顶夜班。',
    status: 'active',
    priority: 70,
    visibility: 'known',
    source: 'workplace_notice',
    matterKind: 'livelihood',
    pressureLevel: 2,
    currentHook: '今晚仍缺一名当值护士。',
    consequenceHint: '不回应会让排班继续悬空。',
    relatedActorIds: ['actor_charge_nurse'],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedOrganizationIds: [organizationId],
    createdAt: state.time,
    updatedAt: state.time
  };
  return state;
}

describe('LivelihoodPanelModal', () => {
  it('projects the civilian role, shared employer, work relation and livelihood matter', () => {
    const state = createHospitalState();

    render(
      <LivelihoodPanelModal
        state={state}
        onClose={vi.fn()}
        onDraftPlayerAction={vi.fn()}
        onOpenInstitution={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: '职业与营生' });
    expect(dialog).toHaveTextContent('医院护士');
    expect(dialog).toHaveTextContent('伊利沙伯医院');
    expect(dialog).toHaveTextContent('急症室');
    expect(dialog).toHaveTextContent('陈美珍');
    expect(dialog).toHaveTextContent('夜班顶更');
    expect(dialog).toHaveTextContent('上班安排');
    expect(dialog).toHaveTextContent('周一至周五 · 轮班日更 · 08:00–16:00');
    expect(dialog).toHaveTextContent('下次上班');
    expect(dialog).toHaveTextContent('周六、周日休息');
  });

  it('only drafts an action and does not execute it', () => {
    const onDraftPlayerAction = vi.fn();
    const onClose = vi.fn();

    render(
      <LivelihoodPanelModal
        state={createHospitalState()}
        onClose={onClose}
        onDraftPlayerAction={onDraftPlayerAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /找陈美珍谈谈/ }));

    expect(onDraftPlayerAction).toHaveBeenCalledWith('找陈美珍谈谈最近的工作安排');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens the same employer in the institution panel', () => {
    const state = createHospitalState();
    const onOpenInstitution = vi.fn();

    render(
      <LivelihoodPanelModal
        state={state}
        onClose={vi.fn()}
        onDraftPlayerAction={vi.fn()}
        onOpenInstitution={onOpenInstitution}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '查看供职机构' }));

    expect(onOpenInstitution).toHaveBeenCalledWith(
      state.actors.player.roleProfiles.civilian?.employerOrganizationId
    );
  });
});

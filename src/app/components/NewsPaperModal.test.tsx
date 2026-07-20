import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createActorDefaults } from '../../domain/runtime/actorFactory';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { GameTime, NewsIssue, RuntimeState } from '../../domain/runtime/types';
import { NewsPaperModal } from './NewsPaperModal';

function time(day: number): GameTime {
  return { year: 1988, month: 6, day, hour: 8, minute: 0 };
}

function createIssue(overrides: Partial<NewsIssue> & Pick<NewsIssue, 'id' | 'outletName' | 'headline'>): NewsIssue {
  return {
    id: overrides.id,
    date: overrides.date ?? time(10),
    outletName: overrides.outletName,
    headline: overrides.headline,
    summary: overrides.summary ?? `${overrides.headline}摘要。`,
    read: overrides.read ?? false,
    createdAt: overrides.createdAt ?? time(10),
    updatedAt: overrides.updatedAt ?? time(10),
    articles: overrides.articles ?? [],
    important: overrides.important,
    archivedAt: overrides.archivedAt
  };
}

function withNewsFixtures(): RuntimeState {
  const state = createInitialRuntimeState();
  state.time = time(10);
  state.actors.npc_reported = createActorDefaults({
    actorId: 'npc_reported',
    name: '林淑仪',
    gender: 'female',
    currentIdentity: 'civilian',
    publicIdentity: '百货公司售货员',
    profileSummary: '与玩家相识的百货公司售货员。',
    presence: 'absent',
    visibility: 'player_known',
    importance: 70
  });
  state.dynamicEvents.newsIssues = {
    news_latest: createIssue({
      id: 'news_latest',
      outletName: '大公报',
      headline: '警员与售货员共赴晚宴',
      articles: [
        {
          id: 'article_latest_local',
          section: 'local',
          headline: '警员与售货员共赴晚宴',
          body: '报章称两人在中环一间餐厅共进晚餐。',
          tone: 'sensational',
          playerRelated: true,
          relatedActorIds: ['player', 'npc_reported'],
          relatedPlaceIds: [state.location.currentPlaceId],
          relatedCaseIds: [],
          relatedOrganizationIds: []
        }
      ]
    }),
    news_recent: createIssue({
      id: 'news_recent',
      date: time(9),
      outletName: '明报',
      headline: '地产股交投活跃',
      read: true
    }),
    news_important: createIssue({
      id: 'news_important',
      date: time(1),
      outletName: '星岛日报',
      headline: '九龙城寨清拆消息',
      important: true
    }),
    news_archived: createIssue({
      id: 'news_archived',
      date: time(5),
      outletName: '成报',
      headline: '旧日街坊消息',
      archivedAt: time(8),
      read: true
    })
  };
  return state;
}

function Harness({ initialState, onStateChange }: { initialState: RuntimeState; onStateChange: (state: RuntimeState) => void }) {
  const [state, setState] = useState(initialState);
  const handleStateChange = (next: RuntimeState) => {
    onStateChange(next);
    setState(next);
  };
  return <NewsPaperModal state={state} onStateChange={handleStateChange} onClose={vi.fn()} />;
}

function renderPanel(state = withNewsFixtures(), onStateChange = vi.fn()) {
  return {
    ...render(<Harness initialState={state} onStateChange={onStateChange} />),
    onStateChange
  };
}

describe('NewsPaperModal', () => {
  it('renders latest, important and archived tabs with mutually exclusive counts', () => {
    renderPanel();

    expect(screen.getByRole('tab', { name: /最新/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /重要/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /归档/ })).toHaveTextContent('1');
    expect(screen.getByLabelText('最新报纸')).toHaveTextContent('大公报');
    expect(screen.getByLabelText('最新报纸')).toHaveTextContent('明报');
    expect(screen.getByLabelText('最新报纸')).not.toHaveTextContent('星岛日报');
  });

  it('renders a newspaper-like issue with articles and player-related marker', () => {
    renderPanel();

    const dialog = screen.getByRole('dialog', { name: '新闻' });
    expect(dialog).toHaveTextContent('大公报');
    expect(dialog).toHaveTextContent('警员与售货员共赴晚宴');
    expect(dialog).toHaveTextContent('与你有关');
    expect(dialog).not.toHaveTextContent('sensational');
  });

  it('switches between newspaper issues inside the active category', () => {
    renderPanel();

    const dialog = screen.getByRole('dialog', { name: '新闻' });
    fireEvent.click(within(screen.getByLabelText('最新报纸')).getByRole('button', { name: /阅读明报/ }));

    expect(dialog).toHaveTextContent('地产股交投活跃');
    expect(dialog).not.toHaveTextContent('警员与售货员共赴晚宴');
  });

  it('moves an issue to important and can then manually archive it', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '标记重要：大公报' }));
    fireEvent.click(screen.getByRole('tab', { name: /重要/ }));
    expect(screen.getByLabelText('重要报纸')).toHaveTextContent('大公报');
    expect(screen.getByLabelText('重要报纸')).toHaveTextContent('星岛日报');

    fireEvent.click(screen.getByRole('button', { name: '归档报纸：大公报' }));
    fireEvent.click(screen.getByRole('tab', { name: /归档/ }));
    await waitFor(() => expect(screen.getByLabelText('归档报纸')).toHaveTextContent('大公报'));
    expect(screen.getByRole('tab', { name: /归档/ })).toHaveTextContent('2');
  });

  it('marks the displayed player-related issue as read and writes one player claim memory', async () => {
    const onStateChange = vi.fn();
    renderPanel(withNewsFixtures(), onStateChange);

    await waitFor(() => {
      const latestState = onStateChange.mock.calls.at(-1)?.[0] as RuntimeState | undefined;
      expect(latestState?.dynamicEvents.newsIssues.news_latest.read).toBe(true);
      expect(
        Object.values(latestState?.memories ?? {}).filter((memory) => memory.kind === 'player')
      ).toHaveLength(1);
    });

    const callsAfterRead = onStateChange.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onStateChange.mock.calls.length).toBe(callsAfterRead);
  });

  it('renders empty state and zero counts when no newspaper issue exists', () => {
    renderPanel(createInitialRuntimeState());

    expect(screen.getByRole('dialog', { name: '新闻' })).toHaveTextContent('暂无报纸');
    expect(screen.getByRole('tab', { name: /最新/ })).toHaveTextContent('0');
    expect(screen.getByRole('tab', { name: /重要/ })).toHaveTextContent('0');
    expect(screen.getByRole('tab', { name: /归档/ })).toHaveTextContent('0');
  });
});

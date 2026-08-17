import { fireEvent, render, screen } from '@testing-library/react';
// @ts-expect-error The app tsconfig intentionally omits Node ambient types; this test only reads CSS text.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { StoryEntryBody } from './StoryEntryBody';

describe('StoryEntryBody dialogue avatars', () => {
  it('stacks the speaker above the dialogue while keeping the avatar in its own column', () => {
    const css = readFileSync('src/styles/global.css', 'utf8').replace(/\r\n/g, '\n');
    const dialogueRowRule = css.match(/\.story-segment-dialogue\s*\{([^}]*)\}/)?.[1] ?? '';
    const copyRule = css.match(/\.story-dialogue-copy\s*\{([^}]*)\}/)?.[1] ?? '';
    const speakerRule = css.match(/\.story-dialogue-speaker\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(dialogueRowRule).toContain('grid-template-columns: 88px minmax(0, 1fr)');
    expect(copyRule).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(copyRule).not.toMatch(/grid-template-columns:\s*44px/);
    expect(speakerRule).toContain('justify-self: start');
    expect(speakerRule).toContain('max-width: 100%');
    expect(css).toContain("@media (max-width: 500px)");
    expect(css).toContain(".story-dialogue-copy {\n    display: contents;");
    expect(css).toContain(".story-segment-dialogue p {\n    grid-column: 1 / -1;");
  });

  it('renders an avatar through the frozen speaker-to-actor id after the actor name changes', () => {
    const state = createInitialRuntimeState();
    const actor = Object.values(state.actors)[0];
    actor.name = '陈强';
    const originalName = actor.name;
    actor.name = '改名后的角色';
    render(
      <StoryEntryBody
        entry={{
          turnId: 'turn_1',
          speaker: 'narrator',
          text: `【${originalName}】收到。`,
          gameTime: state.time,
          dialogueSpeakerActorIds: { [originalName]: actor.actorId }
        }}
        actors={state.actors}
        dialogueAvatars={new Map([[actor.actorId, { url: 'blob:avatar', alt: `${actor.name} 对话头像` }]])}
      />
    );

    expect(screen.getByRole('img', { name: '改名后的角色 对话头像' })).toHaveAttribute('src', 'blob:avatar');
    expect(screen.getByText(originalName)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: `查看${originalName}头像大图` }));
    expect(screen.getByRole('dialog', { name: `${originalName}头像大图` })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `${originalName}头像大图` })).toHaveAttribute('src', 'blob:avatar');
    fireEvent.click(screen.getByRole('button', { name: '关闭头像大图' }));
    expect(screen.queryByRole('dialog', { name: `${originalName}头像大图` })).not.toBeInTheDocument();
  });

  it('keeps dialogue readable when no unique actor image can be resolved', () => {
    const state = createInitialRuntimeState();
    const { container } = render(
      <StoryEntryBody
        entry={{ turnId: 'turn_legacy', speaker: 'narrator', text: '【陌生人】别回头。', gameTime: state.time }}
        actors={state.actors}
        dialogueAvatars={new Map()}
      />
    );
    expect(container.querySelector('.story-segment-dialogue')).toHaveAttribute('data-has-avatar', 'false');
    expect(screen.getByText('别回头。')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps tagged narration, plain text, and inner monologue in their existing visual forms', () => {
    const state = createInitialRuntimeState();
    const { container } = render(
      <StoryEntryBody
        entry={{
          turnId: 'turn_blocks_ui',
          speaker: 'narrator',
          text: '【旁白】雨还在下。\n没有标签的一行。\n【内心】先别出声。',
          gameTime: state.time
        }}
        actors={state.actors}
      />
    );

    expect(container.querySelector('.story-segment-narration')).toHaveTextContent('雨还在下。');
    expect(container.querySelector('.story-segment-plain')).toHaveTextContent('没有标签的一行。');
    expect(container.querySelector('.story-segment-dialogue')).toHaveTextContent('内心先别出声。');
  });
});

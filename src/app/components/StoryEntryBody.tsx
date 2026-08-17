import { Fragment, useState, type ReactNode } from 'react';
import { resolveCanonicalActorId } from '../../domain/runtime/storyDialogueActors';
import { getStoryBlocks } from '../../domain/runtime/storyBlocks';
import type { Actor, StoryEntry } from '../../domain/runtime/types';

export function StoryEntryBody({
  entry,
  visualsByBlock,
  actors,
  actorIdAliases,
  dialogueAvatars
}: {
  entry: StoryEntry;
  visualsByBlock?: ReadonlyMap<number, ReactNode[]>;
  actors?: Record<string, Actor>;
  actorIdAliases?: Record<string, string>;
  dialogueAvatars?: ReadonlyMap<string, { url: string; alt: string }>;
}) {
  const [previewAvatar, setPreviewAvatar] = useState<{
    url: string;
    alt: string;
    speaker: string;
  }>();
  if (entry.speaker !== 'narrator') return <p>{entry.text}</p>;
  const blocks = getStoryBlocks(entry, { actors, actorIdAliases });

  return (
    <div className="story-segments">
      {blocks.map((block, index) => (
        <Fragment key={`${block.type}-${index}`}>
          {block.type === 'dialogue' || block.type === 'inner_monologue' ? (
            (() => {
              const speaker = block.type === 'dialogue' ? block.speakerLabel : '内心';
              const storedActorId = block.type === 'dialogue' ? block.speakerActorId : undefined;
              const actorId = storedActorId && actors
                ? resolveCanonicalActorId(storedActorId, actors, actorIdAliases)
                : storedActorId;
              const avatar = actorId ? dialogueAvatars?.get(actorId) : undefined;
              return (
                <div className="story-segment story-segment-dialogue" data-has-avatar={Boolean(avatar)}>
                  {avatar ? (
                    <button
                      type="button"
                      className="story-dialogue-avatar-button"
                      aria-label={`查看${speaker}头像大图`}
                      onClick={() => setPreviewAvatar({ ...avatar, speaker })}
                    >
                      <img className="story-dialogue-avatar" src={avatar.url} alt={avatar.alt} />
                    </button>
                  ) : null}
                  <div className="story-dialogue-copy">
                    <span className="story-dialogue-speaker">{speaker}</span>
                    <p>{block.text}</p>
                  </div>
                </div>
              );
            })()
          ) : (
            <p className={`story-segment story-segment-${block.sourceStyle === 'plain' ? 'plain' : 'narration'}`}>
              {block.text}
            </p>
          )}
          {visualsByBlock?.get(index)}
        </Fragment>
      ))}
      {previewAvatar ? (
        <div
          className="story-dialogue-avatar-preview-backdrop"
          role="presentation"
          onClick={() => setPreviewAvatar(undefined)}
        >
          <section
            className="story-dialogue-avatar-preview"
            role="dialog"
            aria-modal="true"
            aria-label={`${previewAvatar.speaker}头像大图`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="关闭头像大图"
              onClick={() => setPreviewAvatar(undefined)}
            >
              关闭
            </button>
            <img src={previewAvatar.url} alt={`${previewAvatar.speaker}头像大图`} />
          </section>
        </div>
      ) : null}
    </div>
  );
}

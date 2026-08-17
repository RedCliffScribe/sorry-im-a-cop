import { useEffect, useState } from 'react';
import type { CustomCharacterDraft } from '../../domain/customContent/characterCreation';
import type {
  CustomEventCharacterCandidateDraft,
  CustomEventGroupDraft,
  CustomEventNodeDraft,
  CustomEventProjectConsistencyIssue,
  CustomEventProjectDraft,
  CustomEventRoleSlotDraft,
  CustomEventStageDraft,
  CustomImportedFactDraft
} from '../../domain/customContent/eventProjectCreation';
import type {
  CustomEventProjectSaveMode,
  ExistingCustomEventProjectState,
  SaveCustomEventProjectInput
} from '../../domain/customContent/eventProjectManagement';
import {
  createDefaultCustomCharacterAdaptationPolicy,
  type CustomContentWorldDeployment
} from '../../domain/customContent/worldAdaptation';
import { listWorldpackAdaptationDescriptors } from '../../domain/worldpack/adaptationRegistry';
import { AiGenerationStatus } from './AiGenerationStatus';
import { WorldDeploymentMatrix } from './WorldDeploymentMatrix';

export interface CustomEventProjectEditorInitialState {
  draft: CustomEventProjectDraft;
  projectDeployments: CustomContentWorldDeployment[];
  eventDeploymentOverrides: Record<
    string,
    CustomContentWorldDeployment[] | undefined
  >;
  existing?: ExistingCustomEventProjectState;
}

export interface ReusableCustomEventCharacterOption {
  candidate: CustomEventCharacterCandidateDraft;
}

interface CustomEventProjectEditorProps {
  profileReady: boolean;
  generationRouteLabel?: string;
  initialState?: CustomEventProjectEditorInitialState;
  reusableCharacters?: ReusableCustomEventCharacterOption[];
  onGenerate: (description: string) => Promise<CustomEventProjectDraft>;
  onConsistencyReview: (
    draft: CustomEventProjectDraft
  ) => Promise<CustomEventProjectConsistencyIssue[]>;
  onSave: (request: SaveCustomEventProjectInput) => Promise<void>;
  onClose: () => void;
}

type EventProjectEditorOperation = 'generate' | 'review' | 'save';

type DraftUpdater = (mutate: (draft: CustomEventProjectDraft) => void) => void;

function createDraftKey(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function lines(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|[,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function factsFromText(
  value: string,
  previous: readonly CustomImportedFactDraft[],
  prefix: string
): CustomImportedFactDraft[] {
  return lines(value).map((summary, index) => ({
    factKey: previous[index]?.factKey ?? createDraftKey(prefix),
    summary
  }));
}

function blankCharacter(): CustomEventCharacterCandidateDraft {
  const candidateKey = createDraftKey('candidate');
  const character: CustomCharacterDraft = {
    displayName: '',
    aliases: [],
    gender: '',
    profileSummary: '',
    backgroundSummary: '',
    corePersonality: [],
    values: [],
    coreMotivations: [],
    majorRelationships: [],
    entryMode: 'follow_project',
    adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy()
  };
  return { candidateKey, character };
}

function blankNode(): CustomEventNodeDraft {
  return {
    nodeKey: createDraftKey('node'),
    title: '',
    summary: '',
    prerequisites: [],
    entryConditions: [],
    blockers: [],
    characterUsages: [],
    knowledgeBoundary: {
      knownBy: [],
      hiddenFrom: [],
      readerOnly: false
    },
    possibleOutcomes: [],
    downstreamEffects: []
  };
}

function blankStage(): CustomEventStageDraft {
  return {
    stageKey: createDraftKey('stage'),
    title: '',
    summary: '',
    establishedSourceFacts: [],
    continuationSourceFacts: [],
    hardSourceConstraints: [],
    foreshadowingOptions: [],
    eventNodes: [blankNode()],
    completionHints: [],
    nextStageHints: []
  };
}

function blankRoleSlot(): CustomEventRoleSlotDraft {
  return {
    roleSlotKey: createDraftKey('role-slot'),
    title: '',
    summary: '',
    bindingMode: 'project_or_runtime',
    requirements: []
  };
}

function roleSlotUsageLabel(
  slot: CustomEventRoleSlotDraft,
  candidates: readonly CustomEventCharacterCandidateDraft[]
): string {
  const title = slot.title || slot.roleSlotKey;
  if (slot.bindingMode === 'current_player') {
    return `当前存档主角｜${title}`;
  }
  if (slot.bindingMode === 'fixed_character') {
    const characterName = candidates.find(
      (candidate) => candidate.candidateKey === slot.fixedCharacterKey
    )?.character.displayName;
    return characterName
      ? `固定人物｜${title}（${characterName}）`
      : `固定人物｜${title}`;
  }
  if (slot.bindingMode === 'global_allowed') {
    return `全局人物角色槽｜${title}`;
  }
  return `项目或存档人物角色槽｜${title}`;
}

function blankEventGroup(): CustomEventGroupDraft {
  return {
    eventGroupKey: createDraftKey('event-group-draft'),
    title: '',
    summary: '',
    invariantCore: [],
    mutableSlots: [],
    forbiddenAdaptations: [],
    characterCandidateKeys: [],
    roleSlots: [],
    stages: [blankStage()],
    entryMode: 'asap',
    reusePolicy: 'save_single_use',
    inheritProjectDeployments: true
  };
}

function blankProjectDraft(): CustomEventProjectDraft {
  return {
    project: {
      title: '',
      summary: '',
      conversionMode: 'structural_adaptation'
    },
    characterCandidates: [],
    eventGroups: [blankEventGroup()]
  };
}

function ProjectCharacterCard({
  candidate,
  latestCandidate,
  index,
  update,
  remove
}: {
  candidate: CustomEventCharacterCandidateDraft;
  latestCandidate?: CustomEventCharacterCandidateDraft;
  index: number;
  update: DraftUpdater;
  remove: () => void;
}) {
  const character = candidate.character;
  if (candidate.revisionRef) {
    const latestRevision = latestCandidate?.revisionRef?.revision;
    const canUpgrade = Boolean(
      latestCandidate &&
      typeof latestRevision === 'number' &&
      latestRevision > candidate.revisionRef.revision
    );
    return (
      <article className="ccw-event-card ccw-project-character-card ccw-library-character-card">
        <div className="ccw-event-card-heading">
          <strong>{character.displayName}</strong>
          <span>
            引用人物库 · revision {candidate.revisionRef.revision}
          </span>
          <button type="button" onClick={remove}>移除引用</button>
        </div>
        <p>{character.profileSummary}</p>
        {canUpgrade && latestCandidate ? (
          <div className="ccw-library-character-upgrade">
            <span>人物库已有 revision {latestRevision}；升级不会清空角色槽或事件节点配置。</span>
            <button
              type="button"
              onClick={() =>
                update((draft) => {
                  draft.characterCandidates[index] = structuredClone(latestCandidate);
                })
              }
            >
              升级到 revision {latestRevision}
            </button>
          </div>
        ) : null}
        <p className="ccw-inline-note">
          此事件锁定具体人物 revision；人物库发布新 revision 后，可在这里原位升级引用。
        </p>
      </article>
    );
  }
  const setCharacter = <K extends keyof CustomCharacterDraft>(
    key: K,
    value: CustomCharacterDraft[K]
  ) => {
    update((draft) => {
      draft.characterCandidates[index].character[key] = value;
    });
  };
  return (
    <article className="ccw-event-card ccw-project-character-card">
      <div className="ccw-event-card-heading">
        <strong>{character.displayName || `项目人物 ${index + 1}`}</strong>
        <button type="button" onClick={remove}>移除人物</button>
      </div>
      <div className="ccw-field-grid">
        <label>
          <span>姓名</span>
          <input
            value={character.displayName}
            onChange={(event) => setCharacter('displayName', event.target.value)}
          />
        </label>
        <label>
          <span>性别</span>
          <input
            value={character.gender}
            onChange={(event) => setCharacter('gender', event.target.value)}
          />
        </label>
      </div>
      <label>
        <span>人物摘要</span>
        <textarea
          rows={2}
          value={character.profileSummary}
          onChange={(event) => setCharacter('profileSummary', event.target.value)}
        />
      </label>
      <label>
        <span>背景摘要</span>
        <textarea
          rows={3}
          value={character.backgroundSummary}
          onChange={(event) =>
            setCharacter('backgroundSummary', event.target.value)
          }
        />
      </label>
      <div className="ccw-field-grid three">
        <label>
          <span>核心性格</span>
          <textarea
            rows={3}
            value={character.corePersonality.join('\n')}
            onChange={(event) =>
              setCharacter('corePersonality', lines(event.target.value))
            }
          />
        </label>
        <label>
          <span>价值观</span>
          <textarea
            rows={3}
            value={character.values.join('\n')}
            onChange={(event) => setCharacter('values', lines(event.target.value))}
          />
        </label>
        <label>
          <span>核心动机</span>
          <textarea
            rows={3}
            value={character.coreMotivations.join('\n')}
            onChange={(event) =>
              setCharacter('coreMotivations', lines(event.target.value))
            }
          />
        </label>
      </div>
    </article>
  );
}

function knowledgeBoundaryRoleLabel(
  slot: CustomEventRoleSlotDraft,
  candidates: readonly CustomEventCharacterCandidateDraft[]
): string {
  const fixedCharacter = slot.fixedCharacterKey
    ? candidates.find(
        (candidate) => candidate.candidateKey === slot.fixedCharacterKey
      )
    : undefined;
  return fixedCharacter
    ? `${slot.title || '未命名角色槽'}（${fixedCharacter.character.displayName}）`
    : slot.title || slot.roleSlotKey;
}

function KnowledgeBoundaryChoices({
  label,
  values,
  roleSlots,
  candidates,
  onChange
}: {
  label: string;
  values: string[];
  roleSlots: CustomEventRoleSlotDraft[];
  candidates: CustomEventCharacterCandidateDraft[];
  onChange: (values: string[]) => void;
}) {
  const roleSlotKeys = new Set(roleSlots.map((slot) => slot.roleSlotKey));
  const customValues = values.filter((value) => !roleSlotKeys.has(value));
  return (
    <fieldset className="ccw-knowledge-boundary-field">
      <legend>{label}</legend>
      {roleSlots.length > 0 ? (
        <div className="ccw-knowledge-role-options">
          {roleSlots.map((slot) => (
            <label key={slot.roleSlotKey} className="ccw-radio-row">
              <input
                type="checkbox"
                checked={values.includes(slot.roleSlotKey)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? Array.from(new Set([...values, slot.roleSlotKey]))
                      : values.filter((value) => value !== slot.roleSlotKey)
                  )
                }
              />
              {knowledgeBoundaryRoleLabel(slot, candidates)}
            </label>
          ))}
        </div>
      ) : (
        <p className="ccw-inline-note">先建立角色槽，便可直接勾选具体知情角色。</p>
      )}
      <label>
        <span>其他人物或群体</span>
        <textarea
          aria-label={`${label}（其他人物或群体）`}
          rows={2}
          placeholder="例如：玩家角色、公众、警方；不要填写 char_* 等内部 ID"
          value={customValues.join('\n')}
          onChange={(event) =>
            onChange([
              ...values.filter((value) => roleSlotKeys.has(value)),
              ...lines(event.target.value)
            ])
          }
        />
      </label>
    </fieldset>
  );
}

function EventNodeCard({
  node,
  groupIndex,
  stageIndex,
  nodeIndex,
  roleSlots,
  candidates,
  update,
  remove
}: {
  node: CustomEventNodeDraft;
  groupIndex: number;
  stageIndex: number;
  nodeIndex: number;
  roleSlots: CustomEventRoleSlotDraft[];
  candidates: CustomEventCharacterCandidateDraft[];
  update: DraftUpdater;
  remove: () => void;
}) {
  const mutateNode = (mutate: (draftNode: CustomEventNodeDraft) => void) => {
    update((draft) => {
      mutate(
        draft.eventGroups[groupIndex].stages[stageIndex].eventNodes[nodeIndex]
      );
    });
  };
  const addCurrentPlayerUsage = () => {
    update((draft) => {
      const group = draft.eventGroups[groupIndex];
      let playerSlot = group.roleSlots.find(
        (slot) => slot.bindingMode === 'current_player'
      );
      if (!playerSlot) {
        playerSlot = {
          roleSlotKey: createDraftKey('role-slot-player'),
          title: '当前存档主角',
          summary: '事件进入存档时自动绑定该局玩家角色。',
          bindingMode: 'current_player',
          requirements: []
        };
        group.roleSlots.push(playerSlot);
      }
      group.stages[stageIndex].eventNodes[nodeIndex].characterUsages.push({
        usageKey: createDraftKey('usage'),
        roleSlotKey: playerSlot.roleSlotKey,
        usageSummary: '',
        required: false
      });
    });
  };
  return (
    <article className="ccw-event-node-card">
      <div className="ccw-event-card-heading">
        <strong>{node.title || `事件节点 ${nodeIndex + 1}`}</strong>
        <button type="button" onClick={remove}>移除节点</button>
      </div>
      <label>
        <span>节点标题</span>
        <input
          value={node.title}
          onChange={(event) =>
            mutateNode((current) => {
              current.title = event.target.value;
            })
          }
        />
      </label>
      <label>
        <span>节点摘要</span>
        <textarea
          rows={3}
          value={node.summary}
          onChange={(event) =>
            mutateNode((current) => {
              current.summary = event.target.value;
            })
          }
        />
      </label>
      <div className="ccw-field-grid three">
        <label>
          <span>前提</span>
          <textarea
            rows={3}
            value={node.prerequisites.join('\n')}
            onChange={(event) =>
              mutateNode((current) => {
                current.prerequisites = lines(event.target.value);
              })
            }
          />
        </label>
        <label>
          <span>进入条件</span>
          <textarea
            rows={3}
            value={node.entryConditions.join('\n')}
            onChange={(event) =>
              mutateNode((current) => {
                current.entryConditions = lines(event.target.value);
              })
            }
          />
        </label>
        <label>
          <span>阻断条件</span>
          <textarea
            rows={3}
            value={node.blockers.join('\n')}
            onChange={(event) =>
              mutateNode((current) => {
                current.blockers = lines(event.target.value);
              })
            }
          />
        </label>
      </div>
      <div className="ccw-field-grid">
        <label>
          <span>可能结果</span>
          <textarea
            rows={3}
            value={node.possibleOutcomes.join('\n')}
            onChange={(event) =>
              mutateNode((current) => {
                current.possibleOutcomes = lines(event.target.value);
              })
            }
          />
        </label>
        <label>
          <span>后续影响</span>
          <textarea
            rows={3}
            value={node.downstreamEffects.join('\n')}
            onChange={(event) =>
              mutateNode((current) => {
                current.downstreamEffects = lines(event.target.value);
              })
            }
          />
        </label>
      </div>
      <details>
        <summary>信息边界</summary>
        <p className="ccw-inline-note">
          具体人物请勾选其角色槽；人物库角色先在上方固定到角色槽。公开信息可留空，不要手填人物内部 ID。
        </p>
        <div className="ccw-field-grid ccw-knowledge-boundary-grid">
          <KnowledgeBoundaryChoices
            label="谁知道"
            values={node.knowledgeBoundary.knownBy}
            roleSlots={roleSlots}
            candidates={candidates}
            onChange={(values) =>
              mutateNode((current) => {
                current.knowledgeBoundary.knownBy = values;
              })
            }
          />
          <KnowledgeBoundaryChoices
            label="向谁隐藏"
            values={node.knowledgeBoundary.hiddenFrom}
            roleSlots={roleSlots}
            candidates={candidates}
            onChange={(values) =>
              mutateNode((current) => {
                current.knowledgeBoundary.hiddenFrom = values;
              })
            }
          />
        </div>
        <label className="ccw-radio-row">
          <input
            type="checkbox"
            checked={node.knowledgeBoundary.readerOnly}
            onChange={(event) =>
              mutateNode((current) => {
                current.knowledgeBoundary.readerOnly = event.target.checked;
              })
            }
          />
          仅原作读者可见
        </label>
      </details>
      <section className="ccw-event-usages">
        <div className="ccw-event-card-heading">
          <strong>节点人物用途</strong>
          <button type="button" onClick={addCurrentPlayerUsage}>
            添加主角用途
          </button>
          <button
            type="button"
            onClick={() =>
              mutateNode((current) => {
                current.characterUsages.push({
                  usageKey: createDraftKey('usage'),
                  usageSummary: '',
                  required: false
                });
              })
            }
          >
            添加人物用途
          </button>
        </div>
        <p className="ccw-inline-note">
          “添加主角用途”会建立或复用当前存档主角角色槽；发布后会自动绑定玩家正在游玩的那名主角，不需要把主角另存为自定义人物。
        </p>
        {node.characterUsages.map((usage, usageIndex) => {
          const selectedRoleSlot = roleSlots.find(
            (slot) => slot.roleSlotKey === usage.roleSlotKey
          );
          const bindsCurrentPlayer =
            selectedRoleSlot?.bindingMode === 'current_player';
          return (
          <div className="ccw-event-usage-row" key={usage.usageKey}>
            <select
              aria-label="人物用途角色槽"
              value={usage.roleSlotKey ?? ''}
              onChange={(event) =>
                mutateNode((current) => {
                  const nextRoleSlotKey = event.target.value || undefined;
                  const target = current.characterUsages[usageIndex];
                  target.roleSlotKey = nextRoleSlotKey;
                  if (
                    roleSlots.find(
                      (slot) => slot.roleSlotKey === nextRoleSlotKey
                    )?.bindingMode === 'current_player'
                  ) {
                    target.characterCandidateKey = undefined;
                  }
                })
              }
            >
              <option value="">不绑定人物身份／角色槽</option>
              {roleSlots.map((slot) => (
                <option key={slot.roleSlotKey} value={slot.roleSlotKey}>
                  {roleSlotUsageLabel(slot, candidates)}
                </option>
              ))}
            </select>
            <select
              aria-label="人物用途固定人物"
              value={bindsCurrentPlayer ? '' : usage.characterCandidateKey ?? ''}
              disabled={bindsCurrentPlayer}
              onChange={(event) =>
                mutateNode((current) => {
                  current.characterUsages[usageIndex].characterCandidateKey =
                    event.target.value || undefined;
                })
              }
            >
              <option value="">
                {bindsCurrentPlayer
                  ? '当前存档主角（自动绑定）'
                  : '不固定项目人物'}
              </option>
              {candidates.map((candidate) => (
                <option key={candidate.candidateKey} value={candidate.candidateKey}>
                  {candidate.character.displayName || candidate.candidateKey}
                </option>
              ))}
            </select>
            <input
              aria-label="人物用途摘要"
              value={usage.usageSummary}
              onChange={(event) =>
                mutateNode((current) => {
                  current.characterUsages[usageIndex].usageSummary =
                    event.target.value;
                })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={usage.required}
                onChange={(event) =>
                  mutateNode((current) => {
                    current.characterUsages[usageIndex].required =
                      event.target.checked;
                  })
                }
              />
              必需
            </label>
            <button
              type="button"
              aria-label="移除人物用途"
              onClick={() =>
                mutateNode((current) => {
                  current.characterUsages.splice(usageIndex, 1);
                })
              }
            >
              ×
            </button>
          </div>
          );
        })}
      </section>
    </article>
  );
}

function EventStageCard({
  stage,
  groupIndex,
  stageIndex,
  roleSlots,
  candidates,
  update,
  remove
}: {
  stage: CustomEventStageDraft;
  groupIndex: number;
  stageIndex: number;
  roleSlots: CustomEventRoleSlotDraft[];
  candidates: CustomEventCharacterCandidateDraft[];
  update: DraftUpdater;
  remove: () => void;
}) {
  const mutateStage = (mutate: (draftStage: CustomEventStageDraft) => void) => {
    update((draft) => {
      mutate(draft.eventGroups[groupIndex].stages[stageIndex]);
    });
  };
  return (
    <details className="ccw-event-stage-card" open>
      <summary>{stage.title || `阶段 ${stageIndex + 1}`}</summary>
      <div className="ccw-event-stage-body">
        <div className="ccw-event-card-heading">
          <strong>阶段设定</strong>
          <button type="button" onClick={remove}>移除阶段</button>
        </div>
        <label>
          <span>阶段标题</span>
          <input
            value={stage.title}
            onChange={(event) =>
              mutateStage((current) => {
                current.title = event.target.value;
              })
            }
          />
        </label>
        <label>
          <span>阶段摘要</span>
          <textarea
            rows={3}
            value={stage.summary}
            onChange={(event) =>
              mutateStage((current) => {
                current.summary = event.target.value;
              })
            }
          />
        </label>
        <div className="ccw-field-grid three">
          <label>
            <span>已成立来源事实</span>
            <textarea
              rows={3}
              value={stage.establishedSourceFacts
                .map((fact) => fact.summary)
                .join('\n')}
              onChange={(event) =>
                mutateStage((current) => {
                  current.establishedSourceFacts = factsFromText(
                    event.target.value,
                    current.establishedSourceFacts,
                    'established-fact'
                  );
                })
              }
            />
          </label>
          <label>
            <span>承接来源事实</span>
            <textarea
              rows={3}
              value={stage.continuationSourceFacts
                .map((fact) => fact.summary)
                .join('\n')}
              onChange={(event) =>
                mutateStage((current) => {
                  current.continuationSourceFacts = factsFromText(
                    event.target.value,
                    current.continuationSourceFacts,
                    'continuation-fact'
                  );
                })
              }
            />
          </label>
          <label>
            <span>硬来源约束</span>
            <textarea
              rows={3}
              value={stage.hardSourceConstraints
                .map((fact) => fact.summary)
                .join('\n')}
              onChange={(event) =>
                mutateStage((current) => {
                  current.hardSourceConstraints = factsFromText(
                    event.target.value,
                    current.hardSourceConstraints,
                    'constraint-fact'
                  );
                })
              }
            />
          </label>
        </div>
        <div className="ccw-field-grid three">
          <label>
            <span>伏笔选项</span>
            <textarea
              rows={3}
              value={stage.foreshadowingOptions.join('\n')}
              onChange={(event) =>
                mutateStage((current) => {
                  current.foreshadowingOptions = lines(event.target.value);
                })
              }
            />
          </label>
          <label>
            <span>完成提示</span>
            <textarea
              rows={3}
              value={stage.completionHints.join('\n')}
              onChange={(event) =>
                mutateStage((current) => {
                  current.completionHints = lines(event.target.value);
                })
              }
            />
          </label>
          <label>
            <span>下一阶段提示</span>
            <textarea
              rows={3}
              value={stage.nextStageHints.join('\n')}
              onChange={(event) =>
                mutateStage((current) => {
                  current.nextStageHints = lines(event.target.value);
                })
              }
            />
          </label>
        </div>
        <section className="ccw-event-node-list">
          <div className="ccw-event-card-heading">
            <strong>事件节点</strong>
            <button
              type="button"
              onClick={() =>
                mutateStage((current) => {
                  current.eventNodes.push(blankNode());
                })
              }
            >
              添加节点
            </button>
          </div>
          {stage.eventNodes.map((node, nodeIndex) => (
            <EventNodeCard
              key={node.nodeKey}
              node={node}
              groupIndex={groupIndex}
              stageIndex={stageIndex}
              nodeIndex={nodeIndex}
              roleSlots={roleSlots}
              candidates={candidates}
              update={update}
              remove={() =>
                mutateStage((current) => {
                  current.eventNodes.splice(nodeIndex, 1);
                })
              }
            />
          ))}
        </section>
      </div>
    </details>
  );
}

function EventGroupCard({
  group,
  groupIndex,
  candidates,
  deployments,
  update,
  onDeploymentsChange,
  remove
}: {
  group: CustomEventGroupDraft;
  groupIndex: number;
  candidates: CustomEventCharacterCandidateDraft[];
  deployments: CustomContentWorldDeployment[];
  update: DraftUpdater;
  onDeploymentsChange: (deployments: CustomContentWorldDeployment[]) => void;
  remove: () => void;
}) {
  const mutateGroup = (mutate: (draftGroup: CustomEventGroupDraft) => void) => {
    update((draft) => {
      mutate(draft.eventGroups[groupIndex]);
    });
  };
  return (
    <article className="ccw-event-card ccw-event-group-card">
      <div className="ccw-event-card-heading">
        <strong>{group.title || `事件组 ${groupIndex + 1}`}</strong>
        <button type="button" onClick={remove}>移除事件组</button>
      </div>
      <label>
        <span>事件组标题</span>
        <input
          value={group.title}
          onChange={(event) =>
            mutateGroup((current) => {
              current.title = event.target.value;
            })
          }
        />
      </label>
      <label>
        <span>事件组摘要</span>
        <textarea
          rows={3}
          value={group.summary}
          onChange={(event) =>
            mutateGroup((current) => {
              current.summary = event.target.value;
            })
          }
        />
      </label>
      <div className="ccw-field-grid three">
        <label>
          <span>核心不变量</span>
          <textarea
            rows={4}
            value={group.invariantCore.join('\n')}
            onChange={(event) =>
              mutateGroup((current) => {
                current.invariantCore = lines(event.target.value);
              })
            }
          />
        </label>
        <label>
          <span>可变槽</span>
          <textarea
            rows={4}
            value={group.mutableSlots.join('\n')}
            onChange={(event) =>
              mutateGroup((current) => {
                current.mutableSlots = lines(event.target.value);
              })
            }
          />
        </label>
        <label>
          <span>禁止适配</span>
          <textarea
            rows={4}
            value={group.forbiddenAdaptations.join('\n')}
            onChange={(event) =>
              mutateGroup((current) => {
                current.forbiddenAdaptations = lines(event.target.value);
              })
            }
          />
        </label>
      </div>
      <div className="ccw-field-grid">
        <label>
          <span>进入倾向</span>
          <select
            value={group.entryMode}
            onChange={(event) =>
              mutateGroup((current) => {
                current.entryMode = event.target
                  .value as CustomEventGroupDraft['entryMode'];
              })
            }
          >
            <option value="manual">等我手动引入</option>
            <option value="natural">自然呈现</option>
            <option value="priority">优先呈现</option>
            <option value="asap">尽快呈现</option>
          </select>
        </label>
        <label>
          <span>复用策略</span>
          <select
            value={group.reusePolicy}
            onChange={(event) =>
              mutateGroup((current) => {
                current.reusePolicy = event.target
                  .value as CustomEventGroupDraft['reusePolicy'];
              })
            }
          >
            <option value="save_single_use">每个存档只使用一次</option>
            <option value="repeatable_motif">可重复母题</option>
          </select>
        </label>
      </div>
      {candidates.length > 0 ? (
        <fieldset className="ccw-event-character-picker">
          <legend>事件组项目人物</legend>
          {candidates.map((candidate) => (
            <label key={candidate.candidateKey}>
              <input
                type="checkbox"
                checked={group.characterCandidateKeys.includes(
                  candidate.candidateKey
                )}
                onChange={() =>
                  mutateGroup((current) => {
                    current.characterCandidateKeys =
                      current.characterCandidateKeys.includes(
                        candidate.candidateKey
                      )
                        ? current.characterCandidateKeys.filter(
                            (key) => key !== candidate.candidateKey
                          )
                        : [
                            ...current.characterCandidateKeys,
                            candidate.candidateKey
                          ];
                  })
                }
              />
              {candidate.character.displayName || candidate.candidateKey}
            </label>
          ))}
        </fieldset>
      ) : null}
      <section className="ccw-event-role-slots">
        <div className="ccw-event-card-heading">
          <strong>角色槽</strong>
          <button
            type="button"
            onClick={() =>
              mutateGroup((current) => {
                current.roleSlots.push(blankRoleSlot());
              })
            }
          >
            添加角色槽
          </button>
        </div>
        {group.roleSlots.map((slot, slotIndex) => (
          <div className="ccw-event-role-slot" key={slot.roleSlotKey}>
            <input
              aria-label="角色槽标题"
              placeholder="角色槽标题"
              value={slot.title}
              onChange={(event) =>
                mutateGroup((current) => {
                  current.roleSlots[slotIndex].title = event.target.value;
                })
              }
            />
            <input
              aria-label="角色槽摘要"
              placeholder="角色槽摘要"
              value={slot.summary}
              onChange={(event) =>
                mutateGroup((current) => {
                  current.roleSlots[slotIndex].summary = event.target.value;
                })
              }
            />
            <select
              aria-label="角色槽绑定模式"
              value={slot.bindingMode}
              onChange={(event) =>
                mutateGroup((current) => {
                  const target = current.roleSlots[slotIndex];
                  target.bindingMode = event.target
                    .value as CustomEventRoleSlotDraft['bindingMode'];
                  if (target.bindingMode !== 'fixed_character') {
                    target.fixedCharacterKey = undefined;
                  }
                })
              }
            >
              <option value="project_or_runtime">项目人物或存档人物</option>
              <option value="fixed_character">固定人物库或项目人物</option>
              <option value="current_player">当前存档主角</option>
              <option value="global_allowed">允许全局人物</option>
            </select>
            {slot.bindingMode === 'fixed_character' ? (
              <select
                aria-label="角色槽固定人物"
                value={slot.fixedCharacterKey ?? ''}
                onChange={(event) =>
                  mutateGroup((current) => {
                    current.roleSlots[slotIndex].fixedCharacterKey =
                      event.target.value || undefined;
                  })
                }
              >
                <option value="">选择固定人物</option>
                {candidates.map((candidate) => (
                  <option
                    key={candidate.candidateKey}
                    value={candidate.candidateKey}
                  >
                    {candidate.character.displayName || candidate.candidateKey}
                  </option>
                ))}
              </select>
            ) : null}
            <textarea
              aria-label="角色槽要求"
              placeholder="每行一项要求"
              rows={2}
              value={slot.requirements.join('\n')}
              onChange={(event) =>
                mutateGroup((current) => {
                  current.roleSlots[slotIndex].requirements = lines(
                    event.target.value
                  );
                })
              }
            />
            <button
              type="button"
              aria-label="移除角色槽"
              onClick={() =>
                mutateGroup((current) => {
                  const removedRoleSlotKey =
                    current.roleSlots[slotIndex].roleSlotKey;
                  current.roleSlots.splice(slotIndex, 1);
                  for (const stage of current.stages) {
                    for (const node of stage.eventNodes) {
                      node.knowledgeBoundary.knownBy =
                        node.knowledgeBoundary.knownBy.filter(
                          (value) => value !== removedRoleSlotKey
                        );
                      node.knowledgeBoundary.hiddenFrom =
                        node.knowledgeBoundary.hiddenFrom.filter(
                          (value) => value !== removedRoleSlotKey
                        );
                      for (const usage of node.characterUsages) {
                        if (usage.roleSlotKey === removedRoleSlotKey) {
                          usage.roleSlotKey = undefined;
                        }
                      }
                    }
                  }
                })
              }
            >
              ×
            </button>
          </div>
        ))}
      </section>
      <section className="ccw-event-stage-list">
        <div className="ccw-event-card-heading">
          <strong>阶段与节点</strong>
          <button
            type="button"
            onClick={() =>
              mutateGroup((current) => {
                current.stages.push(blankStage());
              })
            }
          >
            添加阶段
          </button>
        </div>
        {group.stages.map((stage, stageIndex) => (
          <EventStageCard
            key={stage.stageKey}
            stage={stage}
            groupIndex={groupIndex}
            stageIndex={stageIndex}
            roleSlots={group.roleSlots}
            candidates={candidates}
            update={update}
            remove={() =>
              mutateGroup((current) => {
                current.stages.splice(stageIndex, 1);
              })
            }
          />
        ))}
      </section>
      <section className="ccw-event-deployment-override">
        <label className="ccw-radio-row">
          <input
            type="checkbox"
            checked={group.inheritProjectDeployments}
            onChange={(event) =>
              mutateGroup((current) => {
                current.inheritProjectDeployments = event.target.checked;
              })
            }
          />
          继承项目世界包投放
        </label>
        {!group.inheritProjectDeployments ? (
          <WorldDeploymentMatrix
            descriptors={listWorldpackAdaptationDescriptors()}
            deployments={deployments}
            onChange={onDeploymentsChange}
          />
        ) : null}
      </section>
    </article>
  );
}

export function CustomEventProjectEditor({
  profileReady,
  generationRouteLabel,
  initialState,
  reusableCharacters = [],
  onGenerate,
  onConsistencyReview,
  onSave,
  onClose
}: CustomEventProjectEditorProps) {
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<CustomEventProjectDraft | null>(
    initialState ? structuredClone(initialState.draft) : null
  );
  const [projectDeployments, setProjectDeployments] = useState<
    CustomContentWorldDeployment[]
  >(initialState?.projectDeployments.map((item) => ({ ...item })) ?? []);
  const [eventDeploymentOverrides, setEventDeploymentOverrides] = useState<
    Record<string, CustomContentWorldDeployment[] | undefined>
  >(structuredClone(initialState?.eventDeploymentOverrides ?? {}));
  const [issues, setIssues] = useState<CustomEventProjectConsistencyIssue[]>([]);
  const [reusableCharacterKey, setReusableCharacterKey] = useState('');
  const [operation, setOperation] = useState<EventProjectEditorOperation>();
  const [error, setError] = useState<string>();
  const isBusy = operation !== undefined;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const update: DraftUpdater = (mutate) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
    setIssues([]);
  };

  async function generate() {
    setError(undefined);
    setIssues([]);
    setOperation('generate');
    try {
      setDraft(await onGenerate(description));
      setEventDeploymentOverrides({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '短事件生成失败。');
    } finally {
      setOperation(undefined);
    }
  }

  async function checkConsistency() {
    if (!draft) return;
    setError(undefined);
    setOperation('review');
    try {
      setIssues(await onConsistencyReview(draft));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '短事件一致性复核失败。'
      );
    } finally {
      setOperation(undefined);
    }
  }

  async function save(mode: CustomEventProjectSaveMode) {
    if (!draft) return;
    setError(undefined);
    setOperation('save');
    try {
      await onSave({
        draft,
        projectDeployments,
        eventDeploymentOverrides,
        mode,
        existing: initialState?.existing
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '短事件项目保存失败。');
      setOperation(undefined);
    }
  }

  return (
    <div className="ccw-modal-backdrop">
      <section
        className="ccw-character-editor ccw-event-project-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ccw-event-project-editor-title"
      >
        <header>
          <div>
            <p>SHORT EVENT PROJECT</p>
            <h2 id="ccw-event-project-editor-title">
              {initialState
                ? `编辑 ${initialState.draft.project.title}`
                : '快速创建短事件'}
            </h2>
            <span>
              {initialState
                ? `保存时为项目与包含资产创建新 revision`
                : '自动建立轻量项目，再审核人物、角色槽、阶段和节点'}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭短事件编辑器">
            ×
          </button>
        </header>

        {!initialState ? (
          <section className="ccw-character-generator">
            <label>
              <span>自然语言短事件设定</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="例如：一名法证人员发现证物封条被更换，线索可以发展成内部失误与蓄意栽赃两个相对独立的故事弧……"
                rows={5}
              />
            </label>
            <div>
              <button
                type="button"
                className="primary"
                disabled={!profileReady || !description.trim() || isBusy}
                onClick={() => void generate()}
              >
                {operation === 'generate'
                  ? '正在生成…'
                  : 'AI 生成短事件草稿'}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  setDraft(blankProjectDraft());
                  setEventDeploymentOverrides({});
                }}
              >
                手动填写
              </button>
            </div>
            {!profileReady ? (
              <p className="ccw-inline-note">
                请选择已配置的生成接口与模型，或先手动填写。
              </p>
            ) : null}
            {operation === 'generate' ? (
              <AiGenerationStatus
                kind="event_project"
                routeLabel={generationRouteLabel}
              />
            ) : null}
          </section>
        ) : null}

        {draft ? (
          <div className="ccw-character-editor-body ccw-event-project-editor-body">
            <section className="ccw-character-fields ccw-event-project-fields">
              <section className="ccw-event-project-basics">
                <div className="ccw-event-card-heading">
                  <strong>轻量项目</strong>
                  <span>所有事件组必须归属于此项目</span>
                </div>
                <label>
                  <span>项目标题</span>
                  <input
                    value={draft.project.title}
                    onChange={(event) =>
                      update((current) => {
                        current.project.title = event.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  <span>项目摘要</span>
                  <textarea
                    rows={3}
                    value={draft.project.summary}
                    onChange={(event) =>
                      update((current) => {
                        current.project.summary = event.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  <span>转换模式</span>
                  <select
                    value={draft.project.conversionMode}
                    onChange={(event) =>
                      update((current) => {
                        current.project.conversionMode = event.target
                          .value as CustomEventProjectDraft['project']['conversionMode'];
                      })
                    }
                  >
                    <option value="structural_adaptation">结构适配优先</option>
                    <option value="character_retention">人物保留优先</option>
                    <option value="source_direction_priority">原作方向优先</option>
                  </select>
                </label>
              </section>

              <section className="ccw-event-project-characters">
                <div className="ccw-event-card-heading">
                  <strong>项目人物</strong>
                  <button
                    type="button"
                    onClick={() =>
                      update((current) => {
                        current.characterCandidates.push(blankCharacter());
                      })
                    }
                  >
                    新建项目人物
                  </button>
                </div>
                {reusableCharacters.length > 0 ? (
                  <div className="ccw-library-character-picker">
                    <label>
                      <span>复用人物库已有角色</span>
                      <select
                        aria-label="复用人物库已有角色"
                        value={reusableCharacterKey}
                        onChange={(event) =>
                          setReusableCharacterKey(event.target.value)
                        }
                      >
                        <option value="">选择已发布人物</option>
                        {reusableCharacters.map(({ candidate }) => (
                          <option
                            key={`${candidate.candidateKey}:${candidate.revisionRef?.revision ?? 0}`}
                            value={candidate.candidateKey}
                            disabled={draft.characterCandidates.some(
                              (current) =>
                                current.candidateKey === candidate.candidateKey
                            )}
                          >
                            {candidate.character.displayName}
                            {candidate.revisionRef
                              ? ` · revision ${candidate.revisionRef.revision}`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={!reusableCharacterKey}
                      onClick={() => {
                        const selected = reusableCharacters.find(
                          ({ candidate }) =>
                            candidate.candidateKey === reusableCharacterKey
                        )?.candidate;
                        if (!selected) return;
                        update((current) => {
                          if (
                            current.characterCandidates.some(
                              (candidate) =>
                                candidate.candidateKey === selected.candidateKey
                            )
                          ) {
                            return;
                          }
                          current.characterCandidates.push(
                            structuredClone(selected)
                          );
                        });
                        setReusableCharacterKey('');
                      }}
                    >
                      引用到本项目
                    </button>
                  </div>
                ) : (
                  <p className="ccw-inline-note">
                    人物库中暂无可复用的已发布全局人物；仍可新建项目专属人物。
                  </p>
                )}
                {draft.characterCandidates.length === 0 ? (
                  <p className="ccw-inline-note">
                    没有固定人物时可完全使用角色槽和当前存档人物。
                  </p>
                ) : null}
                {draft.characterCandidates.map((candidate, index) => (
                  <ProjectCharacterCard
                    key={candidate.candidateKey}
                    candidate={candidate}
                    latestCandidate={reusableCharacters.find(
                      ({ candidate: reusable }) =>
                        reusable.candidateKey === candidate.candidateKey
                    )?.candidate}
                    index={index}
                    update={update}
                    remove={() =>
                      update((current) => {
                        const removedKey =
                          current.characterCandidates[index].candidateKey;
                        current.characterCandidates.splice(index, 1);
                        for (const group of current.eventGroups) {
                          group.characterCandidateKeys =
                            group.characterCandidateKeys.filter(
                              (key) => key !== removedKey
                            );
                          for (const slot of group.roleSlots) {
                            if (slot.fixedCharacterKey === removedKey) {
                              slot.fixedCharacterKey = undefined;
                            }
                          }
                          for (const stage of group.stages) {
                            for (const node of stage.eventNodes) {
                              for (const usage of node.characterUsages) {
                                if (
                                  usage.characterCandidateKey === removedKey
                                ) {
                                  usage.characterCandidateKey = undefined;
                                }
                              }
                            }
                          }
                        }
                      })
                    }
                  />
                ))}
              </section>

              <section className="ccw-event-group-list">
                <div className="ccw-event-card-heading">
                  <strong>事件组</strong>
                  <button
                    type="button"
                    onClick={() =>
                      update((current) => {
                        current.eventGroups.push(blankEventGroup());
                      })
                    }
                  >
                    添加事件组
                  </button>
                </div>
                {draft.eventGroups.map((group, groupIndex) => (
                  <EventGroupCard
                    key={group.eventGroupKey}
                    group={group}
                    groupIndex={groupIndex}
                    candidates={draft.characterCandidates}
                    deployments={
                      eventDeploymentOverrides[group.eventGroupKey] ?? []
                    }
                    update={update}
                    onDeploymentsChange={(deployments) =>
                      setEventDeploymentOverrides((current) => ({
                        ...current,
                        [group.eventGroupKey]: deployments
                      }))
                    }
                    remove={() =>
                      update((current) => {
                        current.eventGroups.splice(groupIndex, 1);
                      })
                    }
                  />
                ))}
              </section>
            </section>

            <aside className="ccw-character-release">
              <section>
                <h3>项目世界包投放</h3>
                <WorldDeploymentMatrix
                  descriptors={listWorldpackAdaptationDescriptors()}
                  deployments={projectDeployments}
                  onChange={setProjectDeployments}
                />
                <p className="ccw-inline-note">
                  项目人物默认继承；事件组可在左侧单独覆盖。
                </p>
              </section>
              <section>
                <div className="ccw-review-heading">
                  <h3>项目一致性</h3>
                  <button
                    type="button"
                    disabled={!profileReady || isBusy}
                    onClick={() => void checkConsistency()}
                  >
                    {operation === 'review' ? 'AI 检查中…' : '让 AI 检查'}
                  </button>
                </div>
                {issues.length === 0 ? (
                  <p className="ccw-inline-note">
                    AI 复核只返回问题，不会覆盖你的修改。
                  </p>
                ) : (
                  <ul className="ccw-consistency-issues">
                    {issues.map((issue, index) => (
                      <li
                        key={`${issue.code}-${index}`}
                        data-severity={issue.severity}
                      >
                        <strong>{issue.summary}</strong>
                        {issue.path ? <span>{issue.path}</span> : null}
                        {issue.suggestion ? <span>{issue.suggestion}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="ccw-event-boundary-note">
                <h3>阶段边界</h3>
                <p>
                  这里保存的是创作资产，不会创建 Actor、事项、案件或新闻，也不会触发任何事件。
                </p>
              </section>
            </aside>
          </div>
        ) : null}

        {error ? (
          <div className="ccw-editor-error" role="alert">{error}</div>
        ) : null}

        <footer>
          <button type="button" onClick={onClose}>取消</button>
          <div>
            <button
              type="button"
              disabled={!draft || isBusy}
              onClick={() => void save('needs_review')}
            >
              保存为待审核
            </button>
            <button
              type="button"
              className="primary"
              disabled={!draft || isBusy}
              onClick={() => void save('publish')}
            >
              确认发布
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

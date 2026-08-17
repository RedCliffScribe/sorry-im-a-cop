import { useEffect, useState } from 'react';
import type {
  CustomCharacterAsset,
  CustomCharacterRevision
} from '../../domain/customContent/assetTypes';
import type {
  CustomCharacterConsistencyIssue,
  CustomCharacterDraft,
  CustomCharacterGenerationDiagnostics,
  CustomCharacterGenerationIssue,
  CustomCharacterGenerationProgress,
  CustomCharacterGenerationRecovery,
  CustomCharacterGenerationResult
} from '../../domain/customContent/characterCreation';
import {
  createLocalCustomCharacterFallback
} from '../../domain/customContent/characterCreation';
import type { CustomCharacterSaveMode } from '../../domain/customContent/characterManagement';
import type { CustomCharacterWorkingDraftRecord } from '../../domain/customContent/characterWorkingDraft';
import {
  createDefaultCustomCharacterAdaptationPolicy,
  type CustomContentWorldDeployment
} from '../../domain/customContent/worldAdaptation';
import { listWorldpackAdaptationDescriptors } from '../../domain/worldpack/adaptationRegistry';
import { AiGenerationStatus } from './AiGenerationStatus';
import { WorldDeploymentMatrix } from './WorldDeploymentMatrix';
import type { CustomContentWorkshopProject } from './workshopLibrary';

export interface CustomCharacterEditorSaveRequest {
  draft: CustomCharacterDraft;
  deployments: CustomContentWorldDeployment[];
  global: boolean;
  projectIds: string[];
  mode: CustomCharacterSaveMode;
  existingAsset?: CustomCharacterAsset;
  existingWorkingDraftId?: string;
  description: string;
  generationIssues: CustomCharacterGenerationIssue[];
  generationRecovery?: CustomCharacterGenerationRecovery;
  generationDiagnostics?: CustomCharacterGenerationDiagnostics;
}

interface CustomCharacterEditorProps {
  projects: CustomContentWorkshopProject[];
  profileReady: boolean;
  generationRouteLabel?: string;
  initialAsset?: CustomCharacterAsset;
  initialRevision?: CustomCharacterRevision;
  initialWorkingDraft?: CustomCharacterWorkingDraftRecord;
  onGenerate: (
    description: string,
    onProgress: (progress: CustomCharacterGenerationProgress) => void
  ) => Promise<CustomCharacterGenerationResult>;
  onConsistencyReview: (
    draft: CustomCharacterDraft
  ) => Promise<CustomCharacterConsistencyIssue[]>;
  onSave: (request: CustomCharacterEditorSaveRequest) => Promise<void>;
  onClose: () => void;
}

type CharacterEditorOperation = 'generate' | 'review' | 'save';

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

function relationshipLines(draft: CustomCharacterDraft): string {
  return draft.majorRelationships
    .map((relationship) => `${relationship.label}｜${relationship.summary}`)
    .join('\n');
}

function relationshipsFromText(
  value: string,
  previous: CustomCharacterDraft['majorRelationships']
): CustomCharacterDraft['majorRelationships'] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const [label, ...summaryParts] = item.split(/[|｜]/);
      return {
        relationshipId:
          previous[index]?.relationshipId ?? `relationship-${index + 1}`,
        targetCharacterAssetId:
          previous[index]?.targetCharacterAssetId,
        label: label?.trim() ?? '',
        summary: summaryParts.join('｜').trim()
      };
    });
}

function draftFromRevision(
  revision: CustomCharacterRevision
): CustomCharacterDraft {
  return {
    displayName: revision.displayName,
    aliases: [...revision.aliases],
    gender: revision.gender,
    profileSummary: revision.profileSummary,
    backgroundSummary: revision.backgroundSummary,
    corePersonality: [...revision.corePersonality],
    values: [...revision.values],
    coreMotivations: [...revision.coreMotivations],
    majorRelationships: revision.majorRelationships.map((item) => ({
      ...item
    })),
    sourceProfile: revision.sourceProfile
      ? {
          ...revision.sourceProfile,
          temporalAnchor: revision.sourceProfile.temporalAnchor
            ? { ...revision.sourceProfile.temporalAnchor }
            : undefined,
          usualPlaceHints: [...revision.sourceProfile.usualPlaceHints],
          contactRoutes: [...revision.sourceProfile.contactRoutes]
        }
      : {
          usualPlaceHints: [],
          contactRoutes: []
        },
    entryMode: revision.entryMode,
    adaptationPolicy: {
      temporalPolicy: revision.adaptationPolicy.temporalPolicy,
      lockedFields: [...revision.adaptationPolicy.lockedFields],
      adaptableFields: [...revision.adaptationPolicy.adaptableFields],
      identityAnchors: [
        ...(revision.adaptationPolicy.identityAnchors ?? [])
      ],
      permittedTransformations: [
        ...(revision.adaptationPolicy.permittedTransformations ?? [])
      ],
      forbiddenTransformations: [
        ...(revision.adaptationPolicy.forbiddenTransformations ?? [])
      ],
      conflictNotes: [...(revision.adaptationPolicy.conflictNotes ?? [])]
    }
  };
}

function blankDraft(): CustomCharacterDraft {
  return {
    displayName: '',
    aliases: [],
    gender: '',
    profileSummary: '',
    backgroundSummary: '',
    corePersonality: [],
    values: [],
    coreMotivations: [],
    majorRelationships: [],
    sourceProfile: {
      usualPlaceHints: [],
      contactRoutes: []
    },
    entryMode: 'natural',
    adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy()
  };
}

function cloneWorkingDraft(
  workingDraft: CustomCharacterWorkingDraftRecord
): CustomCharacterDraft {
  return structuredClone(workingDraft.draft);
}

function missingDraftPaths(
  draft: CustomCharacterDraft | null,
  relationshipText: string
): Set<string> {
  if (!draft) return new Set();
  const paths = new Set<string>();
  if (!draft.displayName.trim()) paths.add('displayName');
  if (!draft.gender.trim()) paths.add('gender');
  if (!draft.profileSummary.trim()) paths.add('profileSummary');
  if (!draft.backgroundSummary.trim()) paths.add('backgroundSummary');
  if (draft.corePersonality.length === 0) paths.add('corePersonality');
  if (draft.values.length === 0) paths.add('values');
  if (draft.coreMotivations.length === 0) paths.add('coreMotivations');
  relationshipsFromText(relationshipText, draft.majorRelationships).forEach(
    (relationship, index) => {
      if (!relationship.label.trim() || !relationship.summary.trim()) {
        paths.add(`majorRelationships.${index}`);
      }
    }
  );
  return paths;
}

export function CustomCharacterEditor({
  projects,
  profileReady,
  generationRouteLabel,
  initialAsset,
  initialRevision,
  initialWorkingDraft,
  onGenerate,
  onConsistencyReview,
  onSave,
  onClose
}: CustomCharacterEditorProps) {
  const initialDraft = initialWorkingDraft
    ? cloneWorkingDraft(initialWorkingDraft)
    : initialRevision
      ? draftFromRevision(initialRevision)
      : null;
  const [description, setDescription] = useState(
    initialWorkingDraft?.description ?? ''
  );
  const [draft, setDraft] = useState<CustomCharacterDraft | null>(
    initialDraft
  );
  const [deployments, setDeployments] = useState<
    CustomContentWorldDeployment[]
  >(
    initialWorkingDraft?.deployments.map((item) => ({ ...item })) ??
      initialRevision?.deployments.map((item) => ({ ...item })) ??
      []
  );
  const [globalScope, setGlobalScope] = useState(
    initialWorkingDraft?.global ?? initialAsset?.global ?? true
  );
  const [projectIds, setProjectIds] = useState<string[]>(
    initialWorkingDraft?.projectIds ?? initialAsset?.projectIds ?? []
  );
  const [relationshipText, setRelationshipText] = useState(
    initialDraft ? relationshipLines(initialDraft) : ''
  );
  const [issues, setIssues] = useState<CustomCharacterConsistencyIssue[]>([]);
  const [operation, setOperation] = useState<CharacterEditorOperation>();
  const [error, setError] = useState<string>();
  const [generationFailure, setGenerationFailure] = useState<string>();
  const [generationIssues, setGenerationIssues] = useState<
    CustomCharacterGenerationIssue[]
  >(initialWorkingDraft?.generationIssues ?? []);
  const [generationRecovery, setGenerationRecovery] =
    useState<CustomCharacterGenerationRecovery | undefined>(
      initialWorkingDraft?.generationRecovery
    );
  const [generationDiagnostics, setGenerationDiagnostics] =
    useState<CustomCharacterGenerationDiagnostics | undefined>(
      initialWorkingDraft?.generationDiagnostics
    );
  const [generationProgress, setGenerationProgress] =
    useState<CustomCharacterGenerationProgress>('requesting');
  const isBusy = operation !== undefined;
  const missingPaths = missingDraftPaths(draft, relationshipText);

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

  async function generate() {
    setError(undefined);
    setGenerationFailure(undefined);
    setIssues([]);
    setGenerationIssues([]);
    setOperation('generate');
    setGenerationProgress('requesting');
    try {
      const generated = await onGenerate(description, setGenerationProgress);
      setDraft(generated.draft);
      setRelationshipText(relationshipLines(generated.draft));
      setGenerationIssues(generated.issues);
      setGenerationRecovery(generated.recovery);
      setGenerationDiagnostics(generated.diagnostics);
    } catch (caught) {
      setGenerationFailure(
        caught instanceof Error ? caught.message : '人物生成暂时失败。'
      );
    } finally {
      setOperation(undefined);
    }
  }

  async function checkConsistency() {
    if (!draft) return;
    setError(undefined);
    setOperation('review');
    try {
      setIssues(await onConsistencyReview({
        ...draft,
        majorRelationships: relationshipsFromText(
          relationshipText,
          draft.majorRelationships
        )
      }));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '人物设定复核失败。'
      );
    } finally {
      setOperation(undefined);
    }
  }

  async function save(mode: CustomCharacterSaveMode) {
    if (!draft) return;
    setError(undefined);
    setOperation('save');
    try {
      await onSave({
        draft: {
          ...draft,
          majorRelationships: relationshipsFromText(
            relationshipText,
            draft.majorRelationships
          )
        },
        deployments,
        global: globalScope,
        projectIds,
        mode,
        existingAsset: initialAsset,
        existingWorkingDraftId: initialWorkingDraft?.workingDraftId,
        description,
        generationIssues,
        generationRecovery,
        generationDiagnostics
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '人物保存失败。');
      if (mode === 'publish') {
        window.requestAnimationFrame(() => {
          document
            .querySelector<HTMLInputElement | HTMLTextAreaElement>(
              '.ccw-character-fields label[data-missing="true"] input, .ccw-character-fields label[data-missing="true"] textarea'
            )
            ?.focus();
        });
      }
      setOperation(undefined);
    }
  }

  function updateDraft<K extends keyof CustomCharacterDraft>(
    key: K,
    value: CustomCharacterDraft[K]
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function toggleProject(projectId: string) {
    setProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((item) => item !== projectId)
        : [...current, projectId]
    );
  }

  return (
    <div className="ccw-modal-backdrop">
      <section
        className="ccw-character-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ccw-character-editor-title"
      >
        <header>
          <div>
            <p>CHARACTER ASSET</p>
            <h2 id="ccw-character-editor-title">
              {initialWorkingDraft
                ? `编辑草稿 ${initialWorkingDraft.draft.displayName || ''}`.trim()
                : initialRevision
                ? `编辑 ${initialRevision.displayName}`
                : '创建人物资产'}
            </h2>
            <span>
              {initialWorkingDraft
                ? '工作草稿不会进入游戏；确认发布后才创建正式 revision'
                : initialRevision
                ? `保存时创建 revision ${initialRevision.revision + 1}`
                : '自然语言生成后由你审核、编辑和发布'}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭人物编辑器">
            ×
          </button>
        </header>

        {!initialRevision || initialWorkingDraft ? (
          <section className="ccw-character-generator">
            <label>
              <span>自然语言人物设定</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="例如：一名三十多岁的法证人员，冷静谨慎，过去曾因证物失误背负压力……"
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
                  : generationFailure
                    ? '重试 AI 生成'
                  : 'AI 生成人物草稿'}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  const empty = blankDraft();
                  setDraft(empty);
                  setRelationshipText('');
                  setGenerationFailure(undefined);
                  setGenerationIssues([]);
                  setGenerationRecovery(undefined);
                  setGenerationDiagnostics(undefined);
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
                kind="character"
                routeLabel={generationRouteLabel}
                characterPhase={generationProgress}
              />
            ) : null}
            {generationFailure ? (
              <div className="ccw-generation-warning" role="alert">
                <strong>本次 AI 请求未完成</strong>
                <span>{generationFailure}</span>
                <button
                  type="button"
                  onClick={() => {
                    const fallback =
                      createLocalCustomCharacterFallback(description);
                    setDraft(fallback.draft);
                    setRelationshipText('');
                    setGenerationIssues(fallback.issues);
                    setGenerationRecovery(fallback.recovery);
                    setGenerationDiagnostics(fallback.diagnostics);
                    setGenerationFailure(undefined);
                  }}
                >
                  转为手动草稿
                </button>
              </div>
            ) : null}
            {generationIssues.length > 0 ? (
              <div className="ccw-generation-warning" role="status">
                <strong>
                  {generationRecovery === 'local_fallback'
                    ? '已建立可编辑草稿'
                    : `草稿已生成，已自动整理 ${generationIssues.length} 处`}
                </strong>
                <ul>
                  {generationIssues.slice(0, 6).map((issue, index) => (
                    <li key={`${issue.code}-${issue.path}-${index}`}>
                      {issue.summary}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {draft ? (
          <div className="ccw-character-editor-body">
            <section className="ccw-character-fields">
              <div className="ccw-field-grid">
                <label data-missing={missingPaths.has('displayName') || undefined}>
                  <span>姓名</span>
                  <input
                    value={draft.displayName}
                    onChange={(event) =>
                      updateDraft('displayName', event.target.value)
                    }
                  />
                </label>
                <label data-missing={missingPaths.has('gender') || undefined}>
                  <span>性别</span>
                  <input
                    value={draft.gender}
                    onChange={(event) =>
                      updateDraft('gender', event.target.value)
                    }
                  />
                </label>
              </div>
              <label>
                <span>别名（逗号或换行分隔）</span>
                <textarea
                  rows={2}
                  value={draft.aliases.join('\n')}
                  onChange={(event) =>
                    updateDraft('aliases', lines(event.target.value))
                  }
                />
              </label>
              <label data-missing={missingPaths.has('profileSummary') || undefined}>
                <span>人物摘要</span>
                <textarea
                  rows={3}
                  value={draft.profileSummary}
                  onChange={(event) =>
                    updateDraft('profileSummary', event.target.value)
                  }
                />
              </label>
              <label data-missing={missingPaths.has('backgroundSummary') || undefined}>
                <span>背景摘要</span>
                <textarea
                  rows={4}
                  value={draft.backgroundSummary}
                  onChange={(event) =>
                    updateDraft('backgroundSummary', event.target.value)
                  }
                />
              </label>
              <div className="ccw-field-grid three">
                <label data-missing={missingPaths.has('corePersonality') || undefined}>
                  <span>核心性格</span>
                  <textarea
                    rows={4}
                    value={draft.corePersonality.join('\n')}
                    onChange={(event) =>
                      updateDraft(
                        'corePersonality',
                        lines(event.target.value)
                      )
                    }
                  />
                </label>
                <label data-missing={missingPaths.has('values') || undefined}>
                  <span>价值观</span>
                  <textarea
                    rows={4}
                    value={draft.values.join('\n')}
                    onChange={(event) =>
                      updateDraft('values', lines(event.target.value))
                    }
                  />
                </label>
                <label data-missing={missingPaths.has('coreMotivations') || undefined}>
                  <span>核心动机</span>
                  <textarea
                    rows={4}
                    value={draft.coreMotivations.join('\n')}
                    onChange={(event) =>
                      updateDraft(
                        'coreMotivations',
                        lines(event.target.value)
                      )
                    }
                  />
                </label>
              </div>
              <label
                data-missing={
                  Array.from(missingPaths).some((path) =>
                    path.startsWith('majorRelationships.')
                  ) || undefined
                }
              >
                <span>主要关系（每行“关系｜摘要”）</span>
                <textarea
                  rows={4}
                  value={relationshipText}
                  onChange={(event) => setRelationshipText(event.target.value)}
                />
              </label>
              <label>
                <span>人物登场倾向</span>
                <select
                  value={globalScope ? draft.entryMode : 'follow_project'}
                  disabled={!globalScope}
                  onChange={(event) =>
                    updateDraft(
                      'entryMode',
                      event.target.value as CustomCharacterDraft['entryMode']
                    )
                  }
                >
                  <option value="manual">等我手动引入</option>
                  <option value="natural">自然出现</option>
                  <option value="priority">优先建立交集</option>
                  <option value="asap_contact">尽快建立交集</option>
                  <option value="follow_project">跟随所属事件组</option>
                </select>
              </label>

              <details>
                <summary>人物 revision V2 与世界适配</summary>
                <p className="muted">
                  留空表示来源没有提供；系统不会从背景文字猜测年龄、职业或地点。
                </p>
                <div className="ccw-field-grid three">
                  <label>
                    <span>人生阶段</span>
                    <input
                      value={draft.sourceProfile?.temporalAnchor?.lifeStage ?? ''}
                      onChange={(event) =>
                        updateDraft('sourceProfile', {
                          ...(draft.sourceProfile ?? {
                            usualPlaceHints: [],
                            contactRoutes: []
                          }),
                          temporalAnchor: {
                            ...draft.sourceProfile?.temporalAnchor,
                            lifeStage: event.target.value || undefined
                          }
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>准确年龄</span>
                    <input
                      type="number"
                      min={0}
                      max={130}
                      value={draft.sourceProfile?.temporalAnchor?.exactAge ?? ''}
                      onChange={(event) =>
                        updateDraft('sourceProfile', {
                          ...(draft.sourceProfile ?? {
                            usualPlaceHints: [],
                            contactRoutes: []
                          }),
                          temporalAnchor: {
                            ...draft.sourceProfile?.temporalAnchor,
                            exactAge: event.target.value
                              ? Number(event.target.value)
                              : undefined
                          }
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>出生日期</span>
                    <input
                      placeholder="YYYY-MM-DD"
                      value={draft.sourceProfile?.temporalAnchor?.birthDate ?? ''}
                      onChange={(event) =>
                        updateDraft('sourceProfile', {
                          ...(draft.sourceProfile ?? {
                            usualPlaceHints: [],
                            contactRoutes: []
                          }),
                          temporalAnchor: {
                            ...draft.sourceProfile?.temporalAnchor,
                            birthDate: event.target.value || undefined
                          }
                        })
                      }
                    />
                  </label>
                </div>
                <div className="ccw-field-grid three">
                  {[
                    ['publicIdentity', '公开身份'],
                    ['occupation', '职业'],
                    ['socialPosition', '社会位置'],
                    ['appearance', '外貌'],
                    ['speechStyle', '说话方式'],
                    ['longTermGoal', '长期目标']
                  ].map(([field, label]) => (
                    <label key={field}>
                      <span>{label}</span>
                      <input
                        value={
                          draft.sourceProfile?.[
                            field as keyof NonNullable<
                              CustomCharacterDraft['sourceProfile']
                            >
                          ] as string | undefined ?? ''
                        }
                        onChange={(event) =>
                          updateDraft('sourceProfile', {
                            ...(draft.sourceProfile ?? {
                              usualPlaceHints: [],
                              contactRoutes: []
                            }),
                            [field]: event.target.value || undefined
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <label>
                  <span>常用地点提示</span>
                  <textarea
                    rows={3}
                    value={(draft.sourceProfile?.usualPlaceHints ?? []).join('\n')}
                    onChange={(event) =>
                      updateDraft('sourceProfile', {
                        ...(draft.sourceProfile ?? {
                          usualPlaceHints: [],
                          contactRoutes: []
                        }),
                        usualPlaceHints: lines(event.target.value)
                      })
                    }
                  />
                </label>
                <label>
                  <span>合理接触路径</span>
                  <textarea
                    rows={3}
                    value={(draft.sourceProfile?.contactRoutes ?? []).join('\n')}
                    onChange={(event) =>
                      updateDraft('sourceProfile', {
                        ...(draft.sourceProfile ?? {
                          usualPlaceHints: [],
                          contactRoutes: []
                        }),
                        contactRoutes: lines(event.target.value)
                      })
                    }
                  />
                </label>
                <label>
                  <span>时间策略</span>
                  <select
                    value={draft.adaptationPolicy.temporalPolicy}
                    onChange={(event) =>
                      updateDraft('adaptationPolicy', {
                        ...draft.adaptationPolicy,
                        temporalPolicy: event.target
                          .value as CustomCharacterDraft['adaptationPolicy']['temporalPolicy']
                      })
                    }
                  >
                    <option value="preserve_life_stage">保留人生阶段</option>
                    <option value="preserve_exact_age">保留准确年龄</option>
                    <option value="preserve_birth_date">保留出生日期</option>
                    <option value="manual">手动适配</option>
                  </select>
                </label>
                <label>
                  <span>锁定字段</span>
                  <textarea
                    rows={4}
                    value={draft.adaptationPolicy.lockedFields.join('\n')}
                    onChange={(event) =>
                      updateDraft('adaptationPolicy', {
                        ...draft.adaptationPolicy,
                        lockedFields: lines(event.target.value)
                      })
                    }
                  />
                </label>
                <label>
                  <span>可适配字段</span>
                  <textarea
                    rows={4}
                    value={draft.adaptationPolicy.adaptableFields.join('\n')}
                    onChange={(event) =>
                      updateDraft('adaptationPolicy', {
                        ...draft.adaptationPolicy,
                        adaptableFields: lines(event.target.value)
                      })
                    }
                  />
                </label>
                <label>
                  <span>跨世界不可变身份事实</span>
                  <textarea
                    rows={3}
                    value={(draft.adaptationPolicy.identityAnchors ?? []).join('\n')}
                    onChange={(event) =>
                      updateDraft('adaptationPolicy', {
                        ...draft.adaptationPolicy,
                        identityAnchors: lines(event.target.value)
                      })
                    }
                  />
                </label>
                <label>
                  <span>允许的替换方式</span>
                  <textarea
                    rows={3}
                    value={(draft.adaptationPolicy.permittedTransformations ?? []).join('\n')}
                    onChange={(event) =>
                      updateDraft('adaptationPolicy', {
                        ...draft.adaptationPolicy,
                        permittedTransformations: lines(event.target.value)
                      })
                    }
                  />
                </label>
                <label>
                  <span>禁止的身份变化</span>
                  <textarea
                    rows={3}
                    value={(draft.adaptationPolicy.forbiddenTransformations ?? []).join('\n')}
                    onChange={(event) =>
                      updateDraft('adaptationPolicy', {
                        ...draft.adaptationPolicy,
                        forbiddenTransformations: lines(event.target.value)
                      })
                    }
                  />
                </label>
                <label>
                  <span>适配冲突说明</span>
                  <textarea
                    rows={3}
                    value={(draft.adaptationPolicy.conflictNotes ?? []).join('\n')}
                    onChange={(event) =>
                      updateDraft('adaptationPolicy', {
                        ...draft.adaptationPolicy,
                        conflictNotes: lines(event.target.value)
                      })
                    }
                  />
                </label>
              </details>
            </section>

            <aside className="ccw-character-release">
              <section>
                <h3>资产作用域</h3>
                <label className="ccw-radio-row">
                  <input
                    type="radio"
                    name="character-scope"
                    checked={globalScope}
                    disabled={initialAsset?.global}
                    onChange={() => setGlobalScope(true)}
                  />
                  全局人物
                </label>
                <label className="ccw-radio-row">
                  <input
                    type="radio"
                    name="character-scope"
                    checked={!globalScope}
                    disabled={initialAsset?.global || projects.length === 0}
                    onChange={() => setGlobalScope(false)}
                  />
                  仅限内容项目
                </label>
                {!globalScope ? (
                  <div className="ccw-project-picker">
                    {projects.map((project) => (
                      <label key={project.id}>
                        <input
                          type="checkbox"
                          checked={projectIds.includes(project.id)}
                          onChange={() => toggleProject(project.id)}
                        />
                        {project.title}
                      </label>
                    ))}
                  </div>
                ) : null}
              </section>

              <section>
                <h3>世界包投放</h3>
                <WorldDeploymentMatrix
                  descriptors={listWorldpackAdaptationDescriptors()}
                  deployments={deployments}
                  onChange={setDeployments}
                />
              </section>

              <section>
                <div className="ccw-review-heading">
                  <h3>设定一致性</h3>
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
                      <li key={`${issue.code}-${index}`} data-severity={issue.severity}>
                        <strong>{issue.summary}</strong>
                        {issue.suggestion ? <span>{issue.suggestion}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        ) : null}

        {error ? <div className="ccw-editor-error" role="alert">{error}</div> : null}

        <footer>
          <button type="button" onClick={onClose}>取消</button>
          <div>
            <button
              type="button"
              disabled={!draft || isBusy}
              onClick={() => void save('needs_review')}
            >
              保存工作草稿
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

import type { NarratorClient } from '../narrator/NarratorClient';
import type { StoryDiagnosticIssue } from '../runtime/types';
import type { PromptContext } from '../context/selectContext';
import type { NpcMemoryTier } from '../memory/npcMemoryLayers';
import { resolvePromptText } from '../prompts/promptRegistry';
import type { PromptSettings } from '../settings/types';

export interface NpcSimulationAdvice {
  actorId?: string;
  actorName?: string;
  hint: string;
  basis: string[];
  confidence?: number;
}

export interface NpcSimulationPackage {
  presentReactions: NpcSimulationAdvice[];
  remotePresence: NpcSimulationAdvice[];
  notes: string[];
}

export interface RunNpcSimulationInput {
  context: PromptContext;
  playerInput: string;
  client?: NarratorClient | null;
  promptSettings?: PromptSettings;
}

export interface RunNpcSimulationResult {
  package?: NpcSimulationPackage;
  diagnostics: StoryDiagnosticIssue[];
}

export const MAX_NPC_SIMULATION_MEMORY_ENTRIES = 40;

export interface NpcSimulationMemoryProjection {
  entries: PromptContext['npcMemoryProjection']['entries'];
  diagnostics: {
    selectedMemoryIds: string[];
    selectedActorIds: string[];
    tierCounts: Record<NpcMemoryTier, number>;
    omittedMemoryCount: number;
  };
}

const npcSimulationQuotas = {
  corePresent: { short_term: 4, mid_term: 3, long_term: 1 },
  presentOrMentioned: { short_term: 3, mid_term: 2, long_term: 1 },
  remote: { short_term: 2, mid_term: 1, long_term: 1 }
} satisfies Record<string, Record<NpcMemoryTier, number>>;

function emptyTierCounts(): Record<NpcMemoryTier, number> {
  return { short_term: 0, mid_term: 0, long_term: 0 };
}

function simulationQuotasForEntry(
  entry: PromptContext['npcMemoryProjection']['entries'][number]
): Record<NpcMemoryTier, number> {
  if (entry.route === 'present' && entry.coreActor) return npcSimulationQuotas.corePresent;
  if (entry.route === 'remote') return npcSimulationQuotas.remote;
  return npcSimulationQuotas.presentOrMentioned;
}

export function selectNpcSimulationMemoryProjection(context: PromptContext): NpcSimulationMemoryProjection {
  const selected: PromptContext['npcMemoryProjection']['entries'] = [];
  const selectedCountsByActor = new Map<string, Record<NpcMemoryTier, number>>();
  const tierCounts = emptyTierCounts();

  for (const entry of context.npcMemoryProjection.entries) {
    if (selected.length >= MAX_NPC_SIMULATION_MEMORY_ENTRIES) break;
    const actorCounts = selectedCountsByActor.get(entry.actorId) ?? emptyTierCounts();
    const quotas = simulationQuotasForEntry(entry);
    if (actorCounts[entry.tier] >= quotas[entry.tier]) continue;
    actorCounts[entry.tier] += 1;
    tierCounts[entry.tier] += 1;
    selectedCountsByActor.set(entry.actorId, actorCounts);
    selected.push(entry);
  }

  return {
    entries: selected,
    diagnostics: {
      selectedMemoryIds: selected.map((entry) => entry.memoryId),
      selectedActorIds: Array.from(new Set(selected.map((entry) => entry.actorId))),
      tierCounts,
      omittedMemoryCount: Math.max(0, context.npcMemoryProjection.entries.length - selected.length)
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanBasis(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanString).filter((item): item is string => Boolean(item));
}

function formatGameTimeLabel(context: PromptContext): string {
  return context.timeLabel || 'unknown';
}

function createProjectionBlock(context: PromptContext): string {
  const memoryProjection = selectNpcSimulationMemoryProjection(context);
  return [
    'PRESENT_ACTOR_REACTION_PROJECTION',
    JSON.stringify(context.presentActorReactionProjection, null, 2),
    '',
    'REMOTE_NPC_PRESENCE_PROJECTION',
    JSON.stringify(context.remoteNpcPresenceProjection, null, 2),
    '',
    'NPC_SIMULATION_MEMORY_PACKET',
    JSON.stringify(memoryProjection, null, 2),
    '规则：只能把这些 memoryId 当作历史依据；未投喂的旧记忆不得自行补全。'
  ].join('\n');
}

export function createNpcSimulationPrompt(
  context: PromptContext,
  playerInput: string,
  promptSettings?: PromptSettings
): string {
  return [
    'NPC_SIMULATION_TASK',
    resolvePromptText('npc.simulation', promptSettings),
    '输出必须是 JSON object，形如：{"presentReactions":[{"actorId":"...","actorName":"...","hint":"...","basis":["..."],"confidence":0.7}],"remotePresence":[...],"notes":["..."]}。',
    '',
    `time=${formatGameTimeLabel(context)}`,
    `place=${context.currentPlace?.name ?? '未知地点'}`,
    `scene=${context.currentScene?.name ?? context.currentPlace?.summary ?? '无具体场景'}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    '',
    createProjectionBlock(context)
  ].join('\n');
}

function parseAdvice(item: unknown): NpcSimulationAdvice | null {
  if (!isRecord(item)) return null;

  const hint =
    cleanString(item.hint) ??
    cleanString(item.summary) ??
    cleanString(item.intent) ??
    cleanString(item.reactionHint) ??
    cleanString(item.presenceHint);
  if (!hint) return null;

  const advice: NpcSimulationAdvice = {
    hint,
    basis: cleanBasis(item.basis ?? item.basisNotes ?? item.reasons)
  };
  const actorId = cleanString(item.actorId);
  const actorName = cleanString(item.actorName ?? item.name);
  if (actorId) advice.actorId = actorId;
  if (actorName) advice.actorName = actorName;
  if (typeof item.confidence === 'number' && Number.isFinite(item.confidence)) {
    advice.confidence = item.confidence;
  }
  return advice;
}

function parseNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanString).filter((item): item is string => Boolean(item));
}

export function parseNpcSimulationPackage(value: unknown): NpcSimulationPackage {
  const source = isRecord(value) ? value : {};
  const presentReactions = Array.isArray(source.presentReactions)
    ? source.presentReactions.map(parseAdvice).filter((item): item is NpcSimulationAdvice => Boolean(item))
    : [];
  const remotePresence = Array.isArray(source.remotePresence)
    ? source.remotePresence.map(parseAdvice).filter((item): item is NpcSimulationAdvice => Boolean(item))
    : [];
  const notes = parseNotes(source.notes);

  return {
    presentReactions,
    remotePresence,
    notes
  };
}

export async function runNpcSimulation({
  context,
  playerInput,
  client,
  promptSettings
}: RunNpcSimulationInput): Promise<RunNpcSimulationResult> {
  if (!client) return { diagnostics: [] };

  try {
    const prompt = createNpcSimulationPrompt(context, playerInput, promptSettings);
    const rawPackage = await client.complete(prompt);
    const parsedPackage = parseNpcSimulationPackage(rawPackage);
    const suggestionCount = parsedPackage.presentReactions.length + parsedPackage.remotePresence.length;
    const memoryProjection = selectNpcSimulationMemoryProjection(context);

    if (suggestionCount === 0 && parsedPackage.notes.length === 0) {
      return {
        diagnostics: [
          {
            path: ['npcSimulation'],
            code: 'npc_simulation_api_empty',
            message: 'NPC simulation API returned no usable suggestions.'
          }
        ]
      };
    }

    return {
      package: parsedPackage,
      diagnostics: [
          {
            path: ['npcSimulation'],
            code: 'npc_simulation_api_applied',
            message: `NPC simulation API supplied ${suggestionCount} suggestion(s) from ${memoryProjection.entries.length} routed memory item(s): ${memoryProjection.diagnostics.selectedMemoryIds.join(',') || 'none'}.`
          }
      ]
    };
  } catch (error) {
    return {
      diagnostics: [
        {
          path: ['npcSimulation'],
          code: 'npc_simulation_api_failed',
          message: error instanceof Error ? error.message : 'NPC simulation API failed.'
        }
      ]
    };
  }
}

function formatAdviceLine(item: NpcSimulationAdvice): string {
  const actor = [item.actorId, item.actorName].filter(Boolean).join(' / ') || 'unknown';
  const basis = item.basis.length ? ` basis=${item.basis.join('；')}` : '';
  const confidence = item.confidence === undefined ? '' : ` confidence=${item.confidence}`;
  return `- actor=${actor}${confidence}${basis}\n  hint=${item.hint}`;
}

export function formatNpcSimulationPackageForPrompt(simulationPackage: NpcSimulationPackage): string {
  return [
    'AUX_NPC_SIMULATION_PACKAGE',
    '规则：以下内容是独立 NPC 模拟 API 给主叙事的未裁定建议，不是已发生事实；主叙事可以采纳、改写或忽略。',
    '规则：只有正文自然承接后，才允许通过结构化 writeback 写入状态、记忆、关系、动态或延迟事件。',
    '### presentReactions',
    simulationPackage.presentReactions.length
      ? simulationPackage.presentReactions.map(formatAdviceLine).join('\n')
      : '- none',
    '### remotePresence',
    simulationPackage.remotePresence.length ? simulationPackage.remotePresence.map(formatAdviceLine).join('\n') : '- none',
    '### notes',
    simulationPackage.notes.length ? simulationPackage.notes.map((note) => `- ${note}`).join('\n') : '- none'
  ].join('\n');
}

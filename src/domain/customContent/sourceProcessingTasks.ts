import type {
  CustomContentProcessingTask,
  CustomContentProcessingUnit,
  CustomSourceDocument,
  CustomSourceProcessingTaskConfig,
  CustomSourceStructure
} from './assetTypes';
import {
  createCustomContentBlobChecksum,
  createCustomContentChecksum,
  createCustomContentTextChecksum
} from './checksum';
import {
  CustomContentTaskStateConflictError,
  IndexedDbCustomContentRepository
} from './IndexedDbCustomContentRepository';
import {
  CUSTOM_SOURCE_TEXT_PARSER_VERSION,
  estimateCustomSourceTokens,
  extractCustomSourceBlobCanonicalText,
  normalizeCustomSourceChunkingOptions,
  parseCustomSourceBlob,
  type CustomSourceChunkingOptions,
  type CustomSourceFormat,
  type CustomSourceTextEncoding
} from './sourceTextPipeline';

export interface CustomSourceProcessingTaskSnapshot {
  task: CustomContentProcessingTask;
  unit: CustomContentProcessingUnit;
}

export interface CreateCustomSourceParseTaskOptions {
  encoding?: CustomSourceTextEncoding;
  parserVersion?: string;
  maxRetries?: number;
  timestamp?: string;
}

export interface CreateCustomSourceChunkTaskOptions {
  chunking?: Partial<CustomSourceChunkingOptions>;
  maxRetries?: number;
  timestamp?: string;
}

export interface RunCustomSourceProcessingTaskOptions {
  automaticRetry?: boolean;
  now?: () => string;
  beforeExecute?: (
    snapshot: CustomSourceProcessingTaskSnapshot
  ) => void | Promise<void>;
  beforeCommit?: (
    snapshot: CustomSourceProcessingTaskSnapshot
  ) => void | Promise<void>;
}

interface SourceTaskExecutionResult {
  task: CustomContentProcessingTask;
  unit: CustomContentProcessingUnit;
  sourceDocument?: CustomSourceDocument;
  sourceStructure?: CustomSourceStructure;
}

function taskRevision(task: CustomContentProcessingTask): number {
  return task.stateRevision ?? 0;
}

function isoNow(options: RunCustomSourceProcessingTaskOptions): string {
  return (options.now ?? (() => new Date().toISOString()))();
}

function validateMaxRetries(value: number | undefined): number {
  const maxRetries = value ?? 2;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new TypeError('maxRetries 必须是非负整数。');
  }
  return maxRetries;
}

function assertLocalSourceDocument(
  document: CustomSourceDocument
): asserts document is CustomSourceDocument & {
  sourceFormat: CustomSourceFormat;
} {
  if (
    document.sourceFormat !== 'txt' &&
    document.sourceFormat !== 'markdown' &&
    document.sourceFormat !== 'epub'
  ) {
    throw new Error('来源文档格式不受本地任务支持。');
  }
}

function assertTaskSnapshot(
  task: CustomContentProcessingTask,
  units: readonly CustomContentProcessingUnit[]
): CustomSourceProcessingTaskSnapshot {
  if (
    (task.taskKind !== 'parse_source' &&
      task.taskKind !== 'chunk_source') ||
    !task.sourceDocumentId ||
    !task.sourceProcessing ||
    units.length !== 1 ||
    units[0].taskId !== task.taskId ||
    units[0].sequence !== 0
  ) {
    throw new Error('来源处理任务记录不完整或彼此不一致。');
  }
  return { task, unit: units[0] };
}

export async function loadCustomSourceProcessingTask(
  repository: IndexedDbCustomContentRepository,
  taskId: string
): Promise<CustomSourceProcessingTaskSnapshot | null> {
  const task = await repository.loadProcessingTask(taskId);
  if (!task) return null;
  return assertTaskSnapshot(
    task,
    await repository.listProcessingUnits(taskId)
  );
}

async function taskIdentity(
  taskKind: 'parse_source' | 'chunk_source',
  sourceDocument: CustomSourceDocument,
  sourceProcessing: CustomSourceProcessingTaskConfig
): Promise<string> {
  return createCustomContentChecksum({
    taskKind,
    sourceDocumentId: sourceDocument.sourceDocumentId,
    inputChecksum: sourceDocument.checksum,
    sourceProcessing
  });
}

async function saveNewTask(
  repository: IndexedDbCustomContentRepository,
  task: CustomContentProcessingTask,
  unit: CustomContentProcessingUnit
): Promise<CustomSourceProcessingTaskSnapshot> {
  try {
    await repository.saveSourceProcessingCheckpoint({
      task,
      unit,
      expectedStateRevision: null
    });
    return { task, unit };
  } catch (error) {
    if (!(error instanceof CustomContentTaskStateConflictError)) throw error;
    const existing = await loadCustomSourceProcessingTask(
      repository,
      task.taskId
    );
    if (!existing) throw error;
    return existing;
  }
}

function createQueuedTask(
  taskId: string,
  taskKind: 'parse_source' | 'chunk_source',
  sourceDocument: CustomSourceDocument,
  sourceProcessing: CustomSourceProcessingTaskConfig,
  maxRetries: number,
  estimatedInputTokens: number,
  timestamp: string
): CustomSourceProcessingTaskSnapshot {
  const task: CustomContentProcessingTask = {
    taskId,
    taskKind,
    projectId: sourceDocument.projectId,
    sourceDocumentId: sourceDocument.sourceDocumentId,
    status: 'queued',
    concurrency: 1,
    maxRetries,
    completedUnitCount: 0,
    totalUnitCount: 1,
    estimatedInputTokens,
    consumedInputTokens: 0,
    consumedOutputTokens: 0,
    inputChecksum: sourceDocument.checksum,
    sourceProcessing,
    stateRevision: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return {
    task,
    unit: {
      unitId: `${taskId}-unit-0`,
      taskId,
      sequence: 0,
      status: 'queued',
      retryCount: 0,
      updatedAt: timestamp
    }
  };
}

export async function createCustomSourceParseTask(
  repository: IndexedDbCustomContentRepository,
  sourceDocumentId: string,
  options: CreateCustomSourceParseTaskOptions = {}
): Promise<CustomSourceProcessingTaskSnapshot> {
  const loaded = await repository.loadSourceDocument(sourceDocumentId);
  if (!loaded) throw new Error('找不到来源文档及其 Blob。');
  assertLocalSourceDocument(loaded.document);
  const encoding = options.encoding ?? 'auto';
  if (loaded.document.sourceFormat === 'epub' && encoding !== 'auto') {
    throw new Error('EPUB 不接受文本编码覆盖；请使用 auto。');
  }
  const sourceProcessing: CustomSourceProcessingTaskConfig = {
    sourceFormat: loaded.document.sourceFormat,
    encoding,
    parserVersion:
      options.parserVersion ?? CUSTOM_SOURCE_TEXT_PARSER_VERSION
  };
  const identity = await taskIdentity(
    'parse_source',
    loaded.document,
    sourceProcessing
  );
  const timestamp = options.timestamp ?? new Date().toISOString();
  const snapshot = createQueuedTask(
    `source-task-parse-${identity}`,
    'parse_source',
    loaded.document,
    sourceProcessing,
    validateMaxRetries(options.maxRetries),
    0,
    timestamp
  );
  return saveNewTask(repository, snapshot.task, snapshot.unit);
}

function canonicalChecksumFromParseResult(
  snapshot: CustomSourceProcessingTaskSnapshot
): string {
  if (
    snapshot.task.taskKind !== 'parse_source' ||
    snapshot.task.status !== 'completed' ||
    snapshot.unit.status !== 'completed' ||
    !snapshot.unit.resultRef?.startsWith('canonical-text-sha256:')
  ) {
    throw new Error('分块任务要求已完成的 parse_source 任务。');
  }
  const checksum = snapshot.unit.resultRef.slice(
    'canonical-text-sha256:'.length
  );
  if (!/^[a-f0-9]{64}$/u.test(checksum)) {
    throw new Error('parse_source 任务缺少有效规范文本 checksum。');
  }
  return checksum;
}

export async function createCustomSourceChunkTask(
  repository: IndexedDbCustomContentRepository,
  parseTaskId: string,
  options: CreateCustomSourceChunkTaskOptions = {}
): Promise<CustomSourceProcessingTaskSnapshot> {
  const parseTask = await loadCustomSourceProcessingTask(
    repository,
    parseTaskId
  );
  if (!parseTask) throw new Error('找不到 parse_source 任务。');
  const canonicalTextChecksum = canonicalChecksumFromParseResult(parseTask);
  const sourceDocumentId = parseTask.task.sourceDocumentId!;
  const loaded = await repository.loadSourceDocument(sourceDocumentId);
  if (!loaded) throw new Error('找不到来源文档及其 Blob。');
  assertLocalSourceDocument(loaded.document);
  if (loaded.document.checksum !== parseTask.task.inputChecksum) {
    throw new Error('来源文档 checksum 已改变，不能继续旧解析任务。');
  }
  const chunking = normalizeCustomSourceChunkingOptions(options.chunking);
  const sourceProcessing: CustomSourceProcessingTaskConfig = {
    sourceFormat: loaded.document.sourceFormat,
    encoding: parseTask.task.sourceProcessing!.encoding,
    parserVersion: parseTask.task.sourceProcessing!.parserVersion,
    canonicalTextChecksum,
    chunking
  };
  const identity = await taskIdentity(
    'chunk_source',
    loaded.document,
    sourceProcessing
  );
  const timestamp = options.timestamp ?? new Date().toISOString();
  const snapshot = createQueuedTask(
    `source-task-chunk-${identity}`,
    'chunk_source',
    loaded.document,
    sourceProcessing,
    validateMaxRetries(options.maxRetries),
    parseTask.task.estimatedInputTokens,
    timestamp
  );
  return saveNewTask(repository, snapshot.task, snapshot.unit);
}

async function saveTransition(
  repository: IndexedDbCustomContentRepository,
  current: CustomSourceProcessingTaskSnapshot,
  next: CustomSourceProcessingTaskSnapshot
): Promise<CustomSourceProcessingTaskSnapshot> {
  await repository.saveSourceProcessingCheckpoint({
    task: next.task,
    unit: next.unit,
    expectedStateRevision: taskRevision(current.task)
  });
  return next;
}

async function transitionWithRetry(
  repository: IndexedDbCustomContentRepository,
  taskId: string,
  createNext: (
    current: CustomSourceProcessingTaskSnapshot
  ) => CustomSourceProcessingTaskSnapshot | null
): Promise<CustomSourceProcessingTaskSnapshot> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await loadCustomSourceProcessingTask(repository, taskId);
    if (!current) throw new Error('找不到来源处理任务。');
    const next = createNext(current);
    if (!next) return current;
    try {
      return await saveTransition(repository, current, next);
    } catch (error) {
      if (!(error instanceof CustomContentTaskStateConflictError)) throw error;
    }
  }
  throw new CustomContentTaskStateConflictError(
    '来源处理任务连续发生状态竞争。'
  );
}

function transitionedSnapshot(
  current: CustomSourceProcessingTaskSnapshot,
  status: CustomContentProcessingTask['status'],
  timestamp: string,
  options: {
    retryIncrement?: number;
    lastError?: string;
  } = {}
): CustomSourceProcessingTaskSnapshot {
  const completed = status === 'completed';
  return {
    task: {
      ...current.task,
      status,
      completedUnitCount: completed ? 1 : 0,
      stateRevision: taskRevision(current.task) + 1,
      lastError: options.lastError,
      updatedAt: timestamp
    },
    unit: {
      ...current.unit,
      status,
      retryCount:
        current.unit.retryCount + (options.retryIncrement ?? 0),
      resultRef: completed ? current.unit.resultRef : undefined,
      lastError: options.lastError,
      updatedAt: timestamp
    }
  };
}

export async function pauseCustomSourceProcessingTask(
  repository: IndexedDbCustomContentRepository,
  taskId: string,
  timestamp = new Date().toISOString()
): Promise<CustomSourceProcessingTaskSnapshot> {
  return transitionWithRetry(repository, taskId, (current) => {
    if (
      current.task.status === 'paused' ||
      current.task.status === 'completed' ||
      current.task.status === 'cancelled'
    ) {
      return null;
    }
    if (
      current.task.status !== 'queued' &&
      current.task.status !== 'running'
    ) {
      throw new Error('只有排队或运行中的任务可以暂停。');
    }
    return transitionedSnapshot(current, 'paused', timestamp);
  });
}

export async function resumeCustomSourceProcessingTask(
  repository: IndexedDbCustomContentRepository,
  taskId: string,
  timestamp = new Date().toISOString()
): Promise<CustomSourceProcessingTaskSnapshot> {
  return transitionWithRetry(repository, taskId, (current) => {
    if (current.task.status === 'queued') return null;
    if (
      current.task.status !== 'paused' &&
      current.task.status !== 'running'
    ) {
      throw new Error('只有暂停或页面中断的任务可以继续。');
    }
    return transitionedSnapshot(current, 'queued', timestamp);
  });
}

export async function cancelCustomSourceProcessingTask(
  repository: IndexedDbCustomContentRepository,
  taskId: string,
  timestamp = new Date().toISOString()
): Promise<CustomSourceProcessingTaskSnapshot> {
  return transitionWithRetry(repository, taskId, (current) => {
    if (
      current.task.status === 'cancelled' ||
      current.task.status === 'completed'
    ) {
      return null;
    }
    return transitionedSnapshot(current, 'cancelled', timestamp);
  });
}

export async function retryCustomSourceProcessingTask(
  repository: IndexedDbCustomContentRepository,
  taskId: string,
  timestamp = new Date().toISOString()
): Promise<CustomSourceProcessingTaskSnapshot> {
  return transitionWithRetry(repository, taskId, (current) => {
    if (current.task.status !== 'failed') {
      throw new Error('只有失败任务可以重试。');
    }
    if (current.unit.retryCount >= current.task.maxRetries) {
      throw new Error('来源处理任务已达到最大重试次数。');
    }
    return transitionedSnapshot(current, 'queued', timestamp, {
      retryIncrement: 1
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function assertSourceBlobIdentity(
  document: CustomSourceDocument,
  blob: Blob,
  task: CustomContentProcessingTask
): Promise<void> {
  if (
    document.checksum !== task.inputChecksum ||
    (await createCustomContentBlobChecksum(blob)) !== document.checksum
  ) {
    throw new Error('来源 Blob checksum 与任务输入不一致。');
  }
}

async function assertTaskStillRunning(
  repository: IndexedDbCustomContentRepository,
  running: CustomSourceProcessingTaskSnapshot
): Promise<CustomSourceProcessingTaskSnapshot | null> {
  const latest = await loadCustomSourceProcessingTask(
    repository,
    running.task.taskId
  );
  if (!latest) throw new Error('来源处理任务在执行期间被删除。');
  return latest.task.status === 'running' &&
    taskRevision(latest.task) === taskRevision(running.task)
    ? null
    : latest;
}

async function executeParseTask(
  repository: IndexedDbCustomContentRepository,
  running: CustomSourceProcessingTaskSnapshot,
  timestamp: string
): Promise<SourceTaskExecutionResult> {
  const loaded = await repository.loadSourceDocument(
    running.task.sourceDocumentId!
  );
  if (!loaded) throw new Error('找不到来源文档及其 Blob。');
  const config = running.task.sourceProcessing!;
  assertLocalSourceDocument(loaded.document);
  await assertSourceBlobIdentity(loaded.document, loaded.blob, running.task);
  if (
    loaded.document.sourceFormat !== config.sourceFormat
  ) {
    throw new Error('来源文档身份与 parse_source 任务不一致。');
  }
  const canonicalText = await extractCustomSourceBlobCanonicalText({
    sourceFormat: config.sourceFormat,
    blob: loaded.blob,
    encoding: config.encoding
  });
  if (canonicalText.trim().length === 0) {
    throw new Error('来源文本不能为空或只包含空白字符。');
  }
  const canonicalTextChecksum =
    await createCustomContentTextChecksum(canonicalText);
  const estimatedInputTokens = Math.max(
    1,
    estimateCustomSourceTokens(canonicalText)
  );
  return {
    task: {
      ...running.task,
      status: 'completed',
      completedUnitCount: 1,
      estimatedInputTokens,
      stateRevision: taskRevision(running.task) + 1,
      lastError: undefined,
      updatedAt: timestamp
    },
    unit: {
      ...running.unit,
      status: 'completed',
      sourceSpan: {
        sourceDocumentId: loaded.document.sourceDocumentId,
        startOffset: 0,
        endOffset: canonicalText.length,
        sequence: 0,
        checksum: canonicalTextChecksum
      },
      resultRef: `canonical-text-sha256:${canonicalTextChecksum}`,
      lastError: undefined,
      updatedAt: timestamp
    },
    sourceDocument: {
      ...loaded.document,
      characterCount: canonicalText.length,
      updatedAt: timestamp
    }
  };
}

async function executeChunkTask(
  repository: IndexedDbCustomContentRepository,
  running: CustomSourceProcessingTaskSnapshot,
  timestamp: string
): Promise<SourceTaskExecutionResult> {
  const loaded = await repository.loadSourceDocument(
    running.task.sourceDocumentId!
  );
  if (!loaded) throw new Error('找不到来源文档及其 Blob。');
  const config = running.task.sourceProcessing!;
  assertLocalSourceDocument(loaded.document);
  await assertSourceBlobIdentity(loaded.document, loaded.blob, running.task);
  if (
    loaded.document.sourceFormat !== config.sourceFormat ||
    !config.canonicalTextChecksum ||
    !config.chunking
  ) {
    throw new Error('来源文档身份或 chunk_source 配置不完整。');
  }
  const parsed = await parseCustomSourceBlob({
    sourceDocumentId: loaded.document.sourceDocumentId,
    sourceFormat: config.sourceFormat,
    blob: loaded.blob,
    encoding: config.encoding,
    parserVersion: config.parserVersion,
    chunking: config.chunking,
    timestamp
  });
  if (
    parsed.structure.canonicalTextChecksum !==
    config.canonicalTextChecksum
  ) {
    throw new Error('规范文本 checksum 已改变，不能继续分块任务。');
  }
  return {
    task: {
      ...running.task,
      status: 'completed',
      completedUnitCount: 1,
      estimatedInputTokens: parsed.structure.estimatedTokenCount,
      stateRevision: taskRevision(running.task) + 1,
      lastError: undefined,
      updatedAt: timestamp
    },
    unit: {
      ...running.unit,
      status: 'completed',
      sourceSpan: {
        sourceDocumentId: loaded.document.sourceDocumentId,
        startOffset: 0,
        endOffset: parsed.structure.characterCount,
        sequence: 0,
        checksum: parsed.structure.canonicalTextChecksum
      },
      resultRef: parsed.structure.sourceStructureId,
      lastError: undefined,
      updatedAt: timestamp
    },
    sourceStructure: parsed.structure
  };
}

async function markRunning(
  repository: IndexedDbCustomContentRepository,
  snapshot: CustomSourceProcessingTaskSnapshot,
  timestamp: string
): Promise<CustomSourceProcessingTaskSnapshot> {
  return saveTransition(
    repository,
    snapshot,
    transitionedSnapshot(snapshot, 'running', timestamp)
  );
}

async function markFailed(
  repository: IndexedDbCustomContentRepository,
  running: CustomSourceProcessingTaskSnapshot,
  error: unknown,
  timestamp: string
): Promise<CustomSourceProcessingTaskSnapshot> {
  const failed = transitionedSnapshot(running, 'failed', timestamp, {
    lastError: errorMessage(error)
  });
  try {
    return await saveTransition(repository, running, failed);
  } catch (saveError) {
    if (!(saveError instanceof CustomContentTaskStateConflictError)) {
      throw saveError;
    }
    const latest = await loadCustomSourceProcessingTask(
      repository,
      running.task.taskId
    );
    if (!latest) throw saveError;
    return latest;
  }
}

export async function runCustomSourceProcessingTask(
  repository: IndexedDbCustomContentRepository,
  taskId: string,
  options: RunCustomSourceProcessingTaskOptions = {}
): Promise<CustomSourceProcessingTaskSnapshot> {
  const automaticRetry = options.automaticRetry ?? true;
  while (true) {
    let snapshot = await loadCustomSourceProcessingTask(repository, taskId);
    if (!snapshot) throw new Error('找不到来源处理任务。');
    if (
      snapshot.task.status === 'completed' &&
      snapshot.task.taskKind === 'chunk_source' &&
      snapshot.unit.resultRef &&
      !(await repository.loadSourceStructure(snapshot.unit.resultRef))
    ) {
      snapshot = await transitionWithRetry(
        repository,
        taskId,
        (current) =>
          current.task.status === 'completed'
            ? transitionedSnapshot(
                current,
                'queued',
                isoNow(options)
              )
            : null
      );
    }
    if (
      snapshot.task.status === 'completed' ||
      snapshot.task.status === 'paused' ||
      snapshot.task.status === 'cancelled' ||
      snapshot.task.status === 'running'
    ) {
      return snapshot;
    }
    if (snapshot.task.status === 'failed') {
      if (
        !automaticRetry ||
        snapshot.unit.retryCount >= snapshot.task.maxRetries
      ) {
        return snapshot;
      }
      snapshot = await retryCustomSourceProcessingTask(
        repository,
        taskId,
        isoNow(options)
      );
    }

    let running: CustomSourceProcessingTaskSnapshot;
    try {
      running = await markRunning(
        repository,
        snapshot,
        isoNow(options)
      );
    } catch (error) {
      if (!(error instanceof CustomContentTaskStateConflictError)) throw error;
      continue;
    }

    try {
      await options.beforeExecute?.(running);
      const interruptedBeforeExecution = await assertTaskStillRunning(
        repository,
        running
      );
      if (interruptedBeforeExecution) return interruptedBeforeExecution;
      const timestamp = isoNow(options);
      const result =
        running.task.taskKind === 'parse_source'
          ? await executeParseTask(repository, running, timestamp)
          : await executeChunkTask(repository, running, timestamp);
      await options.beforeCommit?.(running);
      const interruptedBeforeCommit = await assertTaskStillRunning(
        repository,
        running
      );
      if (interruptedBeforeCommit) return interruptedBeforeCommit;
      try {
        await repository.saveSourceProcessingCheckpoint({
          ...result,
          expectedStateRevision: taskRevision(running.task)
        });
        return { task: result.task, unit: result.unit };
      } catch (error) {
        if (!(error instanceof CustomContentTaskStateConflictError)) {
          throw error;
        }
        const latest = await loadCustomSourceProcessingTask(
          repository,
          taskId
        );
        if (!latest) throw error;
        return latest;
      }
    } catch (error) {
      const failed = await markFailed(
        repository,
        running,
        error,
        isoNow(options)
      );
      if (
        failed.task.status !== 'failed' ||
        !automaticRetry ||
        failed.unit.retryCount >= failed.task.maxRetries
      ) {
        return failed;
      }
    }
  }
}

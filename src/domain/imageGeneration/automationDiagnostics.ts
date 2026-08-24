import type { ImageAutomationTriggerRecord } from './automationRuntime';
import type { VisualRepositorySnapshot } from './visualRepository';

const KIND_LABELS: Record<ImageAutomationTriggerRecord['kind'], string> = {
  'character-created': '人物图',
  'story-turn-completed': '场景图'
};

export function formatImageAutomationDiagnostics(
  records: readonly ImageAutomationTriggerRecord[],
  snapshot: VisualRepositorySnapshot
): string {
  const lines = ['## Image Automation Diagnostics / 自动图片诊断'];
  if (records.length === 0) {
    lines.push('无自动图片触发记录。');
    return lines.join('\n');
  }

  for (const record of records.slice(0, 12)) {
    const tasks = record.taskIds
      .map((taskId) => snapshot.tasks[taskId])
      .filter((task) => Boolean(task));
    const submittedCount = tasks.filter((task) => Boolean(task.submittedRequest)).length;
    const taskStatuses = tasks.length > 0
      ? tasks.map((task) => task.status).join(',')
      : 'none';
    lines.push(
      [
        `- ${KIND_LABELS[record.kind]} subject=${record.subjectId}`,
        `status=${record.status}`,
        `retry=${record.retryCount}/${record.maxRetries}`,
        `tasks=${record.taskIds.length}`,
        `providerSubmitted=${submittedCount > 0 ? `yes(${submittedCount})` : 'no'}`,
        `taskStatuses=${taskStatuses}`,
        record.blockerCode ? `blocker=${record.blockerCode}` : null,
        `message=${record.safeMessage}`
      ].filter((value): value is string => Boolean(value)).join(' | ')
    );
  }
  if (records.length > 12) lines.push(`- 其余 ${records.length - 12} 条较早记录已省略。`);
  return lines.join('\n');
}

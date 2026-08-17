import { useEffect, useState } from 'react';

type AiGenerationKind = 'character' | 'event_project';
type CharacterGenerationPhase =
  | 'requesting'
  | 'local_normalization'
  | 'format_repair';

interface AiGenerationStatusProps {
  kind: AiGenerationKind;
  routeLabel?: string;
  characterPhase?: CharacterGenerationPhase;
}

function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} 分 ${remainder} 秒`;
}

export function AiGenerationStatus({
  kind,
  routeLabel,
  characterPhase = 'requesting'
}: AiGenerationStatusProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const isCharacter = kind === 'character';
  const characterPhaseText =
    characterPhase === 'local_normalization'
      ? {
          title: '正在本地整理人物格式',
          detail: '阶段 2/3 · 正在整理字段、数组、年龄与人物关系，不会新增设定。'
        }
      : characterPhase === 'format_repair'
        ? {
            title: '正在尝试一次格式修复',
            detail: '阶段 3/3 · 只修复同一人物的结构，不会重写或自动发布。'
          }
        : {
            title: 'AI 正在生成人物草稿',
            detail: '阶段 1/3 · 正在组织人物身份、背景、性格、价值观、动机与关系。'
          };

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(
        Math.max(1, Math.floor((Date.now() - startedAt) / 1_000))
      );
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="ccw-ai-generation-status"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
      aria-label={
        isCharacter ? 'AI 人物生成状态' : 'AI 短事件生成状态'
      }
    >
      <span
        className="ccw-ai-generation-status__spinner"
        aria-hidden="true"
      />
      <div>
        <strong>
          {isCharacter
            ? characterPhaseText.title
            : 'AI 正在生成短事件草稿'}
        </strong>
        <p>
          {isCharacter
            ? characterPhaseText.detail
            : '阶段 1/2 · 正在组织项目、人物候选、事件组、阶段与事件节点。'}
        </p>
        <small>
          {routeLabel ? `线路：${routeLabel} · ` : ''}
          {isCharacter
            ? '最终一定进入可编辑草稿；不完整内容仍需你补充后才能发布。'
            : '模型返回后自动进入阶段 2/2：校验 Schema、稳定键与引用关系。'}
        </small>
        <span
          className="ccw-ai-generation-status__elapsed"
          aria-hidden="true"
        >
          已等待 {formatElapsedTime(elapsedSeconds)}
          ，较慢模型可能需要几分钟，请保持窗口开启。
        </span>
      </div>
    </div>
  );
}

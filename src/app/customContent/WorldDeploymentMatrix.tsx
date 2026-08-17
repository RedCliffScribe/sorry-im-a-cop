import type { WorldpackAdaptationDescriptor } from '../../domain/worldpack/adaptationRegistry';
import {
  resolveCustomContentWorldDeployment,
  type CustomContentWorldDeployment,
  type CustomContentWorldDeploymentMode
} from '../../domain/customContent/worldAdaptation';

interface WorldDeploymentMatrixProps {
  descriptors: readonly WorldpackAdaptationDescriptor[];
  deployments: readonly CustomContentWorldDeployment[];
  readOnly?: boolean;
  onChange?: (deployments: CustomContentWorldDeployment[]) => void;
}

const modeLabels: Record<CustomContentWorldDeploymentMode, string> = {
  disabled: '不启用',
  native: '原生适用',
  ai_adapted: 'AI 适配'
};

export function WorldDeploymentMatrix({
  descriptors,
  deployments,
  readOnly = false,
  onChange
}: WorldDeploymentMatrixProps) {
  function update(
    worldpackId: string,
    patch: Partial<CustomContentWorldDeployment>
  ) {
    const current = resolveCustomContentWorldDeployment(
      deployments,
      worldpackId
    );
    const next = {
      ...current,
      ...patch
    };
    if (next.mode === 'disabled') {
      next.defaultEnabledForNewGame = false;
    }
    const byWorldpackId = new Map(
      deployments.map((deployment) => [
        deployment.worldpackId,
        { ...deployment }
      ])
    );
    byWorldpackId.set(worldpackId, next);
    onChange?.(Array.from(byWorldpackId.values()));
  }

  return (
    <div className="ccw-deployment-matrix" aria-label="适用世界包">
      {descriptors.map((descriptor) => {
        const deployment = resolveCustomContentWorldDeployment(
          deployments,
          descriptor.worldpackId
        );
        return (
          <section
            key={descriptor.worldpackId}
            className="ccw-deployment-row"
            data-worldpack-id={descriptor.worldpackId}
          >
            <div>
              <strong>{descriptor.title}</strong>
              <span>{descriptor.timeRange.from}—{descriptor.timeRange.to}</span>
            </div>
            <label>
              <span>投放方式</span>
              <select
                aria-label={`${descriptor.title}投放方式`}
                value={deployment.mode}
                disabled={readOnly}
                onChange={(event) =>
                  update(descriptor.worldpackId, {
                    mode: event.target.value as CustomContentWorldDeploymentMode
                  })
                }
              >
                {Object.entries(modeLabels).map(([mode, label]) => (
                  <option key={mode} value={mode}>{label}</option>
                ))}
              </select>
            </label>
            <label className="ccw-deployment-default">
              <input
                type="checkbox"
                checked={deployment.defaultEnabledForNewGame}
                disabled={readOnly || deployment.mode === 'disabled'}
                onChange={(event) =>
                  update(descriptor.worldpackId, {
                    defaultEnabledForNewGame: event.target.checked
                  })
                }
              />
              <span>新游戏默认选中</span>
            </label>
          </section>
        );
      })}
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  comfyWorkflowNameFromFile,
  MAX_COMFY_WORKFLOW_IMPORT_BYTES,
  parseComfyApiWorkflowJson,
  type ComfyWorkflowBindings,
  type ComfyWorkflowExposedParameter,
  type ComfyWorkflowTemplate,
  type ImageApiCredentialSummary,
  type ImageApiProfile,
  type ImageCredentialMaterial
} from '../../domain/imageGeneration/profile';

type ComfyWorkflowBindingKey = keyof ComfyWorkflowBindings;

interface ComfyWorkflowBindingDraft {
  nodeId: string;
  inputName: string;
}

interface ComfyWorkflowParameterDraft {
  draftId: string;
  key: string;
  label: string;
  description: string;
  nodeId: string;
  inputName: string;
  valueType: ComfyWorkflowExposedParameter['valueType'];
  min: string;
  max: string;
  step: string;
  options: string;
}

const COMFY_WORKFLOW_BINDING_FIELDS: ReadonlyArray<{
  key: ComfyWorkflowBindingKey;
  label: string;
  defaultInputName: string;
  required?: boolean;
}> = [
  { key: 'positivePrompt', label: '正向提示词', defaultInputName: 'text', required: true },
  { key: 'negativePrompt', label: '负向提示词', defaultInputName: 'text' },
  { key: 'referenceImage', label: '参考图片', defaultInputName: 'image' },
  { key: 'checkpoint', label: 'Checkpoint', defaultInputName: 'ckpt_name' },
  { key: 'seed', label: 'Seed', defaultInputName: 'seed' },
  { key: 'width', label: '宽度', defaultInputName: 'width' },
  { key: 'height', label: '高度', defaultInputName: 'height' },
  { key: 'steps', label: '步数', defaultInputName: 'steps' },
  { key: 'cfg', label: 'CFG', defaultInputName: 'cfg' },
  { key: 'sampler', label: '采样器', defaultInputName: 'sampler_name' },
  { key: 'scheduler', label: '调度器', defaultInputName: 'scheduler' }
];

function createComfyWorkflowBindingDrafts(): Record<ComfyWorkflowBindingKey, ComfyWorkflowBindingDraft> {
  return Object.fromEntries(COMFY_WORKFLOW_BINDING_FIELDS.map((field) => [
    field.key,
    { nodeId: '', inputName: field.defaultInputName }
  ])) as Record<ComfyWorkflowBindingKey, ComfyWorkflowBindingDraft>;
}

function createComfyWorkflowParameterDraft(): ComfyWorkflowParameterDraft {
  return {
    draftId: crypto.randomUUID(),
    key: '',
    label: '',
    description: '',
    nodeId: '',
    inputName: '',
    valueType: 'number',
    min: '',
    max: '',
    step: '',
    options: ''
  };
}

function optionalFiniteNumber(value: string, label: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label}必须是有效数值。`);
  return parsed;
}

function readWorkflowFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取所选工作流文件。'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('无法读取所选工作流文件。'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsText(file);
  });
}

interface ImageProfileEditorProps {
  profile: ImageApiProfile;
  credentials: ImageApiCredentialSummary[];
  workflows: ComfyWorkflowTemplate[];
  onChange: (profile: ImageApiProfile) => void;
  onSaveCredential: (input: {
    label: string;
    material: ImageCredentialMaterial;
    providerAffinity: ImageApiCredentialSummary['providerAffinity'];
  }) => Promise<string>;
  onSaveWorkflow: (input: {
    name: string;
    apiWorkflowText: string;
    bindings: ComfyWorkflowBindings;
    exposedParameters: ComfyWorkflowExposedParameter[];
    outputNodeIds: string[];
  }) => Promise<void>;
  onDeleteWorkflow?: (workflow: ComfyWorkflowTemplate) => Promise<boolean>;
}

function credentialKind(profile: ImageApiProfile): ImageCredentialMaterial['kind'] | 'none' {
  if (profile.providerType === 'comfyui-workflow') {
    if (profile.config.authMode === 'none') return 'none';
    if (profile.config.authMode === 'basic-auth') return 'basic-auth';
    if (profile.config.authMode === 'comfy-cloud-api-key') return 'api-key-header';
    return 'bearer-token';
  }
  if (profile.providerType === 'sd-webui') {
    if (profile.config.authMode === 'none') return 'none';
    return profile.config.authMode === 'basic-auth' ? 'basic-auth' : 'bearer-token';
  }
  return profile.providerType === 'gemini-image' ? 'api-key-header' : 'bearer-token';
}

function isLocalProxyProfile(profile: ImageApiProfile): boolean {
  return (
    (profile.providerType === 'comfyui-workflow' || profile.providerType === 'sd-webui') &&
    (profile.config.authMode === 'basic-auth' || profile.config.authMode === 'bearer-token')
  );
}

export function ImageProfileEditor({
  profile,
  credentials,
  workflows,
  onChange,
  onSaveCredential,
  onSaveWorkflow,
  onDeleteWorkflow
}: ImageProfileEditorProps) {
  const [credentialLabel, setCredentialLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [credentialStatus, setCredentialStatus] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [workflowText, setWorkflowText] = useState('');
  const [workflowBindingDrafts, setWorkflowBindingDrafts] = useState(createComfyWorkflowBindingDrafts);
  const [workflowParameterDrafts, setWorkflowParameterDrafts] = useState<ComfyWorkflowParameterDraft[]>([]);
  const [outputNodeIds, setOutputNodeIds] = useState('');
  const [workflowStatus, setWorkflowStatus] = useState('');

  const requiredCredentialKind = credentialKind(profile);
  const compatibleCredentials = useMemo(
    () => credentials.filter((credential) =>
      credential.materialKind === requiredCredentialKind &&
      (
        credential.providerAffinity === profile.providerType ||
        (isLocalProxyProfile(profile) && credential.providerAffinity === 'local-reverse-proxy')
      )
    ),
    [credentials, profile, requiredCredentialKind]
  );

  const updateConfig = (patch: Record<string, unknown>) => {
    onChange({ ...profile, config: { ...profile.config, ...patch } } as ImageApiProfile);
  };

  const saveCredential = async () => {
    setCredentialStatus('');
    try {
      if (!credentialLabel.trim()) throw new Error('请填写凭据名称。');
      if (requiredCredentialKind === 'none') throw new Error('当前档案不需要凭据。');
      const material: ImageCredentialMaterial = requiredCredentialKind === 'basic-auth'
        ? { kind: 'basic-auth', username, password }
        : requiredCredentialKind === 'api-key-header'
          ? { kind: 'api-key-header', apiKey: secret }
          : { kind: 'bearer-token', token: secret };
      const credentialId = await onSaveCredential({
        label: credentialLabel.trim(),
        material,
        providerAffinity: isLocalProxyProfile(profile) ? 'local-reverse-proxy' : profile.providerType
      });
      onChange({ ...profile, credentialId });
      setCredentialLabel('');
      setSecret('');
      setUsername('');
      setPassword('');
      setCredentialStatus('凭据已保存到独立本机仓库并关联到当前草稿；请继续保存档案。');
    } catch (error) {
      setCredentialStatus(error instanceof Error ? error.message : '凭据保存失败。');
    }
  };

  const saveWorkflow = async () => {
    setWorkflowStatus('');
    try {
      const bindings: Partial<ComfyWorkflowBindings> = {};
      for (const field of COMFY_WORKFLOW_BINDING_FIELDS) {
        const draft = workflowBindingDrafts[field.key];
        const nodeId = draft.nodeId.trim();
        const inputName = draft.inputName.trim();
        if (!nodeId) {
          if (field.required) throw new Error(`请填写${field.label}节点 ID。`);
          continue;
        }
        if (!inputName) throw new Error(`请填写${field.label}输入名。`);
        bindings[field.key] = { nodeId, inputName };
      }
      const exposedParameters = workflowParameterDrafts.map((draft, index): ComfyWorkflowExposedParameter => {
        const prefix = `开放参数 ${index + 1}`;
        const key = draft.key.trim();
        const label = draft.label.trim();
        const nodeId = draft.nodeId.trim();
        const inputName = draft.inputName.trim();
        if (!key || !label || !nodeId || !inputName) {
          throw new Error(`${prefix}必须填写参数键、显示名称、节点 ID 和输入名。`);
        }
        const options = draft.valueType === 'select'
          ? draft.options
            .split(/[\n,]/)
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => {
              const [value, optionLabel] = entry.split('|', 2).map((part) => part.trim());
              return { value, label: optionLabel || undefined };
            })
          : undefined;
        return {
          key,
          label,
          description: draft.description.trim() || undefined,
          binding: { nodeId, inputName },
          valueType: draft.valueType,
          min: optionalFiniteNumber(draft.min, `${prefix}最小值`),
          max: optionalFiniteNumber(draft.max, `${prefix}最大值`),
          step: optionalFiniteNumber(draft.step, `${prefix}步进`),
          options
        };
      });
      await onSaveWorkflow({
        name: workflowName.trim(),
        apiWorkflowText: workflowText,
        bindings: bindings as ComfyWorkflowBindings,
        exposedParameters,
        outputNodeIds: outputNodeIds.split(',').map((value) => value.trim()).filter(Boolean)
      });
      setWorkflowName('');
      setWorkflowText('');
      setWorkflowBindingDrafts(createComfyWorkflowBindingDrafts());
      setWorkflowParameterDrafts([]);
      setOutputNodeIds('');
      setWorkflowStatus('API 工作流已保存；生成测试时可选择它。');
    } catch (error) {
      setWorkflowStatus(error instanceof Error ? error.message : 'API 工作流保存失败。');
    }
  };

  const importWorkflowFile = async (file?: File) => {
    setWorkflowStatus('');
    if (!file) return;
    try {
      if (
        !file.name.toLowerCase().endsWith('.json') &&
        file.type !== 'application/json'
      ) {
        throw new Error('请选择 .json 格式的 ComfyUI API 工作流文件。');
      }
      if (file.size > MAX_COMFY_WORKFLOW_IMPORT_BYTES) {
        throw new Error('工作流文件不能超过 5 MiB。');
      }
      const source = await readWorkflowFile(file);
      const parsed = parseComfyApiWorkflowJson(source);
      setWorkflowText(JSON.stringify(parsed.apiWorkflow, null, 2));
      setWorkflowName((current) =>
        current.trim() ? current : comfyWorkflowNameFromFile(file.name)
      );
      if (parsed.suggestedOutputNodeIds.length) {
        setOutputNodeIds((current) =>
          current.trim()
            ? current
            : parsed.suggestedOutputNodeIds.join(', ')
        );
      }
      setWorkflowStatus(
        `已导入 ${file.name}（${parsed.nodeCount} 个节点）${
          parsed.suggestedOutputNodeIds.length
            ? `，识别到常见图片输出节点 ${parsed.suggestedOutputNodeIds.join('、')}`
            : '，未自动识别图片输出节点'
        }。请确认提示词、输出和其他节点绑定后再保存。`
      );
    } catch (error) {
      setWorkflowStatus(
        error instanceof Error ? error.message : '工作流文件导入失败。'
      );
    }
  };

  const deleteWorkflow = async (workflow: ComfyWorkflowTemplate) => {
    if (!onDeleteWorkflow) return;
    setWorkflowStatus('');
    try {
      const deleted = await onDeleteWorkflow(workflow);
      if (deleted) setWorkflowStatus(`API 工作流“${workflow.name}”已删除。`);
    } catch (error) {
      setWorkflowStatus(error instanceof Error ? error.message : 'API 工作流删除失败。');
    }
  };

  return (
    <div className="image-profile-editor">
      <div className="image-profile-editor__grid">
        <label className="image-profile-editor__wide image-profile-editor__api-address">
          API 根地址
          <input
            aria-label="API 根地址"
            aria-describedby="image-profile-api-address-help"
            value={profile.apiBaseUrl}
            placeholder="例如 https://api.openai.com/v1"
            onChange={(event) => onChange({ ...profile, apiBaseUrl: event.target.value })}
            spellCheck={false}
          />
          <small id="image-profile-api-address-help">填写图片服务商提供的 API 根地址；兼容服务商请替换上方官方默认地址。</small>
        </label>
        <label>
          档案名称
          <input value={profile.name} onChange={(event) => onChange({ ...profile, name: event.target.value })} />
        </label>
        <label>
          后端类型
          <input value={profile.providerType} disabled />
        </label>
        <label className="image-profile-editor__checkbox">
          <input
            type="checkbox"
            checked={profile.enabled}
            onChange={(event) => onChange({ ...profile, enabled: event.target.checked })}
          />
          启用此档案（仍不会绕过自动模式真实探针门禁）
        </label>
        {'models' in profile ? (
          <label className="image-profile-editor__wide">
            默认测试模型
            <input
              value={profile.defaultModelId ?? ''}
              placeholder="手动填写准确模型 ID"
              onChange={(event) => {
                const modelId = event.target.value.trim();
                onChange({
                  ...profile,
                  models: modelId ? [{ modelId, source: 'manual' }] : [],
                  defaultModelId: modelId || undefined
                });
              }}
            />
            <small>Phase 1-A 先支持一个手填测试模型；目录发现结果不会被当作图片生成能力证明。</small>
          </label>
        ) : null}
      </div>

      <fieldset className="image-profile-editor__protocol">
        <legend>协议字段</legend>
        {profile.providerType === 'openai-images' ? (
          <div className="image-profile-editor__grid">
            <label>API 类型<select value={profile.config.apiVariant} onChange={(event) => updateConfig({ apiVariant: event.target.value })}>
              <option value="openai-official">OpenAI 官方</option><option value="openai-compatible">OpenAI Images-compatible</option>
            </select></label>
            <label>结果传输<select value={profile.config.resultTransportPreference} onChange={(event) => updateConfig({ resultTransportPreference: event.target.value })}>
              <option value="auto">自动识别</option><option value="base64-json">base64 JSON</option><option value="temporary-url">临时 URL</option>
            </select></label>
            <label>模型发现<select value={profile.config.modelDiscovery} onChange={(event) => updateConfig({ modelDiscovery: event.target.value })}>
              <option value="standard-models-endpoint">标准模型目录</option><option value="disabled">不支持发现</option>
            </select></label>
          </div>
        ) : null}
        {profile.providerType === 'xai-images' ? (
          <label>结果传输<select value={profile.config.resultTransportPreference} onChange={(event) => updateConfig({ resultTransportPreference: event.target.value })}>
            <option value="auto">自动识别</option><option value="temporary-url">临时 URL</option><option value="base64-json">base64 JSON</option>
          </select></label>
        ) : null}
        {profile.providerType === 'gemini-image' ? (
          <label>图片协议<select value={profile.config.apiMode} onChange={(event) => updateConfig({ apiMode: event.target.value })}>
            <option value="interactions">Interactions（当前）</option><option value="generate-content-legacy">generateContent（旧协议）</option>
          </select></label>
        ) : null}
        {profile.providerType === 'alibaba-model-studio' ? (
          <div className="image-profile-editor__grid">
            <label>区域<select value={profile.config.region} onChange={(event) => updateConfig({ region: event.target.value })}>
              <option value="cn-beijing">中国北京</option><option value="ap-southeast-1">新加坡</option><option value="us-east-1">美国东部</option><option value="eu-central-1">欧洲中部</option>
            </select></label>
            <label>地址模式<select value={profile.config.endpointMode} onChange={(event) => updateConfig({ endpointMode: event.target.value })}>
              <option value="regional-shared-domain">区域共享域名</option><option value="workspace-domain">Workspace 域名</option>
            </select></label>
            {profile.config.endpointMode === 'workspace-domain' ? <label>Workspace ID<input value={profile.config.workspaceId ?? ''} onChange={(event) => updateConfig({ workspaceId: event.target.value || undefined })} /></label> : null}
            <label>协议变体<select value={profile.config.protocolVariant} onChange={(event) => updateConfig({ protocolVariant: event.target.value })}>
              <option value="multimodal-generation-sync">多模态同步</option><option value="image-generation-async">现代图片异步</option><option value="legacy-text2image-async">旧 text2image 异步</option>
            </select></label>
          </div>
        ) : null}
        {profile.providerType === 'novelai-image' ? (
          <div className="image-profile-editor__grid">
            <label>响应格式<select value={profile.config.responseFormat} onChange={(event) => updateConfig({ responseFormat: event.target.value })}>
              <option value="auto">自动识别</option><option value="json-base64">JSON base64</option><option value="zip">ZIP</option>
            </select></label>
            <label className="image-profile-editor__checkbox"><input type="checkbox" checked={Boolean(profile.config.usageNoticeAcceptedAt)} onChange={(event) => updateConfig({ usageNoticeAcceptedAt: event.target.checked ? new Date().toISOString() : undefined })} />我已了解请求必须来自明确玩家动作，禁止无人值守批量与无限重试</label>
          </div>
        ) : null}
        {profile.providerType === 'comfyui-workflow' ? (
          <div className="image-profile-editor__grid">
            <label>部署类型<select value={profile.config.deployment} onChange={(event) => updateConfig({ deployment: event.target.value })}>
              <option value="core-server">ComfyUI Core</option><option value="comfy-cloud">Comfy Cloud</option>
            </select></label>
            <label>认证方式<select value={profile.config.authMode} onChange={(event) => onChange({
              ...profile,
              credentialId: undefined,
              config: { ...profile.config, authMode: event.target.value }
            } as ImageApiProfile)}>
              <option value="none">无认证</option><option value="comfy-cloud-api-key">Comfy Cloud API Key</option><option value="basic-auth">反向代理 Basic</option><option value="bearer-token">反向代理 Bearer</option>
            </select></label>
            <label>事件通道<select value={profile.config.eventTransport} onChange={(event) => updateConfig({ eventTransport: event.target.value })}>
              <option value="websocket-preferred">WebSocket 优先</option><option value="polling-only">仅 history 轮询</option>
            </select></label>
            <label className="image-profile-editor__checkbox"><input type="checkbox" checked={profile.config.exclusiveInstance} onChange={(event) => updateConfig({ exclusiveInstance: event.target.checked })} />这是玩家独占实例</label>
          </div>
        ) : null}
        {profile.providerType === 'sd-webui' ? (
          <div className="image-profile-editor__grid">
            <label>认证方式<select value={profile.config.authMode} onChange={(event) => onChange({
              ...profile,
              credentialId: undefined,
              config: { ...profile.config, authMode: event.target.value }
            } as ImageApiProfile)}>
              <option value="none">无认证</option><option value="basic-auth">A1111 / 代理 Basic</option><option value="bearer-token">反向代理 Bearer</option>
            </select></label>
            <label>目录发现<select value={profile.config.schemaDiscovery} onChange={(event) => updateConfig({ schemaDiscovery: event.target.value })}>
              <option value="live-docs-preferred">实时 /docs 优先</option><option value="core-contract-only">仅核心契约</option>
            </select></label>
            <label className="image-profile-editor__checkbox"><input type="checkbox" checked={profile.config.exclusiveInstance} onChange={(event) => updateConfig({ exclusiveInstance: event.target.checked })} />这是玩家独占实例</label>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="image-profile-editor__credentials">
        <legend>本机凭据</legend>
        {requiredCredentialKind === 'none' ? (
          <p className="muted">当前选择无认证；档案不会引用凭据。</p>
        ) : (
          <>
            <label>已保存凭据<select value={profile.credentialId ?? ''} onChange={(event) => onChange({ ...profile, credentialId: event.target.value || undefined })}>
              <option value="">请选择</option>
              {compatibleCredentials.map((credential) => <option key={credential.credentialId} value={credential.credentialId}>{credential.label} · {credential.maskedHint}</option>)}
            </select></label>
            <div className="image-profile-editor__credential-create">
              <label>新凭据名称<input value={credentialLabel} onChange={(event) => setCredentialLabel(event.target.value)} /></label>
              {requiredCredentialKind === 'basic-auth' ? (
                <><label>用户名<input autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>密码<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label></>
              ) : (
                <label>{requiredCredentialKind === 'api-key-header' ? 'API Key' : 'Token'}<input type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} /></label>
              )}
              <button type="button" onClick={() => void saveCredential()}>保存新凭据并关联</button>
            </div>
            {credentialStatus ? <p role="status" className="image-settings-gate-note">{credentialStatus}</p> : null}
            <small>凭据存放在独立 IndexedDB，不进入档案、游戏存档、视觉仓库或导出。</small>
          </>
        )}
      </fieldset>

      {profile.providerType === 'comfyui-workflow' ? (
        <fieldset className="image-profile-editor__workflow">
          <legend>ComfyUI API 工作流</legend>
          <p className="muted">只接受“Export Workflow (API)”JSON；不执行脚本，也不在 JSON 中保存服务密钥。</p>
          <div className="image-profile-editor__grid">
            <label>模板名称<input value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} /></label>
            <label>输出节点 ID（逗号分隔）<input value={outputNodeIds} onChange={(event) => setOutputNodeIds(event.target.value)} /></label>
            <label className="image-profile-editor__wide image-profile-editor__workflow-import">
              导入 API 工作流 JSON 文件
              <input
                aria-label="导入 ComfyUI API 工作流 JSON 文件"
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  void importWorkflowFile(file);
                  event.currentTarget.value = '';
                }}
              />
              <small>文件只会读入当前表单，不会自动保存或发送到 ComfyUI；最大 5 MiB。</small>
            </label>
            <label className="image-profile-editor__wide">API 工作流 JSON<textarea rows={8} value={workflowText} onChange={(event) => setWorkflowText(event.target.value)} spellCheck={false} /></label>
          </div>
          <fieldset className="image-profile-editor__protocol">
            <legend>声明输入绑定</legend>
            <p className="muted">正向提示词必填；其他绑定留空时保留工作流原值。只有明确填写“参考图片”绑定的工作流，玩家才能选择图片并在提交前上传到 ComfyUI input。</p>
            <div className="image-profile-editor__grid">
              {COMFY_WORKFLOW_BINDING_FIELDS.map((field) => {
                const draft = workflowBindingDrafts[field.key];
                return (
                  <div className="image-profile-editor__binding-pair" key={field.key}>
                    <label>
                      {field.label}节点 ID{field.required ? '（必填）' : ''}
                      <input
                        aria-label={`${field.label}节点 ID`}
                        value={draft.nodeId}
                        onChange={(event) => setWorkflowBindingDrafts((current) => ({
                          ...current,
                          [field.key]: { ...current[field.key], nodeId: event.target.value }
                        }))}
                      />
                    </label>
                    <label>
                      {field.label}输入名
                      <input
                        value={draft.inputName}
                        onChange={(event) => setWorkflowBindingDrafts((current) => ({
                          ...current,
                          [field.key]: { ...current[field.key], inputName: event.target.value }
                        }))}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="image-profile-editor__protocol">
            <legend>向玩家开放工作流参数</legend>
            <p className="muted">
              可开放去噪、LoRA / IPAdapter / ControlNet 强度、起止比例、模型选项等节点输入。
              玩家不填写时保留工作流原值；提示词、参考图和上方标准绑定不能在这里重复覆盖。
            </p>
            {workflowParameterDrafts.map((draft, index) => {
              const updateParameter = (patch: Partial<ComfyWorkflowParameterDraft>) => {
                setWorkflowParameterDrafts((current) => current.map((entry) =>
                  entry.draftId === draft.draftId ? { ...entry, ...patch } : entry
                ));
              };
              const numeric = draft.valueType === 'number' || draft.valueType === 'integer';
              return (
                <fieldset className="image-profile-editor__protocol" key={draft.draftId}>
                  <legend>开放参数 {index + 1}</legend>
                  <div className="image-profile-editor__grid">
                    <label>参数键<input aria-label={`开放参数 ${index + 1} 参数键`} placeholder="例如 denoise" value={draft.key} onChange={(event) => updateParameter({ key: event.target.value })} /></label>
                    <label>显示名称<input aria-label={`开放参数 ${index + 1} 显示名称`} placeholder="例如 重绘幅度" value={draft.label} onChange={(event) => updateParameter({ label: event.target.value })} /></label>
                    <label>节点 ID<input aria-label={`开放参数 ${index + 1} 节点 ID`} value={draft.nodeId} onChange={(event) => updateParameter({ nodeId: event.target.value })} /></label>
                    <label>输入名<input aria-label={`开放参数 ${index + 1} 输入名`} placeholder="例如 denoise" value={draft.inputName} onChange={(event) => updateParameter({ inputName: event.target.value })} /></label>
                    <label>类型<select aria-label={`开放参数 ${index + 1} 类型`} value={draft.valueType} onChange={(event) => updateParameter({ valueType: event.target.value as ComfyWorkflowParameterDraft['valueType'] })}>
                      <option value="number">数值</option><option value="integer">整数</option><option value="text">文本</option><option value="boolean">开关</option><option value="select">枚举选项</option>
                    </select></label>
                    {numeric ? (
                      <>
                        <label>最小值<input type="number" value={draft.min} onChange={(event) => updateParameter({ min: event.target.value })} /></label>
                        <label>最大值<input type="number" value={draft.max} onChange={(event) => updateParameter({ max: event.target.value })} /></label>
                        <label>步进<input type="number" min={0} value={draft.step} onChange={(event) => updateParameter({ step: event.target.value })} /></label>
                      </>
                    ) : null}
                    {draft.valueType === 'select' ? (
                      <label className="image-profile-editor__wide">
                        选项（逗号或换行分隔，可写 值|显示名）
                        <textarea rows={3} value={draft.options} onChange={(event) => updateParameter({ options: event.target.value })} />
                      </label>
                    ) : null}
                    <label className="image-profile-editor__wide">说明<input value={draft.description} onChange={(event) => updateParameter({ description: event.target.value })} /></label>
                  </div>
                  <button type="button" onClick={() => setWorkflowParameterDrafts((current) => current.filter((entry) => entry.draftId !== draft.draftId))}>删除此开放参数</button>
                </fieldset>
              );
            })}
            <button
              type="button"
              disabled={workflowParameterDrafts.length >= 64}
              onClick={() => setWorkflowParameterDrafts((current) => [...current, createComfyWorkflowParameterDraft()])}
            >
              新增开放参数
            </button>
          </fieldset>
          <button type="button" onClick={() => void saveWorkflow()}>校验并保存工作流</button>
          {workflowStatus ? <p role="status" className="image-settings-gate-note">{workflowStatus}</p> : null}
          {workflows.length ? (
            <section className="image-profile-editor__workflow-library" aria-label="已保存 ComfyUI API 工作流">
              <p className="muted">已保存工作流</p>
              <ul>
                {workflows.map((workflow) => (
                  <li key={workflow.workflowTemplateId}>
                    <span>
                      <strong>{workflow.name}</strong>
                      <small>修订 {workflow.revision} · {workflow.outputNodeIds.length} 个输出节点</small>
                    </span>
                    {onDeleteWorkflow ? (
                      <button
                        type="button"
                        className="danger-button"
                        aria-label={`删除工作流“${workflow.name}”`}
                        onClick={() => void deleteWorkflow(workflow)}
                      >
                        删除
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : <p className="muted">尚未保存 ComfyUI API 工作流。</p>}
        </fieldset>
      ) : null}
    </div>
  );
}

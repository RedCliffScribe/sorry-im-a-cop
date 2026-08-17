import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeImageBrowserTarget,
  runImageBrowserBoundaryProbe,
  sanitizeImageBrowserBoundaryMessage
} from '../../domain/imageGeneration/browserBoundary';
import type {
  ImageBrowserBoundaryAuth,
  ImageBrowserBoundaryProbeReport,
  ImageBrowserBoundaryTargetKind
} from '../../domain/imageGeneration/browserBoundary';
import { IMAGE_PROBE_STAGES, type ImageProbeStage } from '../../domain/imageGeneration/probe';
import './imageProbeBoundaryLab.css';

const DEFAULT_URLS: Record<ImageBrowserBoundaryTargetKind, string> = {
  'comfyui-core': 'http://127.0.0.1:8188',
  'sd-webui': 'http://127.0.0.1:7860'
};

type AuthMode = ImageBrowserBoundaryAuth['mode'];

const STATUS_LABELS = {
  passed: '通过',
  'http-failed': 'HTTP 失败',
  'blocked-or-unreachable': '被阻止或不可达',
  'timed-out': '超时',
  cancelled: '已取消',
  'not-run': '未执行'
} as const;

const GENERATION_STAGE_LABELS: Record<ImageProbeStage, string> = {
  'local-validation': '本地校验',
  authentication: '认证检查',
  submit: '提交任务',
  'poll-or-wait': '排队或等待',
  download: '下载结果',
  decode: '图片解码',
  'blob-persist': '本地保存'
};

type LocalValidationState =
  | { status: 'not-run'; message: string }
  | { status: 'passed'; message: string }
  | { status: 'failed'; message: string };

type GenerationRehearsalStatus = 'idle' | 'running' | 'completed' | 'cancelled';

function waitForRehearsalStep(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, 55);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('界面演练已停止。', 'AbortError'));
      },
      { once: true }
    );
  });
}

function BoundaryResult({ report }: { report: ImageBrowserBoundaryProbeReport }) {
  return (
    <section className="image-probe-lab__results" aria-labelledby="image-probe-result-title">
      <div className="image-probe-lab__section-heading">
        <div>
          <p className="image-probe-lab__eyebrow">本轮结果</p>
          <h2 id="image-probe-result-title">浏览器边界证据</h2>
        </div>
        <span className="image-probe-lab__timestamp">
          {new Date(report.completedAt).toLocaleTimeString('zh-CN')}
        </span>
      </div>

      <p className="image-probe-lab__summary" role="status">
        {report.safeSummary}
      </p>

      <dl className="image-probe-lab__facts">
        <div>
          <dt>目标地址空间</dt>
          <dd>{report.analysis.targetAddressSpace}</dd>
        </div>
        <div>
          <dt>跨源</dt>
          <dd>{report.analysis.crossOrigin ? '是' : '否'}</dd>
        </div>
        <div>
          <dt>预计触发本地网络权限</dt>
          <dd>{report.analysis.localNetworkAccessExpected ? '是' : '否'}</dd>
        </div>
      </dl>

      <ul className="image-probe-lab__result-list" aria-label="端点诊断结果">
        {report.endpoints.map((result) => (
          <li key={result.path} data-status={result.status}>
            <div>
              <strong>{result.label}</strong>
              <code>{result.path}{result.required ? '' : '（可选）'}</code>
            </div>
            <div className="image-probe-lab__result-detail">
              <span className="image-probe-lab__status">{STATUS_LABELS[result.status]}</span>
              <span>{result.httpStatus ? `HTTP ${result.httpStatus}` : result.safeSummary}</span>
              <span>{result.durationMs} ms</span>
              {result.status === 'passed' && <span>读取 {result.bytesRead} B</span>}
            </div>
          </li>
        ))}
        {report.webSocket && (
          <li data-status={report.webSocket.status}>
            <div>
              <strong>ComfyUI WebSocket</strong>
              <code>/ws</code>
            </div>
            <div className="image-probe-lab__result-detail">
              <span className="image-probe-lab__status">{STATUS_LABELS[report.webSocket.status]}</span>
              <span>{report.webSocket.safeSummary}</span>
              <span>{report.webSocket.durationMs} ms</span>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}

export function ImageProbeBoundaryLab() {
  const [targetKind, setTargetKind] = useState<ImageBrowserBoundaryTargetKind>('comfyui-core');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_URLS['comfyui-core']);
  const [authMode, setAuthMode] = useState<AuthMode>('none');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [testWebSocket, setTestWebSocket] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ImageBrowserBoundaryProbeReport | null>(null);
  const [localValidation, setLocalValidation] = useState<LocalValidationState>({
    status: 'not-run',
    message: '尚未检查当前临时档案。'
  });
  const [generationConfirmationOpen, setGenerationConfirmationOpen] = useState(false);
  const [generationRehearsalStatus, setGenerationRehearsalStatus] = useState<GenerationRehearsalStatus>('idle');
  const [activeGenerationStage, setActiveGenerationStage] = useState<ImageProbeStage | null>(null);
  const [completedGenerationStages, setCompletedGenerationStages] = useState<ImageProbeStage[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const generationControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const preview = useMemo(() => {
    try {
      const auth: ImageBrowserBoundaryAuth =
        authMode === 'basic'
          ? { mode: 'basic', username: '', password: '' }
          : authMode === 'bearer'
            ? { mode: 'bearer', token: '' }
            : { mode: 'none' };
      return analyzeImageBrowserTarget(baseUrl, window.location.href, auth);
    } catch {
      return null;
    }
  }, [authMode, baseUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort(new DOMException('页面已关闭。', 'AbortError'));
      generationControllerRef.current?.abort(new DOMException('页面已关闭。', 'AbortError'));
    };
  }, []);

  const clearGenerationRehearsal = () => {
    generationControllerRef.current?.abort(new DOMException('界面演练结果已清理。', 'AbortError'));
    generationControllerRef.current = null;
    setGenerationConfirmationOpen(false);
    setGenerationRehearsalStatus('idle');
    setActiveGenerationStage(null);
    setCompletedGenerationStages([]);
  };

  const resetProfileEvidence = () => {
    setLocalValidation({ status: 'not-run', message: '档案字段已改变，请重新执行本地校验。' });
    setReport(null);
    setError('');
    clearGenerationRehearsal();
  };

  const changeTarget = (next: ImageBrowserBoundaryTargetKind) => {
    setTargetKind(next);
    setBaseUrl(DEFAULT_URLS[next]);
    resetProfileEvidence();
    if (next === 'sd-webui') setTestWebSocket(false);
  };

  const changeAuthMode = (next: AuthMode) => {
    setAuthMode(next);
    resetProfileEvidence();
  };

  const createAuth = (): ImageBrowserBoundaryAuth => {
    if (authMode === 'basic') return { mode: 'basic', username, password };
    if (authMode === 'bearer') return { mode: 'bearer', token };
    return { mode: 'none' };
  };

  const runLocalValidation = () => {
    try {
      const parsedUrl = new URL(baseUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Base URL 必须使用 HTTP 或 HTTPS。');
      }
      if (authMode === 'basic' && (!username.trim() || !password)) {
        throw new Error('Basic 鉴权必须填写用户名和密码。');
      }
      if (authMode === 'bearer' && !token.trim()) {
        throw new Error('Bearer 鉴权必须填写 Token。');
      }
      if (!preview) throw new Error('当前地址无法形成浏览器连接目标。');

      const warning = preview.warnings[0];
      setLocalValidation({
        status: 'passed',
        message: warning ? `字段形状有效；浏览器风险提示：${warning}` : '字段形状有效；这不代表连接或生图成功。'
      });
    } catch (validationError) {
      setLocalValidation({
        status: 'failed',
        message: validationError instanceof Error ? validationError.message : '当前档案字段无效。'
      });
    }
  };

  const runGenerationRehearsal = async () => {
    const controller = new AbortController();
    generationControllerRef.current = controller;
    setGenerationConfirmationOpen(false);
    setGenerationRehearsalStatus('running');
    setCompletedGenerationStages([]);
    setActiveGenerationStage(IMAGE_PROBE_STAGES[0]);

    try {
      const completed: ImageProbeStage[] = [];
      for (const stage of IMAGE_PROBE_STAGES) {
        setActiveGenerationStage(stage);
        await waitForRehearsalStep(controller.signal);
        completed.push(stage);
        if (mountedRef.current) setCompletedGenerationStages([...completed]);
      }
      if (mountedRef.current) {
        setActiveGenerationStage(null);
        setGenerationRehearsalStatus('completed');
      }
    } catch (rehearsalError) {
      if (
        mountedRef.current &&
        generationControllerRef.current === controller &&
        rehearsalError instanceof DOMException &&
        rehearsalError.name === 'AbortError'
      ) {
        setActiveGenerationStage(null);
        setGenerationRehearsalStatus('cancelled');
      }
    } finally {
      if (generationControllerRef.current === controller) generationControllerRef.current = null;
    }
  };

  const runProbe = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setError('');
    setReport(null);
    try {
      const nextReport = await runImageBrowserBoundaryProbe({
        targetKind,
        baseUrl,
        auth: createAuth(),
        testWebSocket: targetKind === 'comfyui-core' && testWebSocket,
        signal: controller.signal
      });
      setReport(nextReport);
    } catch (probeError) {
      setError(sanitizeImageBrowserBoundaryMessage(probeError));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setRunning(false);
    }
  };

  return (
    <main className="image-probe-lab">
      <header className="image-probe-lab__hero">
        <div>
          <p className="image-probe-lab__eyebrow">TEST BRANCH · P0-B / P0-G</p>
          <h1>文生图浏览器边界实验室</h1>
          <p>先证明 Pages 浏览器能否连接本地 ComfyUI / SD WebUI，再决定正式适配方式。</p>
        </div>
        <span className="image-probe-lab__build-badge">测试构建专用</span>
      </header>

      <aside className="image-probe-lab__warning" aria-label="诊断边界说明">
        <strong>本页不会生成图片、不会产生模型费用、不会保存配置或凭据。</strong>
        <span>它只读取公开元数据端点；通过也不等于实际文生图已经通过。</span>
      </aside>

      <div className="image-probe-lab__layout">
        <section className="image-probe-lab__panel" aria-labelledby="image-probe-config-title">
          <div className="image-probe-lab__section-heading">
            <div>
              <p className="image-probe-lab__eyebrow">连接配置</p>
              <h2 id="image-probe-config-title">本轮临时参数</h2>
            </div>
            <span>仅存于当前页面内存</span>
          </div>

          <div className="image-probe-lab__form-grid">
            <label>
              <span>目标后端</span>
              <select
                value={targetKind}
                disabled={running}
                onChange={(event) => changeTarget(event.target.value as ImageBrowserBoundaryTargetKind)}
              >
                <option value="comfyui-core">ComfyUI 核心 API</option>
                <option value="sd-webui">SD WebUI API</option>
              </select>
            </label>

            <label className="image-probe-lab__wide-field">
              <span>Base URL</span>
              <input
                type="url"
                value={baseUrl}
                disabled={running}
                spellCheck={false}
                placeholder="http://127.0.0.1:8188"
                onChange={(event) => {
                  setBaseUrl(event.target.value);
                  resetProfileEvidence();
                }}
              />
            </label>

            <label>
              <span>鉴权方式</span>
              <select
                value={authMode}
                disabled={running}
                onChange={(event) => changeAuthMode(event.target.value as AuthMode)}
              >
                <option value="none">无鉴权</option>
                <option value="basic">Basic</option>
                <option value="bearer">Bearer Token</option>
              </select>
            </label>

            {authMode === 'basic' && (
              <>
                <label>
                  <span>用户名</span>
                  <input
                    value={username}
                    disabled={running}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      resetProfileEvidence();
                    }}
                  />
                </label>
                <label>
                  <span>密码</span>
                  <input
                    type="password"
                    value={password}
                    disabled={running}
                    autoComplete="off"
                    onChange={(event) => {
                      setPassword(event.target.value);
                      resetProfileEvidence();
                    }}
                  />
                </label>
              </>
            )}

            {authMode === 'bearer' && (
              <label className="image-probe-lab__wide-field">
                <span>Bearer Token</span>
                <input
                  type="password"
                  value={token}
                  disabled={running}
                  autoComplete="off"
                  onChange={(event) => {
                    setToken(event.target.value);
                    resetProfileEvidence();
                  }}
                />
              </label>
            )}
          </div>

          {targetKind === 'comfyui-core' && (
            <label className="image-probe-lab__check-row">
              <input
                type="checkbox"
                checked={testWebSocket}
                disabled={running}
                onChange={(event) => {
                  setTestWebSocket(event.target.checked);
                  resetProfileEvidence();
                }}
              />
              <span>同时测试 ComfyUI WebSocket（带鉴权时只能标记为未验证）</span>
            </label>
          )}

          {preview && (
            <div className="image-probe-lab__advisory" aria-label="连接风险预判">
              <strong>浏览器预判</strong>
              {preview.warnings.length > 0 ? (
                <ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              ) : (
                <p>当前地址未发现额外浏览器边界提示，仍以实际请求结果为准。</p>
              )}
            </div>
          )}

          {error && <p className="image-probe-lab__error" role="alert">{error}</p>}

          <section className="image-probe-lab__tiers" aria-label="图片档案三层测试">
            <article data-status={localValidation.status}>
              <span className="image-probe-lab__tier-number">01</span>
              <h3>本地校验</h3>
              <p>只检查地址、鉴权字段和目标形状，不发送网络请求。</p>
              <button type="button" disabled={running} onClick={runLocalValidation}>执行本地校验</button>
              <small>{localValidation.message}</small>
            </article>

            <article data-status={report ? 'completed' : running ? 'running' : 'not-run'}>
              <span className="image-probe-lab__tier-number">02</span>
              <h3>廉价元数据探针</h3>
              <p>读取诊断端点；不生图，也不能证明当前模型可以生成。</p>
              <button
                type="button"
                className="image-probe-lab__primary"
                disabled={running}
                onClick={() => void runProbe()}
              >
                {running ? '元数据诊断中…' : '开始元数据诊断'}
              </button>
              <small>{report ? report.safeSummary : '尚未取得本轮浏览器边界证据。'}</small>
            </article>

            <article data-status={generationRehearsalStatus}>
              <span className="image-probe-lab__tier-number">03</span>
              <h3>真实生成探针</h3>
              <p>正式执行可能计费、排队或占用显存，必须逐次确认。</p>
              <button
                type="button"
                disabled={localValidation.status !== 'passed' || running || generationRehearsalStatus === 'running'}
                onClick={() => setGenerationConfirmationOpen(true)}
              >
                预览真实生成测试
              </button>
              <small>当前 P0-G 只演练确认、阶段进度和清理；不会调用供应商。</small>
            </article>
          </section>

          <div className="image-probe-lab__actions" aria-label="元数据诊断控制">
            <button
              type="button"
              disabled={!running}
              onClick={() => controllerRef.current?.abort(new DOMException('Cancelled', 'AbortError'))}
            >
              取消元数据诊断
            </button>
            <button type="button" disabled={running || !report} onClick={() => setReport(null)}>
              清除元数据结果
            </button>
          </div>
        </section>

        <aside className="image-probe-lab__environment" aria-labelledby="image-probe-environment-title">
          <p className="image-probe-lab__eyebrow">当前浏览器</p>
          <h2 id="image-probe-environment-title">执行环境</h2>
          <dl>
            <div><dt>页面协议</dt><dd>{window.location.protocol}</dd></div>
            <div><dt>安全上下文</dt><dd>{window.isSecureContext ? '是' : '否'}</dd></div>
            <div><dt>页面来源</dt><dd>{window.location.origin}</dd></div>
          </dl>
          <p>本地开发环境只能验收交互与协议夹具；最终 Pages HTTPS 结果必须在测试部署上另行留证。</p>
        </aside>
      </div>

      {report && <BoundaryResult report={report} />}

      {generationRehearsalStatus !== 'idle' ? (
        <section className="image-probe-lab__results image-probe-lab__generation" aria-labelledby="generation-rehearsal-title">
          <div className="image-probe-lab__section-heading">
            <div>
              <p className="image-probe-lab__eyebrow">P0-G · UI REHEARSAL</p>
              <h2 id="generation-rehearsal-title">真实生成测试阶段</h2>
            </div>
            <span>不会调用供应商</span>
          </div>

          <ol className="image-probe-lab__generation-stages">
            {IMAGE_PROBE_STAGES.map((stage) => {
              const stageStatus = completedGenerationStages.includes(stage)
                ? 'completed'
                : activeGenerationStage === stage
                  ? 'active'
                  : 'pending';
              return (
                <li key={stage} data-status={stageStatus}>
                  <span aria-hidden="true" />
                  <strong>{GENERATION_STAGE_LABELS[stage]}</strong>
                  <small>{stageStatus === 'completed' ? '已演练' : stageStatus === 'active' ? '演练中' : '等待'}</small>
                </li>
              );
            })}
          </ol>

          {generationRehearsalStatus === 'completed' ? (
            <div className="image-probe-lab__artifact-placeholder" role="status">
              <div aria-hidden="true">TEST IMAGE</div>
              <p>
                七阶段界面演练完成。这里是测试图预留位；没有生成图片、没有写入 ImageProbeStore，也没有产生
                <code> real-passed</code>。
              </p>
            </div>
          ) : null}
          {generationRehearsalStatus === 'cancelled' ? (
            <p className="image-probe-lab__summary" role="status">界面演练已停止；没有留下测试图片或供应商任务。</p>
          ) : null}

          <div className="image-probe-lab__actions">
            <button
              type="button"
              disabled={generationRehearsalStatus !== 'running'}
              onClick={() => generationControllerRef.current?.abort(new DOMException('玩家停止界面演练。', 'AbortError'))}
            >
              停止演练
            </button>
            <button type="button" onClick={clearGenerationRehearsal}>清理演练结果</button>
          </div>
        </section>
      ) : null}

      {generationConfirmationOpen ? (
        <div className="image-probe-lab__confirm-backdrop" role="presentation">
          <section
            className="image-probe-lab__confirm"
            role="dialog"
            aria-modal="true"
            aria-label="生成测试费用确认"
          >
            <p className="image-probe-lab__eyebrow">EXPLICIT CONFIRMATION</p>
            <h2>真实生成测试可能产生费用</h2>
            <p>正式接线后，这一步可能消耗云端额度、进入远端队列，或占用玩家本地显存与时间。</p>
            <ul>
              <li>每次执行前都必须由玩家主动确认。</li>
              <li>测试图只进入独立 ImageProbeStore，不进入正式图册。</li>
              <li>当前按钮只演练 UI，不会发送网络请求或产生费用。</li>
            </ul>
            <div className="image-probe-lab__actions">
              <button type="button" onClick={() => setGenerationConfirmationOpen(false)}>取消</button>
              <button type="button" className="image-probe-lab__primary" onClick={() => void runGenerationRehearsal()}>
                确认并演练界面（不调用供应商）
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

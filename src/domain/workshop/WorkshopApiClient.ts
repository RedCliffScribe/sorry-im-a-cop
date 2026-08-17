import {
  workshopPublicDetailResponseV1Schema,
  workshopPublicErrorResponseV1Schema,
  workshopPublicListResponseV1Schema,
  workshopLoginStartResponseV1Schema,
  workshopLogoutResponseV1Schema,
  workshopMemberListResponseV1Schema,
  workshopMutationResultV1Schema,
  workshopPublishResultV1Schema,
  workshopSessionResponseV1Schema,
  workshopAdminItemsResponseV1Schema,
  workshopAdminUsersResponseV1Schema,
  workshopAdminAuditResponseV1Schema,
  workshopAdminMutationResultV1Schema,
  type WorkshopMemberItemV1,
  type WorkshopAdminItemV1,
  type WorkshopAdminUserV1,
  type WorkshopAdminAuditEntryV1
} from './workshopPackageContract';
import {
  loadImageGenerationWorkshopPackage,
  type LoadedWorkshopPackage
} from './imageGenerationPresetPortability';
import type { WorkshopImportSourceMetadata } from './types';

export type WorkshopPublicContentRating = 'general' | 'mature';

export interface WorkshopPublicCompatibility {
  providerTypes: string[];
  purposes: string[];
  modelHints: string[];
  requiredFeatures: string[];
  minAppVersion: string;
}

export interface WorkshopPublicItem {
  itemId: string;
  kind: 'image-generation-preset';
  slug: string | null;
  title: string;
  summary: string;
  language: string;
  contentRating: WorkshopPublicContentRating;
  tags: string[];
  author: { authorId: string; displayName: string; avatarRef: string | null };
  downloadCount: number;
  latestRevision: {
    revisionId: string;
    revisionNumber: number;
    schemaVersion: number;
    packageSha256: string;
    byteSize: number;
    compatibility: WorkshopPublicCompatibility;
    changelog: string;
    createdAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WorkshopListQuery {
  provider?: string;
  purpose?: string;
  rating?: WorkshopPublicContentRating;
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface WorkshopListResult {
  items: WorkshopPublicItem[];
  nextCursor: string | null;
  requestId?: string;
}

export interface DownloadedWorkshopPackage {
  loadedPackage: LoadedWorkshopPackage;
  sourceMetadata: Required<Pick<WorkshopImportSourceMetadata, 'itemId' | 'revisionId' | 'authorDisplayName'>>;
}

export class WorkshopApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'WorkshopApiError';
  }
}

export interface WorkshopApiClientLike {
  listItems(query?: WorkshopListQuery): Promise<WorkshopListResult>;
  getItem(itemId: string): Promise<WorkshopPublicItem>;
  downloadItem(item: WorkshopPublicItem): Promise<DownloadedWorkshopPackage>;
}

export type WorkshopSession =
  | { authenticated: false }
  | {
    authenticated: true;
    user: { userId: string; displayName: string; avatarRef: string | null; role: 'member' | 'admin' };
  };

export interface WorkshopPublishResult {
  itemId: string;
  revisionId: string;
  revisionNumber: number;
  status: 'published' | 'unlisted' | 'disabled' | 'deleted';
  packageSha256: string;
}

export interface WorkshopMemberApiClientLike {
  getSession(): Promise<WorkshopSession>;
  startDiscordLogin(turnstileToken: string, returnTo?: string): Promise<string>;
  logout(): Promise<void>;
  listMyItems(): Promise<WorkshopMemberItemV1[]>;
  createItem(
    loadedPackage: LoadedWorkshopPackage,
    input: { changelog: string; rightsConfirmed: true; turnstileToken: string; idempotencyKey: string }
  ): Promise<WorkshopPublishResult>;
  createRevision(
    itemId: string,
    loadedPackage: LoadedWorkshopPackage,
    input: { changelog: string; rightsConfirmed: true; turnstileToken: string; idempotencyKey: string }
  ): Promise<WorkshopPublishResult>;
  updateItem(itemId: string, input: {
    title: string;
    summary: string;
    language: string;
    contentRating: 'general' | 'mature';
    tags: string[];
  }): Promise<void>;
  publishItem(itemId: string): Promise<void>;
  unpublishItem(itemId: string): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
}

export interface WorkshopAdminApiClientLike {
  listAdminItems(): Promise<WorkshopAdminItemV1[]>;
  listAdminUsers(): Promise<WorkshopAdminUserV1[]>;
  listAdminAudit(): Promise<WorkshopAdminAuditEntryV1[]>;
  disableAdminItem(itemId: string, reason: string): Promise<void>;
  restoreAdminItem(itemId: string, reason: string): Promise<void>;
  suspendAdminUser(userId: string, reason: string): Promise<void>;
  restoreAdminUser(userId: string, reason: string): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${name}=`;
  return document.cookie.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(prefix))?.slice(prefix.length);
}

export class WorkshopApiClient implements WorkshopApiClientLike, WorkshopMemberApiClientLike, WorkshopAdminApiClientLike {
  private readonly fetcher: typeof fetch;

  constructor(
    fetcher: typeof fetch | undefined = undefined,
    private readonly basePath = '/api/workshop',
    private readonly authBasePath = '/api/auth',
    private readonly adminBasePath = '/api/admin/workshop'
  ) {
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis);
  }

  private async adminRequest(path: string, init: RequestInit = {}): Promise<unknown> {
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    if (method !== 'GET' && method !== 'HEAD') {
      const csrf = readCookie('sicv2_workshop_csrf');
      if (csrf) headers.set('x-workshop-csrf', csrf);
    }
    let response: Response;
    try {
      response = await this.fetcher(`${this.adminBasePath}${path}`, {
        ...init,
        headers,
        credentials: 'include'
      });
    } catch (error) {
      throw new WorkshopApiError(`无法连接创意工坊管理服务：${errorMessage(error)}`, 'network_failed');
    }
    return this.parseJsonResponse(response);
  }

  private async parseJsonResponse(response: Response): Promise<unknown> {
    let payload: unknown;
    try { payload = await response.json(); } catch {
      throw new WorkshopApiError('创意工坊返回了无法识别的数据。', 'invalid_response', undefined, response.status);
    }
    if (!response.ok) {
      const parsedError = workshopPublicErrorResponseV1Schema.safeParse(payload);
      throw new WorkshopApiError(
        parsedError.success ? parsedError.data.message : '创意工坊暂时不可用。',
        parsedError.success ? parsedError.data.code : 'invalid_response',
        parsedError.success ? parsedError.data.requestId : undefined,
        response.status
      );
    }
    return payload;
  }

  private async memberRequest(path: string, init: RequestInit = {}, authPath = false): Promise<unknown> {
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    if (method !== 'GET' && method !== 'HEAD') {
      const csrf = readCookie('sicv2_workshop_csrf');
      if (csrf) headers.set('x-workshop-csrf', csrf);
    }
    let response: Response;
    try {
      response = await this.fetcher(`${authPath ? this.authBasePath : this.basePath}${path}`, {
        ...init,
        headers,
        credentials: 'include'
      });
    } catch (error) {
      throw new WorkshopApiError(`无法连接创意工坊：${errorMessage(error)}`, 'network_failed');
    }
    return this.parseJsonResponse(response);
  }

  private async jsonRequest(path: string): Promise<{ payload: unknown; requestId?: string }> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.basePath}${path}`, {
        method: 'GET',
        headers: { accept: 'application/json' }
      });
    } catch (error) {
      throw new WorkshopApiError(`无法连接创意工坊：${errorMessage(error)}`, 'network_failed');
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new WorkshopApiError('创意工坊返回了无法识别的数据。', 'invalid_response', undefined, response.status);
    }
    if (!response.ok) {
      const parsedError = workshopPublicErrorResponseV1Schema.safeParse(payload);
      throw new WorkshopApiError(
        parsedError.success ? parsedError.data.message : '创意工坊暂时不可用。',
        parsedError.success ? parsedError.data.code : 'invalid_response',
        parsedError.success ? parsedError.data.requestId : undefined,
        response.status
      );
    }
    return { payload, requestId: response.headers.get('x-request-id') ?? undefined };
  }

  async listItems(query: WorkshopListQuery = {}): Promise<WorkshopListResult> {
    const search = new URLSearchParams({
      kind: 'image-generation-preset',
      rating: query.rating ?? 'general',
      limit: String(query.limit ?? 20)
    });
    if (query.provider) search.set('provider', query.provider);
    if (query.purpose) search.set('purpose', query.purpose);
    if (query.q?.trim()) search.set('q', query.q.trim());
    if (query.cursor) search.set('cursor', query.cursor);
    const response = await this.jsonRequest(`/items?${search.toString()}`);
    const parsed = workshopPublicListResponseV1Schema.safeParse(response.payload);
    if (!parsed.success) throw new WorkshopApiError('工坊列表格式无效。', 'invalid_response');
    return {
      items: parsed.data.items as WorkshopPublicItem[],
      nextCursor: parsed.data.nextCursor,
      requestId: response.requestId
    };
  }

  async getItem(itemId: string): Promise<WorkshopPublicItem> {
    const response = await this.jsonRequest(`/items/${encodeURIComponent(itemId)}`);
    const parsed = workshopPublicDetailResponseV1Schema.safeParse(response.payload);
    if (!parsed.success) throw new WorkshopApiError('工坊详情格式无效。', 'invalid_response');
    return parsed.data.item as WorkshopPublicItem;
  }

  async downloadItem(item: WorkshopPublicItem): Promise<DownloadedWorkshopPackage> {
    const revision = item.latestRevision;
    let response: Response;
    try {
      response = await this.fetcher(
        `${this.basePath}/items/${encodeURIComponent(item.itemId)}/download?revision=${encodeURIComponent(revision.revisionId)}`,
        { method: 'GET', headers: { accept: 'application/json' } }
      );
    } catch (error) {
      throw new WorkshopApiError(`下载分享包失败：${errorMessage(error)}`, 'network_failed');
    }
    if (!response.ok) {
      let payload: unknown;
      try { payload = await response.json(); } catch { payload = null; }
      const parsedError = workshopPublicErrorResponseV1Schema.safeParse(payload);
      throw new WorkshopApiError(
        parsedError.success ? parsedError.data.message : '分享包下载失败。',
        parsedError.success ? parsedError.data.code : 'download_failed',
        parsedError.success ? parsedError.data.requestId : undefined,
        response.status
      );
    }
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      throw new WorkshopApiError('下载内容不是 JSON 分享包。', 'invalid_content_type', undefined, response.status);
    }
    const rawJson = await response.text();
    const loadedPackage = await loadImageGenerationWorkshopPackage(rawJson);
    const responseSha = response.headers.get('x-workshop-package-sha256');
    if (
      loadedPackage.packageSha256 !== revision.packageSha256
      || (responseSha !== null && responseSha !== revision.packageSha256)
      || loadedPackage.byteLength > 262144
    ) {
      throw new WorkshopApiError('下载分享包的完整性校验失败。', 'integrity_failed');
    }
    return {
      loadedPackage,
      sourceMetadata: {
        itemId: item.itemId,
        revisionId: revision.revisionId,
        authorDisplayName: item.author.displayName
      }
    };
  }

  async getSession(): Promise<WorkshopSession> {
    const payload = await this.memberRequest('/session', {}, true);
    const parsed = workshopSessionResponseV1Schema.safeParse(payload);
    if (!parsed.success) throw new WorkshopApiError('登录状态格式无效。', 'invalid_response');
    return parsed.data as WorkshopSession;
  }

  async startDiscordLogin(turnstileToken: string, returnTo = '/workshop?tab=mine'): Promise<string> {
    const payload = await this.memberRequest('/discord/start', {
      method: 'POST',
      body: JSON.stringify({ turnstileToken, returnTo })
    }, true);
    const parsed = workshopLoginStartResponseV1Schema.safeParse(payload);
    if (!parsed.success) throw new WorkshopApiError('Discord 登录地址格式无效。', 'invalid_response');
    return parsed.data.authorizationUrl;
  }

  async logout(): Promise<void> {
    const payload = await this.memberRequest('/logout', { method: 'POST', body: '{}' }, true);
    if (!workshopLogoutResponseV1Schema.safeParse(payload).success) {
      throw new WorkshopApiError('退出登录响应格式无效。', 'invalid_response');
    }
  }

  async listMyItems(): Promise<WorkshopMemberItemV1[]> {
    const payload = await this.memberRequest('/me/items');
    const parsed = workshopMemberListResponseV1Schema.safeParse(payload);
    if (!parsed.success) throw new WorkshopApiError('我的上传列表格式无效。', 'invalid_response');
    return parsed.data.items;
  }

  private async publishPackage(
    path: string,
    loadedPackage: LoadedWorkshopPackage,
    input: { changelog: string; rightsConfirmed: true; turnstileToken: string; idempotencyKey: string }
  ): Promise<WorkshopPublishResult> {
    const payload = await this.memberRequest(path, {
      method: 'POST',
      headers: { 'idempotency-key': input.idempotencyKey },
      body: JSON.stringify({
        package: loadedPackage.workshopPackage,
        revision: { changelog: input.changelog },
        rightsConfirmed: input.rightsConfirmed,
        turnstileToken: input.turnstileToken
      })
    });
    const parsed = workshopPublishResultV1Schema.safeParse(payload);
    if (!parsed.success) throw new WorkshopApiError('发布响应格式无效。', 'invalid_response');
    return parsed.data as WorkshopPublishResult;
  }

  createItem(
    loadedPackage: LoadedWorkshopPackage,
    input: { changelog: string; rightsConfirmed: true; turnstileToken: string; idempotencyKey: string }
  ): Promise<WorkshopPublishResult> {
    return this.publishPackage('/items', loadedPackage, input);
  }

  createRevision(
    itemId: string,
    loadedPackage: LoadedWorkshopPackage,
    input: { changelog: string; rightsConfirmed: true; turnstileToken: string; idempotencyKey: string }
  ): Promise<WorkshopPublishResult> {
    return this.publishPackage(`/items/${encodeURIComponent(itemId)}/revisions`, loadedPackage, input);
  }

  async updateItem(itemId: string, input: {
    title: string;
    summary: string;
    language: string;
    contentRating: 'general' | 'mature';
    tags: string[];
  }): Promise<void> {
    const payload = await this.memberRequest(`/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
    if (!workshopMutationResultV1Schema.safeParse(payload).success) {
      throw new WorkshopApiError('条目更新响应格式无效。', 'invalid_response');
    }
  }

  private async mutateItem(itemId: string, action: 'publish' | 'unpublish' | 'delete'): Promise<void> {
    const path = action === 'delete'
      ? `/items/${encodeURIComponent(itemId)}`
      : `/items/${encodeURIComponent(itemId)}/${action}`;
    const payload = await this.memberRequest(path, {
      method: action === 'delete' ? 'DELETE' : 'POST',
      ...(action === 'delete' ? {} : { body: '{}' })
    });
    if (!workshopMutationResultV1Schema.safeParse(payload).success) {
      throw new WorkshopApiError('条目状态响应格式无效。', 'invalid_response');
    }
  }

  publishItem(itemId: string): Promise<void> { return this.mutateItem(itemId, 'publish'); }
  unpublishItem(itemId: string): Promise<void> { return this.mutateItem(itemId, 'unpublish'); }
  deleteItem(itemId: string): Promise<void> { return this.mutateItem(itemId, 'delete'); }

  async listAdminItems(): Promise<WorkshopAdminItemV1[]> {
    const payload = await this.adminRequest('/items');
    const parsed = workshopAdminItemsResponseV1Schema.safeParse(payload);
    if (!parsed.success) throw new WorkshopApiError('管理员条目列表格式无效。', 'invalid_response');
    return parsed.data.items;
  }

  async listAdminUsers(): Promise<WorkshopAdminUserV1[]> {
    const payload = await this.adminRequest('/users');
    const parsed = workshopAdminUsersResponseV1Schema.safeParse(payload);
    if (!parsed.success) throw new WorkshopApiError('管理员用户列表格式无效。', 'invalid_response');
    return parsed.data.users;
  }

  async listAdminAudit(): Promise<WorkshopAdminAuditEntryV1[]> {
    const payload = await this.adminRequest('/audit');
    const parsed = workshopAdminAuditResponseV1Schema.safeParse(payload);
    if (!parsed.success) throw new WorkshopApiError('管理员审计记录格式无效。', 'invalid_response');
    return parsed.data.actions;
  }

  private async adminMutation(
    targetType: 'items' | 'users',
    targetId: string,
    action: 'disable' | 'restore' | 'suspend',
    reason: string
  ): Promise<void> {
    const payload = await this.adminRequest(
      `/${targetType}/${encodeURIComponent(targetId)}/${action}`,
      {
        method: 'POST',
        body: JSON.stringify({ reason, confirmation: targetId })
      }
    );
    if (!workshopAdminMutationResultV1Schema.safeParse(payload).success) {
      throw new WorkshopApiError('管理员操作响应格式无效。', 'invalid_response');
    }
  }

  disableAdminItem(itemId: string, reason: string): Promise<void> {
    return this.adminMutation('items', itemId, 'disable', reason);
  }

  restoreAdminItem(itemId: string, reason: string): Promise<void> {
    return this.adminMutation('items', itemId, 'restore', reason);
  }

  suspendAdminUser(userId: string, reason: string): Promise<void> {
    return this.adminMutation('users', userId, 'suspend', reason);
  }

  restoreAdminUser(userId: string, reason: string): Promise<void> {
    return this.adminMutation('users', userId, 'restore', reason);
  }
}

import {
  WORKSHOP_PACKAGE_MAX_BYTES,
  calculateImageGenerationPresetPackageSha256V1,
  canonicalizeImageGenerationPresetPackageV1,
  parseImageGenerationPresetPackageJsonV1
} from './packageContract.js';
import {
  getPublicWorkshopDownload,
  getPublicWorkshopItem,
  incrementPublicWorkshopDownloadCount,
  listPublicWorkshopItems,
  parseWorkshopListQuery
} from './publicRepository.js';
import {
  cachedWorkshopJsonResponse,
  createWorkshopRequestId,
  logWorkshopFunctionResult,
  workshopErrorResponse
} from './responses.js';

function bindingError(requestId) {
  return workshopErrorResponse(
    requestId,
    'workshop_not_configured',
    '创意工坊服务尚未完成配置，请稍后再试。',
    503,
    { 'cache-control': 'no-store' }
  );
}

function unavailableError(requestId) {
  return workshopErrorResponse(
    requestId,
    'workshop_temporarily_unavailable',
    '创意工坊暂时不可用，请稍后重试。',
    503,
    { 'cache-control': 'no-store' }
  );
}

function safeItemId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value) ? value : null;
}

export async function handlePublicWorkshopList(context) {
  const requestId = createWorkshopRequestId();
  const startedAt = Date.now();
  if (!context.env.WORKSHOP_DB) return bindingError(requestId);
  let query;
  try {
    query = parseWorkshopListQuery(context.request.url);
  } catch {
    return workshopErrorResponse(requestId, 'invalid_request', '工坊筛选参数无效。', 400, {
      'cache-control': 'no-store'
    });
  }
  try {
    const result = await listPublicWorkshopItems(context.env.WORKSHOP_DB, query);
    const response = await cachedWorkshopJsonResponse(context.request, { ok: true, ...result }, requestId);
    logWorkshopFunctionResult({ requestId, route: 'workshop_items_list', status: response.status, startedAt });
    return response;
  } catch {
    logWorkshopFunctionResult({ requestId, route: 'workshop_items_list', status: 503, startedAt, code: 'unavailable' });
    return unavailableError(requestId);
  }
}

export async function handlePublicWorkshopDetail(context) {
  const requestId = createWorkshopRequestId();
  const startedAt = Date.now();
  if (!context.env.WORKSHOP_DB) return bindingError(requestId);
  const itemId = safeItemId(context.params?.itemId);
  if (!itemId) return workshopErrorResponse(requestId, 'invalid_request', '工坊条目编号无效。', 400);
  try {
    const item = await getPublicWorkshopItem(context.env.WORKSHOP_DB, itemId);
    if (!item) {
      logWorkshopFunctionResult({ requestId, route: 'workshop_item_detail', status: 404, startedAt, itemId });
      return workshopErrorResponse(requestId, 'not_found', '该工坊内容不存在或已下架。', 404, {
        'cache-control': 'no-store'
      });
    }
    const response = await cachedWorkshopJsonResponse(context.request, { ok: true, item }, requestId);
    logWorkshopFunctionResult({ requestId, route: 'workshop_item_detail', status: response.status, startedAt, itemId });
    return response;
  } catch {
    logWorkshopFunctionResult({ requestId, route: 'workshop_item_detail', status: 503, startedAt, code: 'unavailable', itemId });
    return unavailableError(requestId);
  }
}

function safeFileStem(value) {
  const stem = String(value ?? '').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '');
  return stem.slice(0, 80) || 'workshop-preset';
}

function contentDisposition(title, revisionNumber) {
  const fileName = `${safeFileStem(title)}-r${revisionNumber}.json`;
  return `attachment; filename="workshop-preset-r${revisionNumber}.json"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function handlePublicWorkshopDownload(context) {
  const requestId = createWorkshopRequestId();
  const startedAt = Date.now();
  if (!context.env.WORKSHOP_DB || !context.env.WORKSHOP_PACKAGES) return bindingError(requestId);
  const itemId = safeItemId(context.params?.itemId);
  const revisionIdInput = new URL(context.request.url).searchParams.get('revision');
  const revisionId = revisionIdInput === null ? null : safeItemId(revisionIdInput);
  if (!itemId || (revisionIdInput !== null && !revisionId)) {
    return workshopErrorResponse(requestId, 'invalid_request', '工坊下载参数无效。', 400);
  }
  let row;
  try {
    row = await getPublicWorkshopDownload(context.env.WORKSHOP_DB, itemId, revisionId);
  } catch {
    return unavailableError(requestId);
  }
  if (!row) {
    return workshopErrorResponse(requestId, 'not_found', '该工坊内容不存在或已下架。', 404, {
      'cache-control': 'no-store'
    });
  }
  try {
    const object = await context.env.WORKSHOP_PACKAGES.get(row.r2_key);
    if (!object || !('body' in object)) {
      return workshopErrorResponse(requestId, 'workshop_package_unavailable', '分享包文件暂时不可用。', 503, {
        'cache-control': 'no-store'
      });
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength !== Number(row.byte_size) || bytes.byteLength > WORKSHOP_PACKAGE_MAX_BYTES) {
      throw new Error('byte_size_mismatch');
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed = parseImageGenerationPresetPackageJsonV1(text);
    if (!parsed.success) throw new Error('package_contract_failed');
    const sha256 = await calculateImageGenerationPresetPackageSha256V1(parsed.data);
    if (sha256 !== row.package_sha256) throw new Error('sha256_mismatch');
    const canonicalJson = canonicalizeImageGenerationPresetPackageV1(parsed.data);
    const etag = `"${sha256}"`;
    try {
      await incrementPublicWorkshopDownloadCount(context.env.WORKSHOP_DB, row.item_id);
    } catch {
      logWorkshopFunctionResult({
        requestId,
        route: 'workshop_item_download_count',
        status: 503,
        startedAt,
        code: 'download_count_failed',
        itemId,
        revisionId: row.revision_id
      });
    }
    const headers = {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': contentDisposition(row.title, row.revision_number),
      'cache-control': 'no-store',
      etag,
      'x-content-type-options': 'nosniff',
      'x-workshop-item-id': row.item_id,
      'x-workshop-revision-id': row.revision_id,
      'x-workshop-package-sha256': sha256
    };
    const response = new Response(canonicalJson, { status: 200, headers });
    logWorkshopFunctionResult({
      requestId,
      route: 'workshop_item_download',
      status: response.status,
      startedAt,
      itemId,
      revisionId: row.revision_id
    });
    return response;
  } catch {
    logWorkshopFunctionResult({
      requestId,
      route: 'workshop_item_download',
      status: 502,
      startedAt,
      code: 'integrity_failed',
      itemId,
      revisionId: row.revision_id
    });
    return workshopErrorResponse(
      requestId,
      'workshop_package_integrity_failed',
      '分享包完整性校验失败，已停止下载。',
      502,
      { 'cache-control': 'no-store' }
    );
  }
}

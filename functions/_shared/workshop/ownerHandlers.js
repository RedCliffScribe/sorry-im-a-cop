import {
  WORKSHOP_PACKAGE_MAX_BYTES,
  calculateImageGenerationPresetPackageSha256V1,
  canonicalizeImageGenerationPresetPackageV1,
  parseImageGenerationPresetPackageV1,
  scanWorkshopShareableValueV1,
  workshopCreateItemRequestV1Schema,
  workshopCreateRevisionRequestV1Schema,
  workshopUpdateItemRequestV1Schema
} from './packageContract.js';
import { hashWorkshopSecret, readWorkshopSession, requireWorkshopMutation } from './auth.js';
import {
  findWorkshopIdempotency,
  getOwnedWorkshopItem,
  listOwnedWorkshopItems,
  readWorkshopUploadQuota
} from './ownerRepository.js';
import { workshopErrorResponse, workshopJsonResponse } from './responses.js';
import { verifyWorkshopTurnstile } from './turnstile.js';

const DEFAULT_DAILY_LIMIT = 20;
const DEFAULT_PUBLIC_LIMIT = 20;
const DEFAULT_STORAGE_LIMIT = 10 * 1024 * 1024;
const DEFAULT_TOTAL_STORAGE_LIMIT = 4 * 1024 * 1024 * 1024;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function safeItemId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value) ? value : null;
}

function configuredLimit(value, fallback, maximum) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

function uploadEnabled(env) {
  return String(env.WORKSHOP_UPLOAD_ENABLED ?? '').toLowerCase() === 'true';
}

function compatibilitySummary(workshopPackage) {
  return {
    providerTypes: workshopPackage.compatibility.providerTypes,
    purposes: [...new Set(workshopPackage.content.variants.map((variant) => variant.purpose))],
    modelHints: workshopPackage.compatibility.modelHints,
    requiredFeatures: workshopPackage.compatibility.requiredFeatures,
    minAppVersion: workshopPackage.manifest.minAppVersion
  };
}

async function readJsonBody(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > WORKSHOP_PACKAGE_MAX_BYTES + 16 * 1024) {
    throw new Error('request_too_large');
  }
  return JSON.parse(text);
}

function idempotencyKey(request) {
  const value = request.headers.get('idempotency-key');
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{16,100}$/.test(value) ? value : null;
}

async function deterministicId(prefix, value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hash.slice(0, 24)}`;
}

function noStore(payload, status, requestId, extraHeaders = {}) {
  return workshopJsonResponse(payload, status, {
    'cache-control': 'no-store',
    'x-request-id': requestId,
    ...extraHeaders
  });
}

function failure(requestId, code, message, status) {
  return workshopErrorResponse(requestId, code, message, status, { 'cache-control': 'no-store' });
}

function packageFailureMessage(error) {
  return error?.message ? `分享包未通过安全校验：${String(error.message).slice(0, 240)}` : '分享包未通过安全校验。';
}

function ensureQuota(quota, limits, incomingBytes, addsPublicItem) {
  if (quota.dailyRevisions >= limits.daily) return '今天的新建或修订次数已达到上限。';
  if (quota.storedBytes + incomingBytes > limits.storage) return '你的工坊修订存储空间已达到上限。';
  if (quota.totalStoredBytes + incomingBytes > limits.totalStorage) {
    return '创意工坊总存储空间已达到安全上限，暂时停止接收新修订。';
  }
  if (addsPublicItem && quota.publicItems >= limits.publicItems) return '同时公开的工坊条目已达到上限。';
  return null;
}

function limitsOf(env) {
  return {
    daily: configuredLimit(env.WORKSHOP_DAILY_REVISION_LIMIT, DEFAULT_DAILY_LIMIT, 1000),
    publicItems: configuredLimit(env.WORKSHOP_MAX_PUBLIC_ITEMS, DEFAULT_PUBLIC_LIMIT, 1000),
    storage: configuredLimit(env.WORKSHOP_MAX_USER_STORAGE_BYTES, DEFAULT_STORAGE_LIMIT, 1024 * 1024 * 1024),
    totalStorage: configuredLimit(
      env.WORKSHOP_MAX_TOTAL_STORAGE_BYTES,
      DEFAULT_TOTAL_STORAGE_LIMIT,
      DEFAULT_TOTAL_STORAGE_LIMIT
    ),
    packageBytes: configuredLimit(env.WORKSHOP_MAX_PACKAGE_BYTES, WORKSHOP_PACKAGE_MAX_BYTES, WORKSHOP_PACKAGE_MAX_BYTES)
  };
}

async function prepareUpload(context, schema, action, addsPublicItem) {
  const security = await requireWorkshopMutation(context);
  if (security.response) return security;
  if (!uploadEnabled(context.env)) {
    return { response: failure(security.requestId, 'upload_disabled', '创意工坊当前只开放浏览，上传暂未开启。', 503) };
  }
  const key = idempotencyKey(context.request);
  if (!key) {
    return { response: failure(security.requestId, 'idempotency_required', '上传请求缺少有效的防重复标识。', 400) };
  }
  const keyHash = await hashWorkshopSecret(`${action}:${key}`, context.env.WORKSHOP_SESSION_SECRET);
  const now = new Date().toISOString();
  const replay = await findWorkshopIdempotency(
    context.env.WORKSHOP_DB,
    security.session.user.userId,
    action,
    keyHash,
    now
  );
  if (replay) {
    return {
      response: noStore(JSON.parse(replay.response_json), Number(replay.response_status), security.requestId, {
        'x-idempotent-replay': 'true'
      })
    };
  }
  let body;
  try { body = await readJsonBody(context.request); } catch {
    return { response: failure(security.requestId, 'invalid_request', '上传请求不是有效 JSON 或体积过大。', 400) };
  }
  const parsedRequest = schema.safeParse(body);
  if (!parsedRequest.success) {
    return { response: failure(security.requestId, 'invalid_request', '上传资料缺少必要字段或字段格式不正确。', 400) };
  }
  const metadataSafety = scanWorkshopShareableValueV1({ revision: parsedRequest.data.revision });
  if (!metadataSafety.success) {
    return { response: failure(security.requestId, 'package_invalid', '修订说明包含不可公开的敏感内容。', 400) };
  }
  const limits = limitsOf(context.env);
  const parsedPackage = parseImageGenerationPresetPackageV1(parsedRequest.data.package, {
    maximumBytes: limits.packageBytes
  });
  if (!parsedPackage.success) {
    return { response: failure(security.requestId, 'package_invalid', packageFailureMessage(parsedPackage.error), 400) };
  }
  const canonicalJson = canonicalizeImageGenerationPresetPackageV1(parsedPackage.data);
  const byteSize = new TextEncoder().encode(canonicalJson).byteLength;
  const quota = await readWorkshopUploadQuota(context.env.WORKSHOP_DB, security.session.user.userId, now);
  const quotaError = ensureQuota(quota, limits, byteSize, addsPublicItem);
  if (quotaError) return { response: failure(security.requestId, 'quota_exceeded', quotaError, 429) };
  const turnstile = await verifyWorkshopTurnstile(context, parsedRequest.data.turnstileToken, 'workshop_upload');
  if (!turnstile.success) {
    return { response: failure(security.requestId, 'turnstile_failed', '人机验证未通过，请刷新后重试。', 403) };
  }
  return {
    ...security,
    keyHash,
    now,
    data: parsedRequest.data,
    workshopPackage: parsedPackage.data,
    canonicalJson,
    byteSize,
    packageSha256: await calculateImageGenerationPresetPackageSha256V1(parsedPackage.data)
  };
}

async function saveR2Package(context, input) {
  await context.env.WORKSHOP_PACKAGES.put(input.r2Key, input.canonicalJson, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      itemId: input.itemId,
      revisionId: input.revisionId,
      packageSha256: input.packageSha256,
      schemaVersion: String(input.workshopPackage.schemaVersion)
    }
  });
}

export async function handleListMyWorkshopItems(context) {
  const requestId = crypto.randomUUID();
  const session = await readWorkshopSession(context);
  if (!session) return failure(requestId, 'authentication_required', '请先登录创意工坊。', 401);
  try {
    const items = await listOwnedWorkshopItems(context.env.WORKSHOP_DB, session.user.userId);
    return noStore({ ok: true, items }, 200, requestId);
  } catch {
    return failure(requestId, 'workshop_temporarily_unavailable', '暂时无法读取你的上传。', 503);
  }
}

export async function handleCreateWorkshopItem(context) {
  if (!context.env?.WORKSHOP_DB || !context.env?.WORKSHOP_PACKAGES) {
    return failure(crypto.randomUUID(), 'workshop_not_configured', '创意工坊上传存储尚未配置。', 503);
  }
  const prepared = await prepareUpload(context, workshopCreateItemRequestV1Schema, 'create_item', true);
  if (prepared.response) return prepared.response;
  const ownerId = prepared.session.user.userId;
  const itemId = await deterministicId('item', `${ownerId}:create:${prepared.keyHash}`);
  const revisionId = await deterministicId('revision', `${itemId}:1:${prepared.keyHash}`);
  const r2Key = `packages/${prepared.workshopPackage.kind}/${itemId}/1/${prepared.packageSha256}.json`;
  const result = {
    ok: true,
    itemId,
    revisionId,
    revisionNumber: 1,
    status: 'published',
    packageSha256: prepared.packageSha256
  };
  await saveR2Package(context, { ...prepared, itemId, revisionId, r2Key });
  try {
    const manifest = prepared.workshopPackage.manifest;
    const expiresAt = new Date(new Date(prepared.now).getTime() + IDEMPOTENCY_TTL_MS).toISOString();
    await context.env.WORKSHOP_DB.batch([
      context.env.WORKSHOP_DB.prepare(`
        INSERT INTO workshop_items (
          item_id, owner_user_id, kind, slug, title, summary, language,
          content_rating, tags_json, status, latest_revision_id,
          disabled_reason, created_at, updated_at
        ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, 'published', NULL, NULL, ?9, ?9)
      `).bind(
        itemId, ownerId, prepared.workshopPackage.kind, manifest.title, manifest.summary,
        manifest.language, manifest.contentRating, JSON.stringify(manifest.tags), prepared.now
      ),
      context.env.WORKSHOP_DB.prepare(`
        INSERT INTO workshop_revisions (
          revision_id, item_id, revision_number, schema_version, package_sha256,
          r2_key, byte_size, compatibility_json, changelog, created_by_user_id, created_at
        ) VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      `).bind(
        revisionId, itemId, prepared.workshopPackage.schemaVersion, prepared.packageSha256,
        r2Key, prepared.byteSize, JSON.stringify(compatibilitySummary(prepared.workshopPackage)),
        prepared.data.revision.changelog, ownerId, prepared.now
      ),
      context.env.WORKSHOP_DB.prepare(`
        UPDATE workshop_items SET latest_revision_id = ?1 WHERE item_id = ?2
      `).bind(revisionId, itemId),
      context.env.WORKSHOP_DB.prepare(`
        INSERT INTO workshop_idempotency_keys (
          user_id, action, key_hash, response_status, response_json, created_at, expires_at
        ) VALUES (?1, 'create_item', ?2, 201, ?3, ?4, ?5)
      `).bind(ownerId, prepared.keyHash, JSON.stringify(result), prepared.now, expiresAt)
    ]);
  } catch {
    try { await context.env.WORKSHOP_PACKAGES.delete(r2Key); } catch { /* orphan scanner is the fallback */ }
    const replay = await findWorkshopIdempotency(
      context.env.WORKSHOP_DB, ownerId, 'create_item', prepared.keyHash, prepared.now
    ).catch(() => null);
    if (replay) return noStore(JSON.parse(replay.response_json), Number(replay.response_status), prepared.requestId, {
      'x-idempotent-replay': 'true'
    });
    return failure(prepared.requestId, 'conflict', '上传未能完成，未发布任何条目，请重试。', 409);
  }
  return noStore(result, 201, prepared.requestId);
}

export async function handleCreateWorkshopRevision(context) {
  if (!context.env?.WORKSHOP_DB || !context.env?.WORKSHOP_PACKAGES) {
    return failure(crypto.randomUUID(), 'workshop_not_configured', '创意工坊上传存储尚未配置。', 503);
  }
  const itemId = safeItemId(context.params?.itemId);
  if (!itemId) return failure(crypto.randomUUID(), 'invalid_request', '工坊条目编号无效。', 400);
  const prepared = await prepareUpload(context, workshopCreateRevisionRequestV1Schema, 'create_revision', false);
  if (prepared.response) return prepared.response;
  const ownerId = prepared.session.user.userId;
  const item = await getOwnedWorkshopItem(context.env.WORKSHOP_DB, ownerId, itemId);
  if (!item) return failure(prepared.requestId, 'ownership_required', '该条目不存在或不属于当前用户。', 404);
  if (item.status === 'disabled' || item.status === 'deleted') {
    return failure(prepared.requestId, 'item_locked', '该条目当前不能发布新修订。', 409);
  }
  const last = await context.env.WORKSHOP_DB.prepare(`
    SELECT COALESCE(MAX(revision_number), 0) AS revision_number
    FROM workshop_revisions WHERE item_id = ?1
  `).bind(itemId).first();
  const revisionNumber = Number(last?.revision_number ?? 0) + 1;
  const revisionId = await deterministicId('revision', `${itemId}:${prepared.keyHash}`);
  const r2Key = `packages/${prepared.workshopPackage.kind}/${itemId}/${revisionNumber}/${prepared.packageSha256}.json`;
  const result = {
    ok: true,
    itemId,
    revisionId,
    revisionNumber,
    status: item.status,
    packageSha256: prepared.packageSha256
  };
  await saveR2Package(context, { ...prepared, itemId, revisionId, r2Key });
  try {
    const manifest = prepared.workshopPackage.manifest;
    const expiresAt = new Date(new Date(prepared.now).getTime() + IDEMPOTENCY_TTL_MS).toISOString();
    await context.env.WORKSHOP_DB.batch([
      context.env.WORKSHOP_DB.prepare(`
        INSERT INTO workshop_revisions (
          revision_id, item_id, revision_number, schema_version, package_sha256,
          r2_key, byte_size, compatibility_json, changelog, created_by_user_id, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
      `).bind(
        revisionId, itemId, revisionNumber, prepared.workshopPackage.schemaVersion,
        prepared.packageSha256, r2Key, prepared.byteSize,
        JSON.stringify(compatibilitySummary(prepared.workshopPackage)),
        prepared.data.revision.changelog, ownerId, prepared.now
      ),
      context.env.WORKSHOP_DB.prepare(`
        UPDATE workshop_items
        SET latest_revision_id = ?1, title = ?2, summary = ?3, language = ?4,
          content_rating = ?5, tags_json = ?6, updated_at = ?7
        WHERE item_id = ?8 AND owner_user_id = ?9
      `).bind(
        revisionId, manifest.title, manifest.summary, manifest.language,
        manifest.contentRating, JSON.stringify(manifest.tags), prepared.now, itemId, ownerId
      ),
      context.env.WORKSHOP_DB.prepare(`
        INSERT INTO workshop_idempotency_keys (
          user_id, action, key_hash, response_status, response_json, created_at, expires_at
        ) VALUES (?1, 'create_revision', ?2, 201, ?3, ?4, ?5)
      `).bind(ownerId, prepared.keyHash, JSON.stringify(result), prepared.now, expiresAt)
    ]);
  } catch {
    try { await context.env.WORKSHOP_PACKAGES.delete(r2Key); } catch { /* orphan scanner is the fallback */ }
    const replay = await findWorkshopIdempotency(
      context.env.WORKSHOP_DB, ownerId, 'create_revision', prepared.keyHash, prepared.now
    ).catch(() => null);
    if (replay) return noStore(JSON.parse(replay.response_json), Number(replay.response_status), prepared.requestId, {
      'x-idempotent-replay': 'true'
    });
    return failure(prepared.requestId, 'conflict', '新修订未能发布，请刷新条目后重试。', 409);
  }
  return noStore(result, 201, prepared.requestId);
}

export async function handleUpdateWorkshopItem(context) {
  const security = await requireWorkshopMutation(context);
  if (security.response) return security.response;
  const itemId = safeItemId(context.params?.itemId);
  if (!itemId) return failure(security.requestId, 'invalid_request', '工坊条目编号无效。', 400);
  let body;
  try { body = await readJsonBody(context.request); } catch {
    return failure(security.requestId, 'invalid_request', '条目资料不是有效 JSON。', 400);
  }
  const parsed = workshopUpdateItemRequestV1Schema.safeParse(body);
  if (!parsed.success) return failure(security.requestId, 'invalid_request', '条目资料格式不正确。', 400);
  const metadataSafety = scanWorkshopShareableValueV1(parsed.data);
  if (!metadataSafety.success) {
    return failure(security.requestId, 'package_invalid', '条目资料包含不可公开的敏感内容。', 400);
  }
  const item = await getOwnedWorkshopItem(context.env.WORKSHOP_DB, security.session.user.userId, itemId);
  if (!item) return failure(security.requestId, 'ownership_required', '该条目不存在或不属于当前用户。', 404);
  if (item.status === 'disabled' || item.status === 'deleted') {
    return failure(security.requestId, 'item_locked', '该条目当前不能编辑。', 409);
  }
  const now = new Date().toISOString();
  await context.env.WORKSHOP_DB.prepare(`
    UPDATE workshop_items
    SET title = ?1, summary = ?2, language = ?3, content_rating = ?4,
      tags_json = ?5, updated_at = ?6
    WHERE item_id = ?7 AND owner_user_id = ?8
  `).bind(
    parsed.data.title, parsed.data.summary, parsed.data.language,
    parsed.data.contentRating, JSON.stringify(parsed.data.tags), now,
    itemId, security.session.user.userId
  ).run();
  return noStore({ ok: true, itemId, status: item.status }, 200, security.requestId);
}

async function handleStatusMutation(context, action) {
  const security = await requireWorkshopMutation(context);
  if (security.response) return security.response;
  const itemId = safeItemId(context.params?.itemId);
  if (!itemId) return failure(security.requestId, 'invalid_request', '工坊条目编号无效。', 400);
  const ownerId = security.session.user.userId;
  const item = await getOwnedWorkshopItem(context.env.WORKSHOP_DB, ownerId, itemId);
  if (!item) return failure(security.requestId, 'ownership_required', '该条目不存在或不属于当前用户。', 404);
  if (item.status === 'disabled') return failure(security.requestId, 'item_locked', '该条目已被管理员停用。', 409);
  if (item.status === 'deleted') return failure(security.requestId, 'item_locked', '该条目已经删除。', 409);
  const nextStatus = action === 'publish' ? 'published' : action === 'unpublish' ? 'unlisted' : 'deleted';
  if (action === 'publish' && item.status !== 'published') {
    const quota = await readWorkshopUploadQuota(context.env.WORKSHOP_DB, ownerId, new Date().toISOString());
    if (quota.publicItems >= limitsOf(context.env).publicItems) {
      return failure(security.requestId, 'quota_exceeded', '同时公开的工坊条目已达到上限。', 429);
    }
  }
  await context.env.WORKSHOP_DB.prepare(`
    UPDATE workshop_items SET status = ?1, updated_at = ?2
    WHERE item_id = ?3 AND owner_user_id = ?4
  `).bind(nextStatus, new Date().toISOString(), itemId, ownerId).run();
  return noStore({ ok: true, itemId, status: nextStatus }, 200, security.requestId);
}

export const handlePublishWorkshopItem = (context) => handleStatusMutation(context, 'publish');
export const handleUnpublishWorkshopItem = (context) => handleStatusMutation(context, 'unpublish');
export const handleDeleteWorkshopItem = (context) => handleStatusMutation(context, 'delete');

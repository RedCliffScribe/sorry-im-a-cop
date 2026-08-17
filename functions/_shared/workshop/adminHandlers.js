import {
  scanWorkshopShareableValueV1,
  workshopAdminReasonRequestV1Schema
} from './packageContract.js';
import {
  requireWorkshopAdminMutation,
  requireWorkshopAdminRead
} from './auth.js';
import {
  getWorkshopAdminItem,
  getWorkshopAdminUser,
  listWorkshopAdminAudit,
  listWorkshopAdminItems,
  listWorkshopAdminUsers
} from './adminRepository.js';
import {
  createWorkshopRequestId,
  logWorkshopFunctionResult,
  workshopErrorResponse,
  workshopJsonResponse
} from './responses.js';

function noStore(payload, status, requestId) {
  return workshopJsonResponse(payload, status, {
    'cache-control': 'no-store',
    'x-request-id': requestId
  });
}

function failure(requestId, code, message, status) {
  return workshopErrorResponse(requestId, code, message, status, {
    'cache-control': 'no-store',
    'x-request-id': requestId
  });
}

function safeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value)
    ? value
    : null;
}

async function readReasonRequest(context, targetId) {
  let raw;
  try {
    const text = await context.request.text();
    if (new globalThis.TextEncoder().encode(text).byteLength > 4096) throw new Error('body_too_large');
    raw = JSON.parse(text);
  } catch {
    return { error: '管理员操作资料不是有效 JSON。' };
  }
  const parsed = workshopAdminReasonRequestV1Schema.safeParse(raw);
  if (!parsed.success || parsed.data.confirmation !== targetId) {
    return { error: '请填写原因并再次确认目标编号。' };
  }
  const safety = scanWorkshopShareableValueV1({ reason: parsed.data.reason });
  if (!safety.success) return { error: '管理原因疑似包含凭据或其他敏感信息，请移除后重试。' };
  return { data: parsed.data };
}

function actionId() {
  return `admin_action_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;
}

function auditStatement(database, input) {
  return database.prepare(`
    INSERT INTO workshop_admin_actions (
      action_id, actor_user_id, action, target_type, target_id, reason,
      before_summary_json, after_summary_json, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  `).bind(
    input.actionId,
    input.actorUserId,
    input.action,
    input.targetType,
    input.targetId,
    input.reason,
    JSON.stringify(input.beforeSummary),
    JSON.stringify(input.afterSummary),
    input.now
  );
}

async function handleAdminList(context, kind) {
  const startedAt = Date.now();
  if (!context.env?.WORKSHOP_DB) {
    return failure(createWorkshopRequestId(), 'workshop_not_configured', '创意工坊数据库尚未配置。', 503);
  }
  const security = await requireWorkshopAdminRead(context);
  if (security.response) return security.response;
  try {
    const values = kind === 'items'
      ? await listWorkshopAdminItems(context.env.WORKSHOP_DB)
      : kind === 'users'
        ? await listWorkshopAdminUsers(context.env.WORKSHOP_DB)
        : await listWorkshopAdminAudit(context.env.WORKSHOP_DB);
    const payload = kind === 'items'
      ? { ok: true, items: values }
      : kind === 'users'
        ? { ok: true, users: values }
        : { ok: true, actions: values };
    const response = noStore(payload, 200, security.requestId);
    logWorkshopFunctionResult({
      requestId: security.requestId,
      route: `workshop_admin_${kind}`,
      status: 200,
      startedAt
    });
    return response;
  } catch {
    logWorkshopFunctionResult({
      requestId: security.requestId,
      route: `workshop_admin_${kind}`,
      status: 503,
      startedAt,
      code: 'unavailable'
    });
    return failure(security.requestId, 'workshop_temporarily_unavailable', '暂时无法读取创意工坊管理资料。', 503);
  }
}

export const handleListWorkshopAdminItems = (context) => handleAdminList(context, 'items');
export const handleListWorkshopAdminUsers = (context) => handleAdminList(context, 'users');
export const handleListWorkshopAdminAudit = (context) => handleAdminList(context, 'audit');

async function handleItemModeration(context, action) {
  if (!context.env?.WORKSHOP_DB) {
    return failure(createWorkshopRequestId(), 'workshop_not_configured', '创意工坊数据库尚未配置。', 503);
  }
  const security = await requireWorkshopAdminMutation(context);
  if (security.response) return security.response;
  const itemId = safeId(context.params?.itemId);
  if (!itemId) return failure(security.requestId, 'invalid_request', '工坊条目编号无效。', 400);
  const reasonRequest = await readReasonRequest(context, itemId);
  if (!reasonRequest.data) return failure(security.requestId, 'invalid_request', reasonRequest.error, 400);

  let item;
  try { item = await getWorkshopAdminItem(context.env.WORKSHOP_DB, itemId); } catch {
    return failure(security.requestId, 'workshop_temporarily_unavailable', '暂时无法读取目标条目。', 503);
  }
  if (!item) return failure(security.requestId, 'not_found', '目标条目不存在。', 404);

  let nextStatus;
  if (action === 'disable') {
    if (item.status === 'deleted') return failure(security.requestId, 'item_locked', '已删除条目不能执行管理员停用。', 409);
    if (item.status === 'disabled') return failure(security.requestId, 'already_applied', '该条目已经处于管理员停用状态。', 409);
    nextStatus = 'disabled';
  } else {
    if (item.status !== 'disabled') return failure(security.requestId, 'invalid_state', '只有管理员停用的条目可以恢复。', 409);
    nextStatus = item.owner_status === 'active'
      ? (item.admin_disabled_previous_status ?? 'unlisted')
      : 'unlisted';
  }

  const now = new Date().toISOString();
  const nextActionId = actionId();
  const beforeSummary = {
    status: item.status,
    disabledReason: item.disabled_reason ?? null,
    previousStatus: item.admin_disabled_previous_status ?? null,
    ownerStatus: item.owner_status
  };
  const afterSummary = action === 'disable'
    ? { status: 'disabled', disabledReason: reasonRequest.data.reason, previousStatus: item.status, ownerStatus: item.owner_status }
    : { status: nextStatus, disabledReason: null, previousStatus: null, ownerStatus: item.owner_status };
  try {
    const update = action === 'disable'
      ? context.env.WORKSHOP_DB.prepare(`
          UPDATE workshop_items
          SET status = 'disabled', disabled_reason = ?1,
            admin_disabled_previous_status = ?2, updated_at = ?3
          WHERE item_id = ?4 AND status IN ('published', 'unlisted')
        `).bind(reasonRequest.data.reason, item.status, now, itemId)
      : context.env.WORKSHOP_DB.prepare(`
          UPDATE workshop_items
          SET status = ?1, disabled_reason = NULL,
            admin_disabled_previous_status = NULL, updated_at = ?2
          WHERE item_id = ?3 AND status = 'disabled'
        `).bind(nextStatus, now, itemId);
    await context.env.WORKSHOP_DB.batch([
      update,
      auditStatement(context.env.WORKSHOP_DB, {
        actionId: nextActionId,
        actorUserId: security.session.user.userId,
        action: action === 'disable' ? 'item_disabled' : 'item_restored',
        targetType: 'item',
        targetId: itemId,
        reason: reasonRequest.data.reason,
        beforeSummary,
        afterSummary,
        now
      })
    ]);
  } catch {
    return failure(security.requestId, 'workshop_temporarily_unavailable', '管理员条目操作没有完成，请重试。', 503);
  }
  return noStore({
    ok: true,
    actionId: nextActionId,
    targetType: 'item',
    targetId: itemId,
    status: nextStatus
  }, 200, security.requestId);
}

async function handleUserModeration(context, action) {
  if (!context.env?.WORKSHOP_DB) {
    return failure(createWorkshopRequestId(), 'workshop_not_configured', '创意工坊数据库尚未配置。', 503);
  }
  const security = await requireWorkshopAdminMutation(context);
  if (security.response) return security.response;
  const userId = safeId(context.params?.userId);
  if (!userId) return failure(security.requestId, 'invalid_request', '工坊用户编号无效。', 400);
  if (userId === security.session.user.userId && action === 'suspend') {
    return failure(security.requestId, 'role_protected', '管理员不能停用自己的当前账号。', 409);
  }
  const reasonRequest = await readReasonRequest(context, userId);
  if (!reasonRequest.data) return failure(security.requestId, 'invalid_request', reasonRequest.error, 400);

  let user;
  try { user = await getWorkshopAdminUser(context.env.WORKSHOP_DB, userId); } catch {
    return failure(security.requestId, 'workshop_temporarily_unavailable', '暂时无法读取目标用户。', 503);
  }
  if (!user) return failure(security.requestId, 'not_found', '目标用户不存在。', 404);
  if (action === 'suspend' && user.role === 'admin') {
    return failure(security.requestId, 'role_protected', '管理员账号不能通过普通封禁操作停用。', 409);
  }
  const nextStatus = action === 'suspend' ? 'suspended' : 'active';
  if (user.status === nextStatus) {
    return failure(security.requestId, 'already_applied', `该用户已经是${nextStatus === 'active' ? '正常' : '停用'}状态。`, 409);
  }

  const now = new Date().toISOString();
  const nextActionId = actionId();
  const statements = [
    context.env.WORKSHOP_DB.prepare(`
      UPDATE workshop_users SET status = ?1, updated_at = ?2
      WHERE user_id = ?3 AND status = ?4
    `).bind(nextStatus, now, userId, user.status)
  ];
  if (action === 'suspend') {
    statements.push(context.env.WORKSHOP_DB.prepare(`
      UPDATE workshop_sessions SET revoked_at = ?1
      WHERE user_id = ?2 AND revoked_at IS NULL
    `).bind(now, userId));
  }
  statements.push(auditStatement(context.env.WORKSHOP_DB, {
    actionId: nextActionId,
    actorUserId: security.session.user.userId,
    action: action === 'suspend' ? 'user_suspended' : 'user_restored',
    targetType: 'user',
    targetId: userId,
    reason: reasonRequest.data.reason,
    beforeSummary: { status: user.status, role: user.role },
    afterSummary: { status: nextStatus, role: user.role },
    now
  }));
  try { await context.env.WORKSHOP_DB.batch(statements); } catch {
    return failure(security.requestId, 'workshop_temporarily_unavailable', '管理员用户操作没有完成，请重试。', 503);
  }
  return noStore({
    ok: true,
    actionId: nextActionId,
    targetType: 'user',
    targetId: userId,
    status: nextStatus
  }, 200, security.requestId);
}

export const handleDisableWorkshopAdminItem = (context) => handleItemModeration(context, 'disable');
export const handleRestoreWorkshopAdminItem = (context) => handleItemModeration(context, 'restore');
export const handleSuspendWorkshopAdminUser = (context) => handleUserModeration(context, 'suspend');
export const handleRestoreWorkshopAdminUser = (context) => handleUserModeration(context, 'restore');

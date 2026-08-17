import {
  workshopAdminAuditEntryV1Schema,
  workshopAdminItemV1Schema,
  workshopAdminUserV1Schema
} from './packageContract.js';

function parseJson(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseRows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export function mapWorkshopAdminItem(row) {
  return workshopAdminItemV1Schema.parse({
    itemId: row.item_id,
    title: row.title,
    status: row.status,
    disabledReason: row.disabled_reason ?? null,
    previousStatus: row.admin_disabled_previous_status ?? null,
    owner: {
      userId: row.owner_user_id,
      displayName: row.owner_display_name,
      role: row.owner_role,
      status: row.owner_status
    },
    updatedAt: row.updated_at
  });
}

export function mapWorkshopAdminUser(row) {
  return workshopAdminUserV1Schema.parse({
    userId: row.user_id,
    displayName: row.display_name,
    avatarRef: row.avatar_ref ?? null,
    role: row.role,
    status: row.status,
    itemCount: Number(row.item_count ?? 0),
    revisionCount: Number(row.revision_count ?? 0),
    storedBytes: Number(row.stored_bytes ?? 0),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null
  });
}

export function mapWorkshopAdminAuditEntry(row) {
  return workshopAdminAuditEntryV1Schema.parse({
    actionId: row.action_id,
    actor: {
      userId: row.actor_user_id,
      displayName: row.actor_display_name
    },
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    beforeSummary: parseJson(row.before_summary_json),
    afterSummary: parseJson(row.after_summary_json),
    createdAt: row.created_at
  });
}

export async function listWorkshopAdminItems(database) {
  const result = await database.prepare(`
    SELECT i.item_id, i.title, i.status, i.disabled_reason,
      i.admin_disabled_previous_status, i.owner_user_id, i.updated_at,
      u.display_name AS owner_display_name, u.role AS owner_role, u.status AS owner_status
    FROM workshop_items i
    INNER JOIN workshop_users u ON u.user_id = i.owner_user_id
    ORDER BY i.updated_at DESC, i.item_id DESC
    LIMIT 100
  `).all();
  return parseRows(result).map(mapWorkshopAdminItem);
}

export async function listWorkshopAdminUsers(database) {
  const result = await database.prepare(`
    SELECT u.user_id, u.display_name, u.avatar_ref, u.role, u.status,
      u.created_at, u.last_login_at,
      (SELECT COUNT(*) FROM workshop_items i WHERE i.owner_user_id = u.user_id) AS item_count,
      (SELECT COUNT(*) FROM workshop_revisions r WHERE r.created_by_user_id = u.user_id) AS revision_count,
      (SELECT COALESCE(SUM(r.byte_size), 0) FROM workshop_revisions r WHERE r.created_by_user_id = u.user_id) AS stored_bytes
    FROM workshop_users u
    ORDER BY u.updated_at DESC, u.user_id DESC
    LIMIT 100
  `).all();
  return parseRows(result).map(mapWorkshopAdminUser);
}

export async function listWorkshopAdminAudit(database) {
  const result = await database.prepare(`
    SELECT a.action_id, a.actor_user_id, actor.display_name AS actor_display_name,
      a.action, a.target_type, a.target_id, a.reason,
      a.before_summary_json, a.after_summary_json, a.created_at
    FROM workshop_admin_actions a
    INNER JOIN workshop_users actor ON actor.user_id = a.actor_user_id
    ORDER BY a.created_at DESC, a.action_id DESC
    LIMIT 100
  `).all();
  return parseRows(result).map(mapWorkshopAdminAuditEntry);
}

export function getWorkshopAdminItem(database, itemId) {
  return database.prepare(`
    SELECT i.item_id, i.owner_user_id, i.title, i.status, i.disabled_reason,
      i.admin_disabled_previous_status, i.updated_at,
      u.display_name AS owner_display_name, u.role AS owner_role, u.status AS owner_status
    FROM workshop_items i
    INNER JOIN workshop_users u ON u.user_id = i.owner_user_id
    WHERE i.item_id = ?1
    LIMIT 1
  `).bind(itemId).first();
}

export function getWorkshopAdminUser(database, userId) {
  return database.prepare(`
    SELECT user_id, display_name, role, status, created_at, updated_at
    FROM workshop_users
    WHERE user_id = ?1
    LIMIT 1
  `).bind(userId).first();
}

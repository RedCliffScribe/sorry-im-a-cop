import { workshopMemberItemV1Schema } from './packageContract.js';

function parseJson(value, fallback) {
  try { return typeof value === 'string' ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function memberItemSelect() {
  return `
    SELECT i.item_id, i.kind, i.title, i.summary, i.language,
      i.content_rating, i.tags_json, i.status, i.disabled_reason,
      i.created_at AS item_created_at, i.updated_at AS item_updated_at,
      r.revision_id, r.revision_number, r.schema_version, r.package_sha256,
      r.byte_size, r.changelog, r.created_at AS revision_created_at
    FROM workshop_items i
    LEFT JOIN workshop_revisions r ON r.revision_id = i.latest_revision_id
  `;
}

export function mapWorkshopMemberItem(row) {
  const candidate = {
    itemId: row.item_id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    language: row.language,
    contentRating: row.content_rating,
    tags: parseJson(row.tags_json, []),
    status: row.status,
    disabledReason: row.disabled_reason ?? null,
    latestRevision: row.revision_id ? {
      revisionId: row.revision_id,
      revisionNumber: Number(row.revision_number),
      schemaVersion: Number(row.schema_version),
      packageSha256: row.package_sha256,
      byteSize: Number(row.byte_size),
      changelog: row.changelog,
      createdAt: row.revision_created_at
    } : null,
    createdAt: row.item_created_at,
    updatedAt: row.item_updated_at
  };
  const parsed = workshopMemberItemV1Schema.safeParse(candidate);
  if (!parsed.success) throw new Error('invalid_member_item');
  return parsed.data;
}

export async function listOwnedWorkshopItems(database, userId) {
  const result = await database.prepare(`
    ${memberItemSelect()}
    WHERE i.owner_user_id = ?1
    ORDER BY i.updated_at DESC, i.item_id DESC
    LIMIT 100
  `).bind(userId).all();
  return (Array.isArray(result?.results) ? result.results : []).map(mapWorkshopMemberItem);
}

export async function getOwnedWorkshopItem(database, userId, itemId) {
  return database.prepare(`
    SELECT item_id, owner_user_id, kind, title, summary, language,
      content_rating, tags_json, status, disabled_reason,
      latest_revision_id, created_at, updated_at
    FROM workshop_items
    WHERE item_id = ?1 AND owner_user_id = ?2
    LIMIT 1
  `).bind(itemId, userId).first();
}

export async function findWorkshopIdempotency(database, userId, action, keyHash, now) {
  return database.prepare(`
    SELECT response_status, response_json
    FROM workshop_idempotency_keys
    WHERE user_id = ?1 AND action = ?2 AND key_hash = ?3 AND expires_at > ?4
    LIMIT 1
  `).bind(userId, action, keyHash, now).first();
}

export async function readWorkshopUploadQuota(database, userId, now) {
  const dayStart = `${now.slice(0, 10)}T00:00:00.000Z`;
  const [publicItems, dailyRevisions, storedBytes] = await Promise.all([
    database.prepare(`
      SELECT COUNT(*) AS count FROM workshop_items
      WHERE owner_user_id = ?1 AND status = 'published'
    `).bind(userId).first(),
    database.prepare(`
      SELECT COUNT(*) AS count FROM workshop_revisions
      WHERE created_by_user_id = ?1 AND created_at >= ?2
    `).bind(userId, dayStart).first(),
    database.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN created_by_user_id = ?1 THEN byte_size ELSE 0 END), 0)
          AS user_bytes,
        COALESCE(SUM(byte_size), 0) AS total_bytes
      FROM workshop_revisions
    `).bind(userId).first()
  ]);
  return {
    publicItems: Number(publicItems?.count ?? 0),
    dailyRevisions: Number(dailyRevisions?.count ?? 0),
    storedBytes: Number(storedBytes?.user_bytes ?? storedBytes?.bytes ?? 0),
    totalStoredBytes: Number(storedBytes?.total_bytes ?? storedBytes?.bytes ?? 0)
  };
}

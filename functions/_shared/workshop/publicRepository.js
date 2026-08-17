import {
  WORKSHOP_IMAGE_PROVIDER_TYPES,
  WORKSHOP_PACKAGE_KIND_IMAGE_GENERATION_PRESET,
  WORKSHOP_VISUAL_PURPOSES,
  workshopPublicItemV1Schema
} from './packageContract.js';

const LIST_LIMIT_DEFAULT = 20;
const LIST_LIMIT_MAXIMUM = 40;
const PROVIDER_ALIASES = Object.freeze({
  novelai: 'novelai-image',
  openai: 'openai-images',
  xai: 'xai-images',
  gemini: 'gemini-image',
  alibaba: 'alibaba-model-studio',
  comfyui: 'comfyui-workflow',
  sd: 'sd-webui'
});

function parseJson(value, fallback) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function encodeCursor(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(value, orderColumn) {
  if (!value) return null;
  if (value.length > 1000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_cursor');
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !parsed || typeof parsed !== 'object'
      || parsed.orderColumn !== orderColumn
      || typeof parsed.orderValue !== 'string'
      || typeof parsed.itemId !== 'string'
      || parsed.orderValue.length > 50
      || parsed.itemId.length > 100
    ) throw new Error('invalid_cursor');
    return parsed;
  } catch {
    throw new Error('invalid_cursor');
  }
}

function parsePositiveInteger(value, fallback) {
  if (value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error('invalid_limit');
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > LIST_LIMIT_MAXIMUM) {
    throw new Error('invalid_limit');
  }
  return number;
}

export function parseWorkshopListQuery(requestUrl) {
  const url = new URL(requestUrl);
  const kind = url.searchParams.get('kind') ?? WORKSHOP_PACKAGE_KIND_IMAGE_GENERATION_PRESET;
  if (kind !== WORKSHOP_PACKAGE_KIND_IMAGE_GENERATION_PRESET) throw new Error('invalid_kind');
  const sort = url.searchParams.get('sort') ?? 'updated';
  if (sort !== 'updated' && sort !== 'new') throw new Error('invalid_sort');
  const rating = url.searchParams.get('rating') ?? 'general';
  if (rating !== 'general' && rating !== 'mature') throw new Error('invalid_rating');
  const providerInput = url.searchParams.get('provider');
  const provider = providerInput ? (PROVIDER_ALIASES[providerInput] ?? providerInput) : null;
  if (provider && !WORKSHOP_IMAGE_PROVIDER_TYPES.includes(provider)) throw new Error('invalid_provider');
  const purpose = url.searchParams.get('purpose');
  if (purpose && !WORKSHOP_VISUAL_PURPOSES.includes(purpose)) throw new Error('invalid_purpose');
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (q.length > 100) throw new Error('invalid_query');
  const limit = parsePositiveInteger(url.searchParams.get('limit'), LIST_LIMIT_DEFAULT);
  const orderColumn = sort === 'new' ? 'created_at' : 'updated_at';
  return {
    kind,
    sort,
    rating,
    provider,
    purpose,
    q,
    limit,
    orderColumn,
    cursor: decodeCursor(url.searchParams.get('cursor'), orderColumn)
  };
}

function publicItemSelect() {
  return `
    SELECT
      i.item_id, i.kind, i.slug, i.title, i.summary, i.language,
      i.content_rating, i.tags_json, i.created_at AS item_created_at,
      i.updated_at AS item_updated_at, i.download_count,
      u.user_id AS author_id, u.display_name AS author_display_name,
      u.avatar_ref AS author_avatar_ref,
      r.revision_id, r.revision_number, r.schema_version, r.package_sha256,
      r.byte_size, r.compatibility_json, r.changelog,
      r.created_at AS revision_created_at
    FROM workshop_items i
    INNER JOIN workshop_users u ON u.user_id = i.owner_user_id
    INNER JOIN workshop_revisions r ON r.revision_id = i.latest_revision_id
  `;
}

function mapPublicItem(row) {
  const candidate = {
    itemId: row.item_id,
    kind: row.kind,
    slug: row.slug ?? null,
    title: row.title,
    summary: row.summary,
    language: row.language,
    contentRating: row.content_rating,
    tags: parseJson(row.tags_json, []),
    author: {
      authorId: row.author_id,
      displayName: row.author_display_name,
      avatarRef: row.author_avatar_ref ?? null
    },
    downloadCount: Number(row.download_count),
    latestRevision: {
      revisionId: row.revision_id,
      revisionNumber: Number(row.revision_number),
      schemaVersion: Number(row.schema_version),
      packageSha256: row.package_sha256,
      byteSize: Number(row.byte_size),
      compatibility: parseJson(row.compatibility_json, null),
      changelog: row.changelog,
      createdAt: row.revision_created_at
    },
    createdAt: row.item_created_at,
    updatedAt: row.item_updated_at
  };
  const parsed = workshopPublicItemV1Schema.safeParse(candidate);
  if (!parsed.success) throw new Error('invalid_public_item');
  return parsed.data;
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function listPublicWorkshopItems(database, query) {
  const where = [
    "i.status = 'published'",
    'i.kind = ?1',
    'i.content_rating = ?2'
  ];
  const bindings = [query.kind, query.rating];
  const bind = (value) => {
    bindings.push(value);
    return `?${bindings.length}`;
  };
  if (query.provider) {
    const placeholder = bind(query.provider);
    where.push(`EXISTS (SELECT 1 FROM json_each(r.compatibility_json, '$.providerTypes') WHERE value = ${placeholder})`);
  }
  if (query.purpose) {
    const placeholder = bind(query.purpose);
    where.push(`EXISTS (SELECT 1 FROM json_each(r.compatibility_json, '$.purposes') WHERE value = ${placeholder})`);
  }
  if (query.q) {
    const placeholder = bind(`%${escapeLike(query.q)}%`);
    where.push(`(i.title LIKE ${placeholder} ESCAPE '\\' OR i.summary LIKE ${placeholder} ESCAPE '\\')`);
  }
  if (query.cursor) {
    const orderValue = bind(query.cursor.orderValue);
    const itemId = bind(query.cursor.itemId);
    where.push(`(i.${query.orderColumn} < ${orderValue} OR (i.${query.orderColumn} = ${orderValue} AND i.item_id < ${itemId}))`);
  }
  const limit = bind(query.limit + 1);
  const statement = database.prepare(`
    ${publicItemSelect()}
    WHERE ${where.join('\n      AND ')}
    ORDER BY i.${query.orderColumn} DESC, i.item_id DESC
    LIMIT ${limit}
  `).bind(...bindings);
  const result = await statement.all();
  const rows = Array.isArray(result?.results) ? result.results : [];
  const hasNext = rows.length > query.limit;
  const visibleRows = rows.slice(0, query.limit);
  const items = visibleRows.map(mapPublicItem);
  const lastRow = visibleRows.at(-1);
  return {
    items,
    nextCursor: hasNext && lastRow ? encodeCursor({
      orderColumn: query.orderColumn,
      orderValue: lastRow[query.orderColumn === 'created_at' ? 'item_created_at' : 'item_updated_at'],
      itemId: lastRow.item_id
    }) : null
  };
}

export async function getPublicWorkshopItem(database, itemId) {
  const row = await database.prepare(`
    ${publicItemSelect()}
    WHERE i.status = 'published' AND i.item_id = ?1
    LIMIT 1
  `).bind(itemId).first();
  return row ? mapPublicItem(row) : null;
}

export async function getPublicWorkshopDownload(database, itemId, revisionId) {
  const revisionClause = revisionId ? 'AND r.revision_id = ?2' : 'AND r.revision_id = i.latest_revision_id';
  const statement = database.prepare(`
    SELECT i.item_id, i.title, i.status, r.revision_id, r.revision_number,
      r.schema_version, r.package_sha256, r.byte_size, r.r2_key
    FROM workshop_items i
    INNER JOIN workshop_revisions r ON r.item_id = i.item_id
    WHERE i.status = 'published' AND i.item_id = ?1 ${revisionClause}
    LIMIT 1
  `);
  return revisionId ? statement.bind(itemId, revisionId).first() : statement.bind(itemId).first();
}

export async function incrementPublicWorkshopDownloadCount(database, itemId) {
  await database.prepare(`
    UPDATE workshop_items
    SET download_count = download_count + 1
    WHERE item_id = ?1 AND status = 'published'
  `).bind(itemId).run();
}

import {
  calculateImageGenerationPresetPackageSha256V1,
  canonicalizeImageGenerationPresetPackageV1,
  parseImageGenerationPresetPackageJsonV1
} from './packageContract.js';

function compatibilitySummary(workshopPackage) {
  return {
    providerTypes: workshopPackage.compatibility.providerTypes,
    purposes: [...new Set(workshopPackage.content.variants.map((variant) => variant.purpose))],
    modelHints: workshopPackage.compatibility.modelHints,
    requiredFeatures: workshopPackage.compatibility.requiredFeatures,
    minAppVersion: workshopPackage.manifest.minAppVersion
  };
}

function fixtureId(prefix, sha256) {
  return `${prefix}_${sha256.slice(0, 24)}`;
}

export async function publishWorkshopFixture({
  database,
  packages,
  rawJson,
  authorDisplayName = '工坊测试夹具',
  changelog = '只读接口测试夹具。',
  now = new Date().toISOString()
}) {
  if (!database || !packages) throw new Error('fixture_bindings_required');
  const parsed = parseImageGenerationPresetPackageJsonV1(rawJson);
  if (!parsed.success) throw new Error(`fixture_package_invalid:${parsed.error.code}`);
  const canonicalJson = canonicalizeImageGenerationPresetPackageV1(parsed.data);
  const bytes = new TextEncoder().encode(canonicalJson);
  const sha256 = await calculateImageGenerationPresetPackageSha256V1(parsed.data);
  const authorId = fixtureId('fixture_author', sha256);
  const itemId = fixtureId('fixture_item', sha256);
  const revisionId = fixtureId('fixture_revision', sha256);
  const r2Key = `packages/${parsed.data.kind}/${itemId}/1/${sha256}.json`;
  const compatibilityJson = JSON.stringify(compatibilitySummary(parsed.data));

  await packages.put(r2Key, canonicalJson, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      itemId,
      revisionId,
      packageSha256: sha256,
      schemaVersion: String(parsed.data.schemaVersion)
    }
  });

  try {
    await database.batch([
      database.prepare(`
        INSERT INTO workshop_users (
          user_id, discord_user_id, display_name, avatar_ref, role, status,
          created_at, updated_at, last_login_at
        ) VALUES (?1, ?2, ?3, NULL, 'member', 'active', ?4, ?4, NULL)
        ON CONFLICT(user_id) DO UPDATE SET
          display_name = excluded.display_name,
          updated_at = excluded.updated_at
      `).bind(authorId, `fixture:${authorId}`, authorDisplayName, now),
      database.prepare(`
        INSERT INTO workshop_items (
          item_id, owner_user_id, kind, slug, title, summary, language,
          content_rating, tags_json, status, latest_revision_id,
          disabled_reason, created_at, updated_at
        ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, 'published', NULL, NULL, ?9, ?9)
        ON CONFLICT(item_id) DO NOTHING
      `).bind(
        itemId,
        authorId,
        parsed.data.kind,
        parsed.data.manifest.title,
        parsed.data.manifest.summary,
        parsed.data.manifest.language,
        parsed.data.manifest.contentRating,
        JSON.stringify(parsed.data.manifest.tags),
        now
      ),
      database.prepare(`
        INSERT INTO workshop_revisions (
          revision_id, item_id, revision_number, schema_version, package_sha256,
          r2_key, byte_size, compatibility_json, changelog,
          created_by_user_id, created_at
        ) VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(revision_id) DO NOTHING
      `).bind(
        revisionId,
        itemId,
        parsed.data.schemaVersion,
        sha256,
        r2Key,
        bytes.byteLength,
        compatibilityJson,
        changelog,
        authorId,
        now
      ),
      database.prepare(`
        UPDATE workshop_items
        SET latest_revision_id = ?1, updated_at = ?2
        WHERE item_id = ?3 AND status = 'published'
      `).bind(revisionId, now, itemId)
    ]);
  } catch (error) {
    try { await packages.delete(r2Key); } catch { /* orphan scan remains the final fallback */ }
    throw error;
  }

  return {
    authorId,
    itemId,
    revisionId,
    r2Key,
    packageSha256: sha256,
    byteSize: bytes.byteLength
  };
}

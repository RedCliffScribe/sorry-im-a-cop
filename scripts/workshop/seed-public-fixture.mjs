import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import {
  calculateImageGenerationPresetPackageSha256V1,
  canonicalizeImageGenerationPresetPackageV1,
  parseImageGenerationPresetPackageJsonV1
} from '../../shared/workshop/contracts/imageGenerationPresetPackageV1.js';

function sql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function fixtureId(prefix, sha256) {
  return `${prefix}_${sha256.slice(0, 24)}`;
}

export async function buildWorkshopFixtureArtifacts(rawJson, options = {}) {
  const parsed = parseImageGenerationPresetPackageJsonV1(rawJson);
  if (!parsed.success) throw new Error(`夹具包无效：${parsed.error.code} · ${parsed.error.message}`);
  const canonicalJson = canonicalizeImageGenerationPresetPackageV1(parsed.data);
  const sha256 = await calculateImageGenerationPresetPackageSha256V1(parsed.data);
  const byteSize = new globalThis.TextEncoder().encode(canonicalJson).byteLength;
  const authorId = fixtureId('fixture_author', sha256);
  const itemId = fixtureId('fixture_item', sha256);
  const revisionId = fixtureId('fixture_revision', sha256);
  const now = options.now ?? new Date().toISOString();
  const authorDisplayName = options.authorDisplayName ?? '工坊测试夹具';
  const changelog = options.changelog ?? '只读接口测试夹具。';
  const r2Key = `packages/${parsed.data.kind}/${itemId}/1/${sha256}.json`;
  const compatibility = {
    providerTypes: parsed.data.compatibility.providerTypes,
    purposes: [...new Set(parsed.data.content.variants.map((variant) => variant.purpose))],
    modelHints: parsed.data.compatibility.modelHints,
    requiredFeatures: parsed.data.compatibility.requiredFeatures,
    minAppVersion: parsed.data.manifest.minAppVersion
  };
  const seedStatements = `INSERT INTO workshop_users (
  user_id, discord_user_id, display_name, avatar_ref, role, status,
  created_at, updated_at, last_login_at
) VALUES (
  ${sql(authorId)}, ${sql(`fixture:${authorId}`)}, ${sql(authorDisplayName)}, NULL,
  'member', 'active', ${sql(now)}, ${sql(now)}, NULL
)
ON CONFLICT(user_id) DO UPDATE SET
  display_name = excluded.display_name,
  updated_at = excluded.updated_at;

INSERT INTO workshop_items (
  item_id, owner_user_id, kind, slug, title, summary, language,
  content_rating, tags_json, status, latest_revision_id,
  disabled_reason, created_at, updated_at
) VALUES (
  ${sql(itemId)}, ${sql(authorId)}, ${sql(parsed.data.kind)}, NULL,
  ${sql(parsed.data.manifest.title)}, ${sql(parsed.data.manifest.summary)},
  ${sql(parsed.data.manifest.language)}, ${sql(parsed.data.manifest.contentRating)},
  ${sql(JSON.stringify(parsed.data.manifest.tags))}, 'published', NULL, NULL,
  ${sql(now)}, ${sql(now)}
)
ON CONFLICT(item_id) DO NOTHING;

INSERT INTO workshop_revisions (
  revision_id, item_id, revision_number, schema_version, package_sha256,
  r2_key, byte_size, compatibility_json, changelog,
  created_by_user_id, created_at
) VALUES (
  ${sql(revisionId)}, ${sql(itemId)}, 1, ${sql(parsed.data.schemaVersion)},
  ${sql(sha256)}, ${sql(r2Key)}, ${sql(byteSize)}, ${sql(JSON.stringify(compatibility))},
  ${sql(changelog)}, ${sql(authorId)}, ${sql(now)}
)
ON CONFLICT(revision_id) DO NOTHING;

UPDATE workshop_items
SET latest_revision_id = ${sql(revisionId)}, updated_at = ${sql(now)}
WHERE item_id = ${sql(itemId)} AND status = 'published';
`;
  const seedSql = `PRAGMA foreign_keys = ON;
BEGIN;
${seedStatements}COMMIT;
`;
  const remoteSeedSql = `PRAGMA foreign_keys = ON;
${seedStatements}`;
  const rollbackSql = `PRAGMA foreign_keys = ON;
UPDATE workshop_items
SET latest_revision_id = NULL
WHERE item_id = ${sql(itemId)};
DELETE FROM workshop_revisions
WHERE revision_id = ${sql(revisionId)};
DELETE FROM workshop_items
WHERE item_id = ${sql(itemId)};
DELETE FROM workshop_users
WHERE user_id = ${sql(authorId)}
  AND discord_user_id = ${sql(`fixture:${authorId}`)}
  AND NOT EXISTS (
    SELECT 1 FROM workshop_items WHERE owner_user_id = ${sql(authorId)}
  );
`;
  return {
    canonicalJson,
    seedSql,
    remoteSeedSql,
    rollbackSql,
    sha256,
    byteSize,
    authorId,
    itemId,
    revisionId,
    r2Key
  };
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('参数必须使用 --name value。');
    values.set(key.slice(2), value);
  }
  const database = values.get('database');
  const bucket = values.get('bucket');
  const fixture = values.get('fixture') ?? 'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json';
  const mode = values.get('mode') ?? 'local';
  if (!database || !bucket) throw new Error('必须提供 --database 与 --bucket。');
  if (mode !== 'local' && mode !== 'remote') throw new Error('--mode 只能是 local 或 remote。');
  if (mode === 'remote' && values.get('confirm-remote') !== 'yes') {
    throw new Error('远端写入必须显式提供 --confirm-remote yes。');
  }
  return { database, bucket, fixture: resolve(fixture), mode };
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`${basename(command)} 执行失败，退出码 ${code}`)));
  });
}

export function buildWranglerInvocation(args, options = {}) {
  const platform = options.platform ?? globalThis.process.platform;
  const nodeExecutable = options.nodeExecutable ?? globalThis.process.execPath;
  const npmExecPath = options.npmExecPath ?? globalThis.process.env.npm_execpath;
  if (npmExecPath) {
    return {
      command: nodeExecutable,
      args: [npmExecPath, 'exec', '--yes', '--package=wrangler', '--', 'wrangler', ...args]
    };
  }
  if (platform === 'win32') {
    return {
      command: nodeExecutable,
      args: [
        resolve(dirname(nodeExecutable), 'node_modules/npm/bin/npm-cli.js'),
        'exec',
        '--yes',
        '--package=wrangler',
        '--',
        'wrangler',
        ...args
      ]
    };
  }
  return { command: 'npx', args: ['--yes', 'wrangler', ...args] };
}

function runWrangler(args) {
  const invocation = buildWranglerInvocation(args);
  return run(invocation.command, invocation.args);
}

async function main() {
  const input = parseArguments(globalThis.process.argv.slice(2));
  const artifacts = await buildWorkshopFixtureArtifacts(await readFile(input.fixture, 'utf8'));
  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'sicv2-workshop-fixture-'));
  const packageFile = resolve(temporaryDirectory, 'package.json');
  const seedFile = resolve(temporaryDirectory, 'seed.sql');
  const rollbackFile = resolve(temporaryDirectory, 'rollback.sql');
  const targetFlag = input.mode === 'remote' ? '--remote' : '--local';
  await writeFile(packageFile, artifacts.canonicalJson, 'utf8');
  await writeFile(
    seedFile,
    input.mode === 'remote' ? artifacts.remoteSeedSql : artifacts.seedSql,
    'utf8'
  );
  await writeFile(rollbackFile, artifacts.rollbackSql, 'utf8');
  try {
    await runWrangler(['d1', 'execute', input.database, targetFlag,
      '--file=migrations/workshop/0001_workshop_core.sql']);
    await runWrangler(['r2', 'object', 'put', `${input.bucket}/${artifacts.r2Key}`,
      targetFlag, `--file=${packageFile}`, '--content-type=application/json; charset=utf-8']);
    try {
      await runWrangler(['d1', 'execute', input.database, targetFlag, `--file=${seedFile}`]);
    } catch (error) {
      try {
        await runWrangler([
          'd1',
          'execute',
          input.database,
          targetFlag,
          `--file=${rollbackFile}`
        ]);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'D1 发布失败且补偿清理失败；为避免产生悬空元数据，R2 对象已保留供人工核对。',
          { cause: cleanupError }
        );
      }
      await runWrangler([
        'r2',
        'object',
        'delete',
        `${input.bucket}/${artifacts.r2Key}`,
        targetFlag
      ]).catch(() => undefined);
      throw error;
    }
    globalThis.console.info(JSON.stringify({
      ok: true,
      mode: input.mode,
      itemId: artifacts.itemId,
      revisionId: artifacts.revisionId,
      packageSha256: artifacts.sha256,
      byteSize: artifacts.byteSize
    }, null, 2));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (
  globalThis.process.argv[1]
  && import.meta.url === pathToFileURL(resolve(globalThis.process.argv[1])).href
) {
  await main();
}

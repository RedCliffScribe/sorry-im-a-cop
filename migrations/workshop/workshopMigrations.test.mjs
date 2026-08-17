import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

describe('workshop D1 migrations', () => {
  it('applies all additive migrations and preserves administrator governance fields', async () => {
    const database = new DatabaseSync(':memory:');
    try {
      for (const migration of [
        '0001_workshop_core.sql',
        '0002_workshop_auth_upload.sql',
        '0003_workshop_admin_governance.sql',
        '0004_workshop_download_count.sql'
      ]) {
        database.exec(await readFile(resolve(process.cwd(), 'migrations/workshop', migration), 'utf8'));
      }
      const itemColumns = database.prepare('PRAGMA table_info(workshop_items)').all();
      expect(itemColumns.map((column) => column.name)).toContain('admin_disabled_previous_status');
      expect(itemColumns.map((column) => column.name)).toContain('download_count');

      database.prepare(`
        INSERT INTO workshop_users (
          user_id, discord_user_id, display_name, role, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'member', 'active', ?, ?)
      `).run('user_1', '123456789012345678', '测试用户', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z');
      database.prepare(`
        INSERT INTO workshop_items (
          item_id, owner_user_id, kind, title, summary, language, content_rating,
          tags_json, status, created_at, updated_at, admin_disabled_previous_status
        ) VALUES (?, ?, 'image-generation-preset', ?, ?, 'zh-CN', 'general', '[]',
          'disabled', ?, ?, 'published')
      `).run(
        'item_1',
        'user_1',
        '测试预设',
        '测试迁移后的管理员停用状态。',
        '2026-08-03T00:00:00.000Z',
        '2026-08-03T00:00:00.000Z'
      );
      expect(database.prepare(`
        SELECT admin_disabled_previous_status FROM workshop_items WHERE item_id = 'item_1'
      `).get()).toEqual({ admin_disabled_previous_status: 'published' });
      expect(database.prepare(`
        SELECT download_count FROM workshop_items WHERE item_id = 'item_1'
      `).get()).toEqual({ download_count: 0 });
    } finally {
      database.close();
    }
  });
});

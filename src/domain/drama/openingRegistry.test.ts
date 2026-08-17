import { describe, expect, it } from 'vitest';
import {
  composeDramaticOpeningGuide,
  dramaticOpeningDefinitions,
  dramaticOpeningGroups
} from './openingRegistry';

describe('dramatic opening registry', () => {
  it('registers sixteen unique openings in four valid groups', () => {
    const groupIds = new Set(dramaticOpeningGroups.map((group) => group.id));
    const openingIds = dramaticOpeningDefinitions.map((opening) => opening.id);

    expect(dramaticOpeningGroups).toHaveLength(4);
    expect(dramaticOpeningDefinitions).toHaveLength(16);
    expect(new Set(openingIds).size).toBe(openingIds.length);
    expect(dramaticOpeningDefinitions.every((opening) => groupIds.has(opening.groupId))).toBe(true);
  });

  it('describes a structure without declaring it as world fact', () => {
    const guide = composeDramaticOpeningGuide('gray_temptation');

    expect(guide).toContain('戏剧化开局结构：灰色诱惑');
    expect(guide).toContain('不声明世界事实');
    expect(guide).toContain('不替玩家作出选择');
    expect(guide).toContain('最多新建四名开局人物');
  });
});

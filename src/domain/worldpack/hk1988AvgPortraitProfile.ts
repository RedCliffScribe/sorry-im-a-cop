import type { Actor } from '../runtime/types';
import type {
  AvgGenericPortraitProfileAdapter,
  GenericPortraitIdentityProfile
} from '../avgPresentation/types';

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('en-US') ?? '';
}

function snake(value: string | undefined): string | undefined {
  const result = normalized(value)
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
  return result || undefined;
}

function containsAny(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function isCurrentRoleProfile(status: string | undefined): boolean {
  return status !== undefined && status !== 'none' && status !== 'retired';
}

function civilianStructuredText(actor: Actor): string {
  const civilian = isCurrentRoleProfile(actor.roleProfiles.civilian?.status)
    ? actor.roleProfiles.civilian
    : undefined;
  return [
    civilian?.occupationGroupId,
    civilian?.publicOccupation,
    civilian?.positionSummary,
    ...(civilian?.sectorIds ?? []),
    ...(civilian?.roleTags ?? []),
    ...actor.organizationRelations.flatMap((relation) => [
      relation.roleTitle,
      relation.departmentOrUnit,
      relation.relationType
    ]),
    actor.publicIdentity,
    actor.positionSummary,
    actor.currentIdentity
  ].map(normalized).filter(Boolean).join(' ');
}

function roleFamilyFor(actor: Actor): string {
  if (
    actor.currentIdentity === 'police' ||
    isCurrentRoleProfile(actor.roleProfiles.police?.status)
  ) return 'police';
  if (
    actor.currentIdentity === 'gang_member' ||
    isCurrentRoleProfile(actor.roleProfiles.triad?.status)
  ) return 'triad';

  const text = civilianStructuredText(actor);
  if (containsAny(text, [
    'entertainment', 'film', 'television', 'tv_', 'singer', 'actor', 'actress',
    'director', 'producer', 'model', '演艺', '娱乐', '电影', '电视', '演员',
    '歌手', '导演', '制片', '经纪', '模特'
  ])) return 'entertainment';
  if (containsAny(text, [
    'medical', 'doctor', 'nurse', 'hospital', 'clinic', '医生', '医师', '护士',
    '医院', '诊所', '医疗'
  ])) return 'medical';
  if (containsAny(text, [
    'legal', 'lawyer', 'solicitor', 'barrister', 'attorney', '律师', '法律', '大状'
  ])) return 'legal';
  if (containsAny(text, [
    'education', 'teacher', 'school', 'university', 'student', '教师', '老师',
    '学校', '大学', '学生', '教育'
  ])) return 'education';
  if (containsAny(text, [
    'government', 'civil_service', 'public_service', 'official', '公务员', '政府',
    '公职', '官员'
  ])) return 'government';
  if (containsAny(text, [
    'news', 'media', 'reporter', 'editor', 'journalist', '新闻', '媒体', '记者',
    '编辑', '报社'
  ])) return 'media';
  if (containsAny(text, [
    'bank', 'finance', 'business', 'manager', 'executive', 'accountant', '银行',
    '金融', '商业', '经理', '主管', '会计', '公司'
  ])) return 'business';
  if (containsAny(text, [
    'technical', 'engineer', 'technician', 'mechanic', '工程师', '技术员', '技工',
    '维修', '机械'
  ])) return 'technical';
  if (containsAny(text, [
    'professional', 'architect', 'designer', 'artist', 'consultant', '专业',
    '建筑师', '设计师', '艺术家', '顾问'
  ])) return 'professional';
  return 'civilian';
}

function policeSubtype(actor: Actor): string | undefined {
  const police = actor.roleProfiles.police;
  const text = [police?.postRole, police?.department, police?.assignmentSummary]
    .map(normalized).join(' ');
  if (containsAny(text, ['cid', 'detective', 'criminal investigation', '刑事', '侦缉'])) {
    return 'detective';
  }
  if (containsAny(text, ['traffic', '交通'])) return 'traffic';
  if (containsAny(text, ['patrol', '巡逻'])) return 'uniform_patrol';
  if (containsAny(text, ['desk', 'report room', '值班', '报案'])) return 'desk_officer';
  if (containsAny(text, ['admin', 'records', '行政', '文职', '档案'])) return 'administration';
  return snake(police?.postRole ?? police?.department ?? actor.positionSummary);
}

function triadSubtype(actor: Actor): string | undefined {
  const triad = actor.roleProfiles.triad;
  const text = [triad?.roleTitle, triad?.rankSummary, actor.positionSummary]
    .map(normalized).join(' ');
  const mappings: Array<[readonly string[], string]> = [
    [['enforcer', 'fighter', '打手', '武斗'], 'enforcer'],
    [['bookkeeper', 'account', '账房', '会计'], 'bookkeeper'],
    [['lookout', '哨', '望风'], 'lookout'],
    [['collector', '收数', '催收'], 'collector'],
    [['fixer', '掮客', '中间人'], 'fixer'],
    [['boss', 'leader', '坐馆', '龙头', '大佬'], 'midlevel_operator'],
    [['associate', '马仔', '成员'], 'associate']
  ];
  return mappings.find(([patterns]) => containsAny(text, patterns))?.[1] ??
    snake(triad?.roleTitle ?? actor.positionSummary);
}

function roleTierFor(actor: Actor): string | undefined {
  const source = actor.currentIdentity === 'police'
    ? actor.roleProfiles.police?.rank
    : actor.currentIdentity === 'gang_member'
      ? actor.roleProfiles.triad?.rankSummary
      : actor.roleProfiles.civilian?.decisionScopeSummary;
  const text = normalized(source ?? actor.positionSummary);
  if (containsAny(text, ['chief', 'director', 'executive', '总监', '处长', '老板'])) {
    return 'executive';
  }
  if (containsAny(text, ['superintendent', 'supervisor', 'manager', '督察', '主管', '经理'])) {
    return 'supervisory';
  }
  if (containsAny(text, ['senior', 'veteran', '资深', '高级', '老资格'])) return 'senior';
  if (containsAny(text, ['experienced', 'established', '成熟', '经验'])) return 'experienced';
  if (containsAny(text, ['junior', 'constable', 'assistant', '初级', '新人', '警员', '助理'])) {
    return 'junior';
  }
  return undefined;
}

function bodyBuildFor(actor: Actor): string | undefined {
  const text = normalized([
    actor.femaleProfile?.bodyDescription,
    actor.bodyConditionSummary,
    actor.appearance
  ].filter(Boolean).join(' '));
  if (containsAny(text, ['curvy', 'voluptuous', '丰满', '丰腴', '曲线'])) return 'curvy';
  if (containsAny(text, ['athletic', 'muscular', '健壮', '结实', '运动型'])) return 'athletic';
  if (containsAny(text, ['slim', 'slender', '苗条', '纤细', '瘦削'])) return 'slim';
  if (containsAny(text, ['stocky', '魁梧', '壮实'])) return 'stocky';
  return undefined;
}

function demeanorFor(actor: Actor): string[] {
  const text = normalized(actor.personality);
  const tags: Array<[readonly string[], string]> = [
    [['calm', '冷静', '沉着'], 'calm'],
    [['confident', '自信'], 'confident'],
    [['sharp', '精明', '敏锐'], 'sharp'],
    [['friendly', '友善', '亲切'], 'friendly'],
    [['serious', '严肃', '认真'], 'serious'],
    [['reserved', '内敛', '寡言'], 'reserved'],
    [['streetwise', '江湖', '老练'], 'streetwise']
  ];
  return tags.filter(([patterns]) => containsAny(text, patterns)).map(([, tag]) => tag);
}

function subtypeFor(actor: Actor): string | undefined {
  if (roleFamilyFor(actor) === 'police') return policeSubtype(actor);
  if (roleFamilyFor(actor) === 'triad') return triadSubtype(actor);
  const civilian = actor.roleProfiles.civilian;
  return snake(
    civilian?.occupationGroupId ??
    civilian?.publicOccupation ??
    civilian?.positionSummary ??
    actor.positionSummary
  );
}

export const hk1988GenericPortraitProfileAdapter: AvgGenericPortraitProfileAdapter = {
  buildProfile(actor): Partial<GenericPortraitIdentityProfile> {
    const civilian = isCurrentRoleProfile(actor.roleProfiles.civilian?.status)
      ? actor.roleProfiles.civilian
      : undefined;
    const demeanor = demeanorFor(actor);
    return {
      roleFamily: roleFamilyFor(actor),
      roleSubtype: subtypeFor(actor),
      roleTier: roleTierFor(actor),
      bodyBuild: bodyBuildFor(actor),
      ...(demeanor.length ? { demeanor } : {}),
      roleTags: [
        ...(civilian?.sectorIds ?? []),
        ...(civilian?.roleTags ?? []),
        ...actor.organizationRelations.flatMap((relation) => [
          relation.roleTitle,
          relation.departmentOrUnit
        ].filter((value): value is string => Boolean(value)))
      ].map((value) => snake(value)).filter((value): value is string => Boolean(value))
    };
  }
};

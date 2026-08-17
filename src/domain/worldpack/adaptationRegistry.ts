export interface WorldpackAdaptationDescriptor {
  readonly worldpackId: string;
  readonly descriptorVersion: number;
  readonly title: string;
  readonly timeRange: {
    readonly from: number;
    readonly to: number;
  };
  readonly settingSummary: string;
  readonly geographySummary: string;
  readonly institutionSummary: string;
  readonly technologySummary: string;
  readonly mediaAndCommunicationSummary: string;
  readonly legalAndSocialSummary: string;
  readonly languageAndCultureSummary: string;
  readonly hardConstraints: readonly string[];
}

export const HK_1988_ADAPTATION_DESCRIPTOR: WorldpackAdaptationDescriptor = Object.freeze({
  worldpackId: 'hk_1988',
  descriptorVersion: 1,
  title: '香港 1988',
  timeRange: Object.freeze({
    from: 1980,
    to: 1996
  }),
  settingSummary:
    '港英时代后期的香港社会，时间范围覆盖 1980 至 1996 年；城市生活同时受到公共秩序、商业活动、家庭人情与主权移交前景影响。',
  geographySummary:
    '主要空间由香港岛、九龙和新界构成，跨海交通、稠密城区、公共屋邨、商业中心、工业区和离岛共同影响人物行动半径。',
  institutionSummary:
    '公共机构、警务系统、司法体系、传媒、商业机构、社团与社区网络均应使用目标年份能够成立的组织形态和权责关系。',
  technologySummary:
    '使用目标年份可用的固定电话、传呼、早期移动通讯、纸质档案、广播电视和当时交通工具；不得默认存在互联网时代基础设施。',
  mediaAndCommunicationSummary:
    '报纸、广播、电视、固定电话、书信、传呼和当面联络是主要传播渠道；传播速度、覆盖面和隐私预期必须符合目标年份。',
  legalAndSocialSummary:
    '法律、警务、公共行政、劳工与社会规范以目标年份香港环境为准；世界包与存档中的既有制度事实优先。',
  languageAndCultureSummary:
    '以香港中文、粤语语境和当时常见中英文并用环境为基础；称谓、货币、机构和生活表达应与人物身份和目标年份一致。',
  hardConstraints: Object.freeze([
    '不得把 1996 年之后才成立的制度、技术或历史结果写成当前既成事实。',
    '不得用来源作品覆盖当前存档已经成立的人物身份、关系、案件、组织或时间事实。',
    '跨年代人物必须遵守已固化的出生日期、年龄和项目内年龄关系。',
    '地名、机构、法律、货币、通讯与交通表达必须能够在目标年份成立。',
    '自定义内容只能提供素材，不得自动宣布人物已经登场、认识玩家或完成来源事件。'
  ])
});

const WORLD_PACK_ADAPTATION_DESCRIPTORS: readonly WorldpackAdaptationDescriptor[] =
  Object.freeze([HK_1988_ADAPTATION_DESCRIPTOR]);

const WORLD_PACK_ADAPTATION_DESCRIPTOR_BY_ID = new Map(
  WORLD_PACK_ADAPTATION_DESCRIPTORS.map((descriptor) => [
    descriptor.worldpackId,
    descriptor
  ])
);

export function listWorldpackAdaptationDescriptors(): readonly WorldpackAdaptationDescriptor[] {
  return WORLD_PACK_ADAPTATION_DESCRIPTORS;
}

export function getWorldpackAdaptationDescriptor(
  worldpackId: string | undefined
): WorldpackAdaptationDescriptor | undefined {
  if (!worldpackId) return undefined;
  return WORLD_PACK_ADAPTATION_DESCRIPTOR_BY_ID.get(worldpackId);
}

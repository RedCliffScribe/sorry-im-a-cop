import { POLICE_PROMOTION_DLC_ID } from '../../police/policePromotionRules';
import type { OfficialDlcManifest } from '../types';

/**
 * Immutable first public contract for the lightweight police promotion and
 * posting system. The rules stay in the shared police domain; this manifest
 * only controls opt-in, compatibility and player-facing catalog metadata.
 */
export const policePromotionManifest: OfficialDlcManifest = {
  dlcId: POLICE_PROMOTION_DLC_ID,
  title: '警队晋升',
  description:
    '以正式任职事实、考试课程、上级推荐、遴选与岗位空缺承接警衔晋升，并提供军装、CID、交通、冲锋队、PTU 与报案室等调动方向。',
  type: 'system',
  version: '1.0.0',
  presentation: {
    tagline: '升职不是经验条；每一次晋升与调动，都要经过可核对的警队程序。',
    experienceKeywords: ['事实凭证', '程序晋升', '部门调动', '等待与复评'],
    contentHighlights: [
      'PC／SPC 至 Inspector 的首版晋升程序',
      '军装、CID、交通、EU、PTU 与报案室调动路线',
      '考试、课程、推荐、遴选、空缺与正式任命',
      '失败保留有效条件，并按游戏时间进入有界复评'
    ]
  },
  existingSaveAttachment: {
    mode: 'forward_only'
  },
  worldCompatibility: [
    {
      worldpackId: 'hk_1988',
      status: 'supported',
      reason: '已按香港 1988 的警衔、部门、岗位与程序边界完成首版适配。'
    }
  ]
};

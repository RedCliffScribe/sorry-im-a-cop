export type PoliceRankCode =
  | 'cp'
  | 'dcp'
  | 'sacp'
  | 'acp'
  | 'csp'
  | 'ssp'
  | 'sp'
  | 'cip'
  | 'sip'
  | 'ip'
  | 'pi'
  | 'ssgt'
  | 'sgt'
  | 'spc'
  | 'pc'
  | 'unknown';

export interface PoliceRankDefinition {
  code: Exclude<PoliceRankCode, 'unknown'>;
  zh: string;
  en: string;
  abbreviation: string;
  patterns: readonly RegExp[];
}

export interface PoliceRankDisplay {
  code: PoliceRankCode;
  zh: string;
  en: string;
  label: string;
}

/**
 * Ordered by expression specificity rather than simple hierarchy. The order
 * prevents values such as "Assistant Commissioner of Police" from being
 * mistaken for Commissioner, or Chief Inspector for Inspector.
 */
export const POLICE_RANK_DEFINITIONS: readonly PoliceRankDefinition[] = [
  {
    code: 'dcp',
    zh: '副处长',
    en: 'Deputy Commissioner',
    abbreviation: 'DCP',
    patterns: [/\bdeputy commissioner(?: of police)?\b/i, /\bdcp\b/i, /副处长|副處長/]
  },
  {
    code: 'sacp',
    zh: '高级助理处长',
    en: 'Senior Assistant Commissioner',
    abbreviation: 'SACP',
    patterns: [
      /\bsenior assistant commissioner(?: of police)?\b/i,
      /\bsacp?\b/i,
      /高级助理处长|高級助理處長/
    ]
  },
  {
    code: 'acp',
    zh: '助理处长',
    en: 'Assistant Commissioner',
    abbreviation: 'ACP',
    patterns: [/\bassistant commissioner(?: of police)?\b/i, /\bacp\b/i, /助理处长|助理處長/]
  },
  {
    code: 'cp',
    zh: '警务处长',
    en: 'Commissioner of Police',
    abbreviation: 'CP',
    patterns: [/^commissioner of police\b/i, /\bcp\b/i, /警务处长|警務處處長/]
  },
  {
    code: 'csp',
    zh: '总警司',
    en: 'Chief Superintendent',
    abbreviation: 'CSP',
    patterns: [/\bchief superintendent(?: of police)?\b/i, /\bcsp\b/i, /总警司|總警司/]
  },
  {
    code: 'ssp',
    zh: '高级警司',
    en: 'Senior Superintendent',
    abbreviation: 'SSP',
    patterns: [/\bsenior superintendent(?: of police)?\b/i, /\bssp\b/i, /高级警司|高級警司/]
  },
  {
    code: 'sp',
    zh: '警司',
    en: 'Superintendent',
    abbreviation: 'SP',
    patterns: [/\bsuperintendent(?: of police)?\b/i, /\bsp\b/i, /警司/]
  },
  {
    code: 'cip',
    zh: '总督察',
    en: 'Chief Inspector',
    abbreviation: 'CIP',
    patterns: [/\bchief inspector(?: of police)?\b/i, /\bcip\b/i, /\bci\b/i, /总督察|總督察/]
  },
  {
    code: 'sip',
    zh: '高级督察',
    en: 'Senior Inspector',
    abbreviation: 'SIP',
    patterns: [/\bsenior inspector(?: of police)?\b/i, /\bsip\b/i, /高级督察|高級督察/]
  },
  {
    code: 'pi',
    zh: '见习督察',
    en: 'Probationary Inspector',
    abbreviation: 'PI',
    patterns: [/\bprobationary inspector(?: of police)?\b/i, /\bpi\b/i, /见习督察|見習督察/]
  },
  {
    code: 'ip',
    zh: '督察',
    en: 'Inspector',
    abbreviation: 'IP',
    patterns: [/\binspector(?: of police)?\b/i, /\bip\b/i, /督察/]
  },
  {
    code: 'ssgt',
    zh: '警署警长',
    en: 'Station Sergeant',
    abbreviation: 'SSGT',
    patterns: [/\bstation sergeant\b/i, /\bssgt\b/i, /警署警长|警署警長/]
  },
  {
    code: 'sgt',
    zh: '警长',
    en: 'Sergeant',
    abbreviation: 'SGT',
    patterns: [/\bsergeant\b/i, /\bsgt\b/i, /警长|警長/]
  },
  {
    code: 'spc',
    zh: '高级警员',
    en: 'Senior Police Constable',
    abbreviation: 'SPC',
    patterns: [
      /\bsenior police constable\b/i,
      /\bsenior constable\b/i,
      /\bspc\b/i,
      /高级警员|高級警員/
    ]
  },
  {
    code: 'pc',
    zh: '警员',
    en: 'Police Constable',
    abbreviation: 'PC',
    patterns: [/\bpolice constable\b/i, /\bconstable\b/i, /\bpc\b/i, /警员|警員/]
  }
];

const promotionTargets: Partial<Record<PoliceRankCode, string>> = {
  pc: '警长（SGT）',
  spc: '警长（SGT）',
  sgt: '警署警长（SSGT）',
  ssgt: '见习督察（PI）',
  pi: '督察（IP）',
  ip: '高级督察',
  sip: '总督察',
  cip: '警司',
  sp: '高级警司',
  ssp: '总警司',
  csp: '助理处长',
  acp: '高级助理处长',
  sacp: '副处长',
  dcp: '警务处长'
};

export function resolvePoliceRankDefinition(
  rank: string | undefined
): PoliceRankDefinition | undefined {
  const source = rank?.trim();
  if (!source) return undefined;
  return POLICE_RANK_DEFINITIONS.find(({ patterns }) =>
    patterns.some((pattern) => pattern.test(source))
  );
}

export function resolvePoliceRankCode(rank: string | undefined): PoliceRankCode {
  return resolvePoliceRankDefinition(rank)?.code ?? 'unknown';
}

export function normalizePoliceRankDisplay(rank: string | undefined): PoliceRankDisplay {
  const source = rank?.trim() || '警员';
  const definition = resolvePoliceRankDefinition(source);
  if (!definition) {
    return { code: 'unknown', zh: source, en: source, label: source };
  }
  return {
    code: definition.code,
    zh: definition.zh,
    en: definition.en,
    label: `${definition.zh} / ${definition.en}`
  };
}

export function getNextPoliceRankTarget(rank: string | undefined): string | undefined {
  return promotionTargets[resolvePoliceRankCode(rank)];
}

export function isPoliceCommandRank(rank: string | undefined): boolean {
  const code = resolvePoliceRankCode(rank);
  return !['unknown', 'pc', 'spc'].includes(code);
}

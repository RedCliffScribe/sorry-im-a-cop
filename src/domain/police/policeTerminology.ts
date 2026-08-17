const rankLabels: Array<[RegExp, string]> = [
  [/^Senior Constable(?:\s*[（(](?:高级警员\s*)?SPC[）)])?$/i, '高级警员（SPC）'],
  [/^Senior Police Constable(?:\s*[（(](?:高级警员\s*)?SPC[）)])?$/i, '高级警员（SPC）'],
  [/^Station Sergeant(?:\s*[（(](?:警署警长\s*)?SSGT[）)])?$/i, '警署警长（SSGT）'],
  [/^Sergeant(?:\s*[（(](?:警长\s*)?SGT[）)])?$/i, '警长（SGT）'],
  [/^Constable(?:\s*[（(](?:警员\s*)?PC[）)])?$/i, '警员（PC）'],
  [/^Probationary Inspector(?:\s*[（(](?:见习督察(?:\s*PI)?|PI)[）)])?$/i, '见习督察'],
  [/^Senior Inspector(?:\s*[（(](?:高级督察(?:\s*SIP)?|SIP)[）)])?$/i, '高级督察'],
  [/^Chief Inspector(?:\s*[（(](?:总督察(?:\s*CIP)?|CIP)[）)])?$/i, '总督察'],
  [/^Inspector(?:\s*[（(](?:督察(?:\s*IP)?|IP)[）)])?$/i, '督察'],
  [/^Chief Superintendent(?:\s*[（(](?:总警司(?:\s*CSP)?|CSP)[）)])?$/i, '总警司'],
  [/^Senior Superintendent(?:\s*[（(](?:高级警司(?:\s*SSP)?|SSP)[）)])?$/i, '高级警司'],
  [/^Superintendent(?:\s*[（(](?:警司(?:\s*SP)?|SP)[）)])?$/i, '警司'],
  [/^Assistant Commissioner(?: of Police)?(?:\s*[（(](?:助理处长(?:\s*ACP)?|ACP)[）)])?$/i, '助理处长'],
  [/^Senior Assistant Commissioner(?: of Police)?(?:\s*[（(](?:高级助理处长(?:\s*SACP)?|SACP)[）)])?$/i, '高级助理处长'],
  [/^Deputy Commissioner(?: of Police)?(?:\s*[（(](?:副处长(?:\s*DCP)?|DCP)[）)])?$/i, '副处长'],
  [/^Commissioner of Police(?:\s*[（(](?:警务处长(?:\s*CP)?|CP)[）)])?$/i, '警务处长'],
  [/^Unspecified rank$/i, '职级未明']
];

const exactTermLabels: Record<string, string> = {
  'Royal Hong Kong Police': '皇家香港警察',
  'Mong Kok Police Station': '旺角警署',
  'Mong Kok Police Station（旺角警署）': '旺角警署',
  'Mong Kok Police Station (旺角警署)': '旺角警署',
  'Wan Chai Police Station': '湾仔警署',
  'Wan Chai Police Station（湾仔警署）': '湾仔警署',
  'Wan Chai Police Station (湾仔警署)': '湾仔警署',
  'Yau Ma Tei Police Station': '油麻地警署',
  'Yau Ma Tei Police Station（油麻地警署）': '油麻地警署',
  'Yau Ma Tei Police Station (油麻地警署)': '油麻地警署',
  'North Point Police Station': '北角警署',
  'Chai Wan Police Station': '柴湾警署',
  'Tsim Sha Tsui Police Station': '尖沙咀警署',
  'Central Police Station': '中区警署',
  'Uniform Branch': '军装巡逻',
  'Uniform Branch（军装巡逻）': '军装巡逻',
  'Uniform Branch (军装巡逻)': '军装巡逻',
  'Criminal Investigation Department': '刑事侦缉处（CID）',
  'Criminal Investigation Department（刑事侦缉处 CID）': '刑事侦缉处（CID）',
  'Criminal Investigation Department (刑事侦缉处 CID)': '刑事侦缉处（CID）',
  CID: '刑事侦缉处（CID）',
  'Traffic Branch': '交通部',
  'Police Tactical Unit': '机动部队（PTU）',
  'Emergency Unit': '冲锋队（EU）',
  'Emergency Unit（冲锋队 EU）': '冲锋队（EU）',
  'Emergency Unit (冲锋队 EU)': '冲锋队（EU）',
  'Emergency Unit Hong Kong Island': '港岛总区冲锋队',
  'Emergency Unit Hong Kong Island（港岛总区冲锋队）': '港岛总区冲锋队',
  'Emergency Unit Kowloon East': '东九龙总区冲锋队',
  'Emergency Unit Kowloon East（东九龙总区冲锋队）': '东九龙总区冲锋队',
  'Emergency Unit Kowloon West': '西九龙总区冲锋队',
  'Emergency Unit Kowloon West（西九龙总区冲锋队）': '西九龙总区冲锋队',
  'Emergency Unit New Territories North': '新界北总区冲锋队',
  'Emergency Unit New Territories North（新界北总区冲锋队）': '新界北总区冲锋队',
  'Emergency Unit New Territories South': '新界南总区冲锋队',
  'Emergency Unit New Territories South（新界南总区冲锋队）': '新界南总区冲锋队',
  'Beat Constable': '街面巡逻警',
  'Beat Constable（街面巡逻警）': '街面巡逻警',
  'Beat Constable (街面巡逻警)': '街面巡逻警',
  'Patrol Constable': '巡逻警员',
  'Patrol Sergeant': '巡逻警长（Patrol Sergeant）',
  'Report Room Duty Sergeant': '报案室值班警长（Report Room Duty Sergeant）',
  'Report room supervisor': '报案室主管（Report room supervisor）',
  'Station Supervisor': '警署值班主管（Station Supervisor）',
  'Response Officer': '分区应变巡逻警员',
  'Divisional Response Patrol Officer': '分区应变巡逻警员',
  'Divisional Response Patrol Officer（分区应变巡逻警员）': '分区应变巡逻警员',
  'Emergency Response Officer': '公共秩序支援警员',
  'Public Order Support Officer': '公共秩序支援警员',
  'Public Order Support Officer（公共秩序支援警员）': '公共秩序支援警员',
  'Emergency Vehicle Crew Officer': '冲锋车车组警员',
  'Emergency Vehicle Crew Officer（冲锋车车组警员）': '冲锋车车组警员',
  'Emergency Vehicle Driver': '冲锋车司机',
  'Emergency Vehicle Driver（冲锋车司机）': '冲锋车司机',
  'Emergency Vehicle Commander': '冲锋车车长',
  'Emergency Vehicle Commander（冲锋车车长）': '冲锋车车长',
  'EU Platoon Second-in-Command': '冲锋队小队副指挥',
  'EU Platoon Second-in-Command（冲锋队小队副指挥）': '冲锋队小队副指挥',
  'Probationary EU Platoon Commander': '冲锋队见习小队指挥官',
  'Probationary EU Platoon Commander（冲锋队见习小队指挥官）': '冲锋队见习小队指挥官',
  'EU Platoon Commander': '冲锋队小队指挥官',
  'EU Platoon Commander（冲锋队小队指挥官）': '冲锋队小队指挥官',
  'EU Headquarters Operations Officer': '冲锋队总部行动官',
  'EU Headquarters Operations Officer（冲锋队总部行动官）': '冲锋队总部行动官',
  'Case Officer': '案件负责人',
  'Case Officer（案件负责人）': '案件负责人',
  'Street patrol': '街面巡逻',
  'Station duty and street-level response': '警署值班与街面应对',
  'No active police institution link': '暂无有效警队链条',
  'No active police unit': '暂无有效警队单位',
  'Unspecified station or posting': '驻点未明',
  'Unspecified branch': '部门未明',
  'Unspecified posting': '岗位未明',
  'Direct supervisor': '直属上司',
  'Duty officer': '值日官',
  'Station peers': '同署同僚',
  'Discipline pressure': '纪律压力',
  'Supervisor attitude': '上级态度'
};

const exactSentenceLabels: Record<string, string> = {
  'Adequate service record and time in rank.': '足够的服务记录与本职级年资。',
  'No serious disciplinary stain.': '没有严重纪律污点。',
  'Positive superior evaluation and reliable daily performance.': '上级评价正面，日常表现稳定可靠。',
  'Documented duties, commendations, or useful case participation help but do not guarantee promotion.':
    '有书面勤务记录、嘉奖或有效案件参与会有帮助，但不保证晋升。',
  'Handle routine duties, street-level contact, immediate reports and evidence handover within rank.':
    '可以处理职级范围内的日常勤务、街面接触、即时报告和证物交接。',
  'Report observations and request direction through the local command chain.': '可以经本地指挥链汇报观察并请求指示。',
  'Cannot independently command major cross-district or high-profile investigations beyond rank.':
    '不能独立指挥超出职级的跨区重大案件或高曝光调查。',
  'Cannot bypass superior chain to change force-level decisions.': '不能绕过上级链条改变警队层面的决定。',
  'No police authority is currently active.': '当前没有可用的警务权限。',
  'Cannot use police authority without an active law identity.': '没有有效执法身份时，不能使用警务权限。',
  'The player does not currently hold an active police post.': '玩家当前没有有效警队职务。',
  'No clear disciplinary risk has formed yet.': '暂未形成明确纪律风险。',
  'No formal disciplinary pressure yet.': '暂未记录正式纪律压力。',
  'Superior evaluation is not stable yet.': '上级评价尚未稳定。',
  'Opening reputation is not stable yet.': '开局阶段的警队评价尚未稳定。',
  'Subject to chain of command, complaints, ICAC exposure and internal discipline.':
    '受指挥链、公众投诉、廉署曝光和内部纪律约束。',
  'New or lightly known within the force unless later play establishes otherwise.':
    '在警队内部仍是新人或知名度较低，除非后续剧情另有建立。',
  'Not yet evaluated.': '尚未评估。',
  'No formal disciplinary action recorded.': '未记录正式纪律处分。',
  'Neutral or not yet established.': '中性，或尚未建立明确评价。',
  'Opening record is still thin.': '开局记录仍然很薄。',
  'No formal commendation yet.': '暂无正式嘉奖。',
  'No clear recommendation opportunity yet.': '暂无明确推荐机会。',
  'Ask the direct supervisor what record matters for the next promotion step.': '询问直属上司，下一步晋升最看重哪些记录。',
  'Ask the direct supervisor what performance record matters next.': '询问直属上司，下一步最看重哪些表现记录。',
  'Ask the duty sergeant how promotion recommendations work.': '询问值日警长，晋升推荐通常看哪些记录。',
  'Seek duties where performance can be formally noticed.': '争取能留下正式表现记录的勤务。',
  'Look for duties that can leave a clear written record.': '寻找能留下清楚书面记录的勤务。'
};

const assessmentKeyLabels: Record<string, string> = {
  seniority: '年资',
  discipline: '纪律',
  supervisor: '上级评价',
  performance: '日常表现',
  commendation: '嘉奖',
  opportunity: '机会'
};

export function formatPoliceRank(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return '职级未明';
  for (const [pattern, label] of rankLabels) {
    if (pattern.test(value)) return label;
  }
  return value;
}

export function formatPoliceTerm(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return '未明';
  if (exactTermLabels[value]) return exactTermLabels[value];
  const rank = formatPoliceRank(value);
  return rank !== value ? rank : value;
}

export function formatPoliceAssessmentKey(key: string): string {
  return assessmentKeyLabels[key] ?? key;
}

export function formatPoliceText(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return '未明';
  if (exactSentenceLabels[value]) return exactSentenceLabels[value];
  if (exactTermLabels[value]) return exactTermLabels[value];

  if (value.includes(' / ')) {
    return value
      .split(' / ')
      .map((part) => formatPoliceText(part))
      .join(' / ');
  }

  const rank = formatPoliceRank(value);
  if (rank !== value) return rank;

  const routeMatch = value.match(/^Current visible route: build a credible record at (.+), then seek recommendation toward (.+)\.$/i);
  if (routeMatch) {
    return `当前可见晋升路径：先在${formatPoliceRank(routeMatch[1])}职级留下可靠记录，再争取向${formatPoliceRank(
      routeMatch[2]
    )}晋升的推荐。`;
  }

  if (value === 'Current rank route is not fixed yet; use superior evaluation and formal record to clarify the next step.') {
    return '当前职级路径尚未固定；需要通过上级评价和正式记录确认下一步。';
  }

  const unitSummaryMatch = value.match(/^Currently attached to (.+), (.+); duties are bounded by (.+) and (.+)\.$/i);
  if (unitSummaryMatch) {
    return `当前隶属${formatPoliceTerm(unitSummaryMatch[1])}、${formatPoliceTerm(unitSummaryMatch[2])}；职责边界受${formatPoliceRank(
      unitSummaryMatch[3]
    )}和${formatPoliceTerm(unitSummaryMatch[4])}约束。`;
  }

  return value;
}

import {
  extractArtistTokens,
  extractProtectedPromptTokens,
  tokenizePrompt
} from './artistExtractor';
import type { PngStyleClassification } from './types';

const QUALITY_PATTERNS = [
  /\bmasterpiece\b/iu,
  /\bbest quality\b/iu,
  /\bhigh quality\b/iu,
  /\bhighres\b/iu,
  /\babsurdres\b/iu,
  /\bhighly detailed\b/iu,
  /\bdetailed (?:skin|eyes|face|background)\b/iu,
  /\bsharp focus\b/iu,
  /\bprofessional\b/iu,
  /高质量|杰作|精细|高清/u
];

const STYLE_PATTERNS = [
  /\b(?:cinematic|dramatic|soft|hard|rim|volumetric|natural|studio|ambient) lighting\b/iu,
  /\b(?:soft|painterly|cel|smooth|subtle|realistic) shad(?:ing|ed)\b/iu,
  /\bfilm grain\b/iu,
  /\b(?:anime|manga|illustration|painting|watercolor|oil painting|2\.5d|semi-realistic|photorealistic)\b/iu,
  /\b(?:lineart|line art|brushwork|color palette|color grading|depth of field|bokeh)\b/iu,
  /\b(?:retro|vintage|noir|cyberpunk|art deco)\b/iu,
  /\b(?:soft|muted|vivid|warm|cool|cinematic) colors?\b/iu,
  /电影感|胶片颗粒|柔和阴影|赛璐璐|半写实|写实|插画|油画|水彩|线稿|配色|景深/u
];

const SUBJECT_PATTERNS = [
  /^(?:\d+)?(?:girl|boy|woman|man|person|people|other)s?$/iu,
  /\b(?:black|brown|blonde|red|blue|green|white|silver|pink|purple) (?:hair|eyes|dress|shirt|jacket|skirt|pants)\b/iu,
  /\b(?:long|short|curly|straight|ponytail|bob) hair\b/iu,
  /\b(?:standing|sitting|walking|running|holding|looking|smiling|crying|fighting)\b/iu,
  /\b(?:indoors|outdoors|forest|street|room|office|beach|city|Hong Kong)\b/iu,
  /\b(?:dress|uniform|shirt|blouse|skirt|jacket|coat|suit|jeans|shoes|weapon|sword|gun)\b/iu,
  /女孩|男孩|女人|男人|黑发|白发|金发|长发|短发|裙|制服|衬衫|外套|站立|坐着|街道|房间|森林/u
];

function matchesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase('en-US');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function classifyPngStyleTokens(
  positivePrompt: string,
  negativePrompt: string
): PngStyleClassification {
  const positiveTokens = tokenizePrompt(positivePrompt);
  const negativeTokens = tokenizePrompt(negativePrompt);
  const artistTokens = extractArtistTokens(positiveTokens);
  const protectedValues = new Set(
    extractProtectedPromptTokens(positiveTokens).map((token) => token.value.toLocaleLowerCase('en-US'))
  );
  const artistValues = new Set(artistTokens.map((token) => token.toLocaleLowerCase('en-US')));
  const reusableStyleTokens: string[] = [];
  const qualityTokens: string[] = [];
  const excludedSubjectTokens: string[] = [];
  const unclassifiedTokens: string[] = [];
  for (const token of positiveTokens) {
    const key = token.toLocaleLowerCase('en-US');
    if (artistValues.has(key) || protectedValues.has(key)) continue;
    if (matchesAny(token, QUALITY_PATTERNS)) {
      qualityTokens.push(token);
    } else if (matchesAny(token, STYLE_PATTERNS)) {
      reusableStyleTokens.push(token);
    } else if (matchesAny(token, SUBJECT_PATTERNS)) {
      excludedSubjectTokens.push(token);
    } else {
      unclassifiedTokens.push(token);
    }
  }
  const negativeStyleTokens = negativeTokens.filter((token) =>
    matchesAny(token, QUALITY_PATTERNS) ||
    matchesAny(token, STYLE_PATTERNS) ||
    /\b(?:bad anatomy|bad hands|extra digits|missing fingers|lowres|blurry|watermark|text|logo|signature)\b/iu.test(token)
  );
  return {
    artistTokens,
    reusableStyleTokens: unique(reusableStyleTokens),
    qualityTokens: unique(qualityTokens),
    excludedSubjectTokens: unique(excludedSubjectTokens),
    unclassifiedTokens: unique(unclassifiedTokens),
    negativeStyleTokens: unique(negativeStyleTokens)
  };
}

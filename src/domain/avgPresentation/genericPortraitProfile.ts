import type { Actor } from '../runtime/types';
import type {
  AvgGenericPortraitProfileAdapter,
  GenericPortraitIdentityProfile
} from './types';

function isCurrentRoleProfile(status: string | undefined): boolean {
  return status !== undefined && status !== 'none' && status !== 'retired';
}

function parseVisualAgeAnchor(anchor: string | undefined): {
  visualAge?: number;
  visualAgeBand?: string;
} {
  if (!anchor?.trim()) return {};
  const range = /(\d{1,2})\s*[-~至到]\s*(\d{1,2})/u.exec(anchor);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start >= 16 && end >= start && end <= 99) {
      return {
        visualAge: Math.round((start + end) / 2),
        visualAgeBand: `${start}_${end}`
      };
    }
  }
  const single = /(?:^|\D)(\d{2})(?:\D|$)/u.exec(anchor);
  if (single) {
    const visualAge = Number(single[1]);
    if (visualAge >= 16 && visualAge <= 99) return { visualAge };
  }
  const normalized = anchor.toLocaleLowerCase('en-US');
  if (/teen|少年|少女/u.test(normalized)) return { visualAgeBand: '18_24' };
  if (/young|青年|年轻/u.test(normalized)) return { visualAgeBand: '25_34' };
  if (/middle.?aged|中年/u.test(normalized)) return { visualAgeBand: '35_59' };
  if (/elder|senior|老年|年长/u.test(normalized)) return { visualAgeBand: '60_plus' };
  return {};
}

function ageBandFor(age: number | undefined): string | undefined {
  if (age === undefined || !Number.isFinite(age)) return undefined;
  if (age <= 24) return '18_24';
  if (age <= 34) return '25_34';
  if (age <= 44) return '35_44';
  if (age <= 59) return '45_59';
  return '60_plus';
}

function defaultStructuredRole(actor: Actor): Partial<GenericPortraitIdentityProfile> {
  if (
    actor.currentIdentity === 'police' ||
    isCurrentRoleProfile(actor.roleProfiles.police?.status)
  ) {
    return {
      roleFamily: 'police',
      roleSubtype:
        actor.roleProfiles.police?.postRole ??
        actor.roleProfiles.police?.department ??
        actor.positionSummary,
      roleTier: actor.roleProfiles.police?.rank
    };
  }
  if (
    actor.currentIdentity === 'gang_member' ||
    isCurrentRoleProfile(actor.roleProfiles.triad?.status)
  ) {
    return {
      roleFamily: 'triad',
      roleSubtype: actor.roleProfiles.triad?.roleTitle ?? actor.positionSummary,
      roleTier: actor.roleProfiles.triad?.rankSummary
    };
  }
  return {
    roleFamily: 'civilian',
    roleSubtype:
      actor.roleProfiles.civilian?.occupationGroupId ??
      actor.roleProfiles.civilian?.publicOccupation ??
      actor.positionSummary,
    roleTags: [
      ...(actor.roleProfiles.civilian?.sectorIds ?? []),
      ...(actor.roleProfiles.civilian?.roleTags ?? [])
    ]
  };
}

export function buildGenericPortraitIdentityProfile(
  actor: Actor,
  adapter?: AvgGenericPortraitProfileAdapter
): GenericPortraitIdentityProfile {
  const anchoredAge = parseVisualAgeAnchor(actor.visualAgeAnchor);
  const visualAge = actor.computedAge ?? anchoredAge.visualAge;
  const specialized = adapter?.buildProfile(actor) ?? defaultStructuredRole(actor);
  return {
    gender: actor.gender,
    ...(visualAge !== undefined ? { visualAge } : {}),
    ...(anchoredAge.visualAgeBand || ageBandFor(visualAge)
      ? { visualAgeBand: anchoredAge.visualAgeBand ?? ageBandFor(visualAge) }
      : {}),
    ...specialized,
    demeanor: specialized.demeanor ? [...specialized.demeanor] : undefined,
    stableFeatureTags: specialized.stableFeatureTags
      ? [...specialized.stableFeatureTags]
      : undefined,
    roleTags: specialized.roleTags ? [...specialized.roleTags] : undefined
  };
}

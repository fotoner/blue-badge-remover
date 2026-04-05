import type { BadgeInfo } from '@shared/types';

interface XUserData {
  rest_id?: string;
  is_blue_verified?: boolean;
  verified_type?: string;
  legacy?: {
    verified?: boolean;
    screen_name?: string;
  };
  core?: {
    screen_name?: string;
  };
}

export function parseBadgeInfo(userData: unknown): BadgeInfo | null {
  const data = userData as XUserData;
  if (!data?.rest_id || typeof data.is_blue_verified !== 'boolean') {
    return null;
  }

  const isBusiness = data.verified_type === 'Business';
  const isLegacyVerified = data.legacy?.verified === true;

  // is_blue_verified가 false여도 Business/Legacy 인증이면 non-fadak으로 캐시해야 함
  if (!data.is_blue_verified && !isBusiness && !isLegacyVerified) {
    return null;
  }

  const isBluePremium = data.is_blue_verified && !isBusiness && !isLegacyVerified;
  const handle = data.legacy?.screen_name ?? data.core?.screen_name ?? null;

  return {
    userId: data.rest_id,
    handle,
    isBluePremium,
    isLegacyVerified,
    isBusiness,
  };
}

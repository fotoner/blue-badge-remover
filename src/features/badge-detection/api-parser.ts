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

  // verified_type이 존재하면 기관 인증 (Business, Government 등 모든 타입 포함)
  const hasVerifiedType = !!data.verified_type;
  const isLegacyVerified = data.legacy?.verified === true;

  // is_blue_verified가 false여도 기관/레거시 인증이면 non-fadak으로 캐시해야 함
  if (!data.is_blue_verified && !hasVerifiedType && !isLegacyVerified) {
    return null;
  }

  // 파딱 = is_blue_verified가 true이면서 기관 인증도 아니고 레거시 인증도 아닌 계정
  const isBluePremium = data.is_blue_verified && !hasVerifiedType && !isLegacyVerified;
  const handle = data.legacy?.screen_name ?? data.core?.screen_name ?? null;

  return {
    userId: data.rest_id,
    handle,
    isBluePremium,
    isLegacyVerified,
    isBusiness: hasVerifiedType,
  };
}

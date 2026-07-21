import type { ProfileInfo } from '@shared/types';

const MAX_ACCOUNT_AGE_DAYS = 183;
const MIN_FOLLOWERS = 1_000;
const MAX_FOLLOWING_TO_FOLLOWERS_RATIO = 0.1;
const DAY_MS = 24 * 60 * 60 * 1_000;

export function isAggressorProfile(profile: ProfileInfo, now = Date.now()): boolean {
  if (
    profile.createdAt === undefined ||
    profile.followersCount === undefined ||
    profile.followingCount === undefined
  ) return false;
  const createdAt = Date.parse(profile.createdAt);
  if (!Number.isFinite(createdAt) || createdAt > now) return false;
  const ageDays = (now - createdAt) / DAY_MS;
  if (ageDays > MAX_ACCOUNT_AGE_DAYS || profile.followersCount < MIN_FOLLOWERS) return false;
  return profile.followingCount / profile.followersCount <= MAX_FOLLOWING_TO_FOLLOWERS_RATIO;
}

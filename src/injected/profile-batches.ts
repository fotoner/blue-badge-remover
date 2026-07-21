const MAX_PROFILE_MESSAGE_BATCH = 1000;

export function splitProfileBatches<T>(profiles: T[]): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < profiles.length; index += MAX_PROFILE_MESSAGE_BATCH) {
    batches.push(profiles.slice(index, index + MAX_PROFILE_MESSAGE_BATCH));
  }
  return batches;
}

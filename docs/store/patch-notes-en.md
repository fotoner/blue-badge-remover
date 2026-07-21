# Blue Badge Remover v1.6.0 Patch Notes

## New features

- Add multiple whitelist handles at once and collapse long whitelist views
- Add an account to the whitelist directly from a collapsed hidden post
- Export and import whitelist, custom filter, and protection lists as validated JSON
- Protect accounts by keywords found in their handle, display name, or bio
- Optionally include new high-reach accounts in selective filtering

## Reliability

- Prevent follow detection storms and bound React fiber scanning work
- Preserve scroll height during browser history restoration
- Reduce background observers and writes when related features are disabled
- Deduplicate hidden-post statistics by post status path
- Fix quote badge scope, follow exceptions, and current-account recovery

## Maintenance

- Remove the unused API badge cache and stale exports
- Split oversized options and content modules
- Add ESLint gates for unsafe types, direct console use, and file/function size
- Expand the suite to 486 passing tests

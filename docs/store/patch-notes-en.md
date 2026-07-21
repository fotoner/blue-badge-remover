# Blue Badge Remover v1.6.0 Patch Notes

## New features

- Add multiple IDs at once from the whitelist page using line breaks, spaces, or commas, and collapse the saved-account list
- Expand a hidden post, then whitelist its author or collapse it again from inside the post
- Export and import whitelist, custom filter, and protection keywords as validated JSON
- Add a `Protection Keywords` field to Advanced Filter Settings. Enter one keyword per line to keep paid-badge accounts visible when their ID, name, or profile bio contains that word
- Optionally hide new high-reach accounts created within six months with at least 1,000 followers and a following-to-follower ratio of 10% or less

## Accuracy and reliability

- Scope blue-badge detection to the author area to reduce false positives from quoted posts
- Use information X already loads for the timeline together with on-screen state to improve follow detection, including on list timelines
- Strengthen exceptions for reposts, quoted posts, your own posts, and whitelisted accounts
- Normalize whitelist handles to lowercase and migrate existing data automatically
- Run keyword filtering and the new high-reach account filter independently
- Preserve scroll height during browser history restoration and prevent duplicate hidden-post statistics
- Place expanded-post controls in the content column above X's native action bar
- Reduce unnecessary observer work and storage writes

## Settings and maintenance

- Make milestone celebration banners opt-in and disabled by default
- Split oversized options and content modules, and remove the unused API badge cache
- Add ESLint rules for unsafe types, direct console use, and excessive file or function size
- Verify the release with Chrome, Firefox, and Edge builds plus 502 tests

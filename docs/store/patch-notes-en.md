# Blue Badge Remover v1.6.0 Patch Notes

## New features

- Add multiple accounts to the whitelist at once and collapse long whitelist views
- Expand a hidden post, then whitelist its author or collapse it again from inside the post
- Export and import whitelist, custom filter, and protection keywords as validated JSON
- Protect accounts by keywords found in their handle, display name, or bio
- Optionally hide new high-reach accounts created within six months with at least 1,000 followers and a following-to-follower ratio of 10% or less

## Accuracy and reliability

- Scope blue-badge detection to the author area to reduce false positives from quoted posts
- Combine X API, React fiber, and DOM signals to improve follow detection, including on list timelines
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
- Verify the release with Chrome, Firefox, and Edge builds plus 496 tests

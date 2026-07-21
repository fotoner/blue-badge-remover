# Blue Badge Remover v1.6.0 Patch Notes

This update improves protection for accounts that should stay visible and makes it easier to add exceptions when you need them.

## More accurate hiding

- Check only the post author's blue badge, reducing cases where a regular account was hidden because of a quoted post
- Improve exceptions for followed accounts, your own posts, reposts, quoted posts, and whitelisted accounts
- Improve follow detection on list timelines so followed accounts remain visible there as well
- After expanding a collapsed post, whitelist its author or collapse the post again from inside the post

## New filter settings

- Turn on **Hide new high-reach accounts** separately under `Dashboard → Filters`. It hides blue-badge accounts created within six months that have at least 1,000 followers and a following-to-follower ratio of 10% or less
- This setting works independently from the keyword filter. When both are enabled, an account is hidden when either filter matches
- A new **Protection Keywords** field is available under `Dashboard → Filters → Advanced Filter Settings`. Enter one keyword per line to keep accounts visible when their handle, display name, or bio contains that word
- Protection keywords are a separate protection list, not new custom-filter syntax

## Whitelist and backup

- Add multiple handles at once from the whitelist page, separated by line breaks, spaces, or commas
- Collapse the saved whitelist when the list gets long
- Export and import your whitelist, custom filters, and protection keywords in one JSON file
- Existing whitelist entries are cleaned up automatically, while your search scope, custom filters, and other saved settings remain unchanged

## Other improvements

- Reduce large scroll jumps when returning to the timeline with the browser's Back button
- Prevent the same hidden post from being counted more than once in statistics
- Milestone celebration banners are now off by default and can be enabled in settings

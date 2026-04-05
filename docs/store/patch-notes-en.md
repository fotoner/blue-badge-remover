# Blue Badge Remover v1.4.0 Patch Notes

## New Features

- Unified dashboard: view hide stats, settings, and filter management in one place
- Real-time tracking of hidden paid-badge tweets
- Celebration banner at 100/500/1K/5K/10K milestones
- Built-in filter packs by topic (politics, crypto/finance, aggro)
- Hidden tweets now show why they were hidden (category tag)
- Tweet detail pages show a red warning banner instead of hiding
- Add accounts to whitelist directly from the banner
- Expanded tweets stay visible even after scrolling away
- List page filtering added (toggleable in settings)

## Improvements

- Popup simplified to toggle + mini stats + settings link
- Consistent design system applied across popup, dashboard, and options
- Hide stats now use local timezone for accurate daily counts
- Filter pack changes in options page apply instantly to open tabs
- Excessive wildcards in filter rules are handled safely

## Bug Fixes

- Fixed gold badge (business) accounts being incorrectly hidden
- Reduced flicker when scrolling through paid-badge tweets
- Fixed followed accounts' self-quotes being hidden
- Fixed hidden tweets not restoring after settings changes
- Fixed wrong author detection on reply detail pages with quotes
- Removed unnecessary DOM operations on non-hidden tweets

## Security

- Blocked data leak path to external iframes (postMessage hardening)
- Minimized extension permission scope
- Removed HTML injection vulnerability

## Infrastructure

- Migrated to WXT framework: Chrome, Firefox, and Edge support
- 340 tests for stability verification
- Automated build and deploy via GitHub Actions CI/CD

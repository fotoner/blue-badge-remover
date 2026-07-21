# Chrome Web Store listing — English

## Product details

**Name:** Blue Badge Remover

**Summary (100/132 characters):**

> Hide paid blue badge posts on X while keeping followed, whitelisted, and protected accounts visible.

**Category:** Social & Communication

**Language:** English

## Detailed description

Blue Badge Remover cleans up your X timeline by hiding posts from paid blue badge accounts while keeping the people and topics you trust visible.

Key features:

- Detects paid blue badges without hiding gold organization or gray government verification.
- Keeps accounts you follow visible, with automatic detection and full following-list sync.
- Supports bulk whitelist entry and one-click exclusions from collapsed posts.
- Selectively filters by built-in, custom, or imported keyword packs.
- Protects accounts whose handle, display name, or bio contains your favorite people, genres, or communities.
- Optionally includes new high-reach accounts in selective mode using local profile metadata.
- Handles retweets and quote posts separately across timeline, replies, search, bookmarks, and lists.
- Exports and imports whitelist, custom filter, and protection lists as validated JSON.
- Stores settings and statistics locally. No analytics, external server, or authentication token storage.
- Supports English, Korean, and Japanese on Chrome, Edge, Firefox, and Firefox for Android.

The extension changes only what is displayed in your browser. It does not post, like, follow, or modify content on X.

Source code and support: https://github.com/fotoner/blue-badge-remover

## Graphic assets

Upload in this order after generating from `docs/store/screenshots.html`:

1. `screenshots/en/01-hero.png`
2. `screenshots/en/02-before-after.png`
3. `screenshots/en/03-features.png`
4. `screenshots/en/04-privacy.png`

Each image is 1280x800 PNG with square corners and no outer padding.

## Privacy fields

**Privacy Policy URL:** https://github.com/fotoner/blue-badge-remover/blob/dev/docs/PRIVACY.md

The dashboard disclosure must match `docs/PRIVACY.md`: X website content, account identifiers/profile metadata, follow relationships, user-authored filter lists, and local usage statistics are processed locally. No data is transmitted to the developer or third parties.

Permission justifications:

- `storage`: Saves settings, whitelist, filters, and local statistics.
- `unlimitedStorage`: Keeps large following lists and opt-in keyword collection without quota loss.
- `x.com` and `twitter.com` host access: Reads author badges, posts, profile metadata, and follow signals needed for the extension's single filtering purpose.

## Submission status

- [x] English summary and detailed description prepared
- [x] Four 1280x800 screenshot sources prepared
- [x] Privacy policy updated locally and the `dev` branch URL resolves publicly
- [ ] Commit and push the updated privacy policy so the public URL matches this release
- [ ] Upload text/assets and save the Web Store dashboard listing
- [ ] Confirm Privacy practices disclosures and Limited Use certification in the dashboard

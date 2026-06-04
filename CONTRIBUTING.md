# Contributing

Blue Badge Remover is maintained as a privacy-first browser extension for real store users. Keep changes small, testable, and aligned with the existing feature-based architecture.

## Issue Triage

When opening an issue, include:

- browser and version: Chrome, Firefox, Firefox Android, or Edge
- extension version
- affected X page: timeline, replies, search, bookmarks, profile, or mobile
- expected behavior and actual behavior
- screenshot or short screen recording when the bug is visual
- whether the account is followed or manually whitelisted

Maintainers triage issues by severity and reproducibility:

| Priority | Meaning |
|----------|---------|
| High | privacy/security issue, store-breaking regression, or core filtering failure |
| Medium | reproducible false positive/negative, browser compatibility issue |
| Low | copy, UI polish, docs, or feature request |

## Pull Requests

Before opening a PR:

1. Add or update a failing test first when changing behavior.
2. Keep the diff scoped to one intent.
3. Run `npm ci`, `npm test`, `npm run build`, and `npm audit` when dependency or release code changes.
4. Avoid new host permissions unless the PR explains why they are necessary.
5. Do not add analytics, telemetry, or external data transmission.

PRs are reviewed against [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md) before squash merge into `dev`.

## Release Management

Releases are tag-driven. A `v*` tag runs CI, builds Chrome/Firefox/Edge artifacts, creates a GitHub Release, and submits to configured stores. Test releases use a `-test` suffix and skip store submission.

See [docs/STORE_SETUP.md](docs/STORE_SETUP.md) and [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## Security

For vulnerabilities or permission concerns, follow [SECURITY.md](SECURITY.md). Please do not publish exploit details in a public issue before the maintainer has had time to assess.

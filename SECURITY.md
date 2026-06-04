# Security Policy

Blue Badge Remover is a client-side browser extension. It does not run a backend service, does not use analytics, and does not transmit user data to external servers.

## Supported Versions

Security fixes target the latest published release on Chrome Web Store, Firefox Add-ons, and GitHub Releases.

## Reporting a Vulnerability

For suspected vulnerabilities:

1. Do not include exploit details in a public issue.
2. Use GitHub private vulnerability reporting if it is available for this repository.
3. If private reporting is unavailable, contact the maintainer first through the support channel listed on the store listing or [@fotoner_p](https://x.com/fotoner_p).

Please include the affected browser, extension version, impact, and the minimum reproduction steps.

## Security Model

- No external server receives extension data.
- No analytics, telemetry, or third-party SDK is used.
- No authentication token, credential, cookie, or CSRF token is stored by the extension.
- Settings, follow handles, whitelist handles, filter rules, and opt-in keyword statistics stay in `chrome.storage.local`.
- Host permissions are limited to X/Twitter domains required for local page processing.

More detail: [docs/SECURITY.md](docs/SECURITY.md), [docs/PRIVACY.md](docs/PRIVACY.md), [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

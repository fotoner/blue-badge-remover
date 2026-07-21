# Privacy Policy — Blue Badge Remover

*Last updated: 2026-07-22*

## Overview

Blue Badge Remover is a browser extension that hides paid Twitter Blue badge accounts on X (formerly Twitter). This privacy policy explains what data the extension accesses and how it is handled.

## Local Data Handling

**Blue Badge Remover does not transmit or store personal data on external servers.** It handles X page content and account metadata locally to provide filtering.

All data processing happens entirely within your browser.

## Data Accessed Locally

The extension accesses the following data, stored only in your browser's local storage (`chrome.storage.local`):

| Data | Purpose | Stored Where |
|------|---------|--------------|
| Extension settings | Your filter preferences (toggle states, hide mode, etc.) | Browser local storage |
| Follow list | Accounts you follow, to exclude them from filtering | Browser local storage |
| Whitelist | Accounts you manually added to never hide | Browser local storage |
| Keyword filter rules | Custom keywords for selective filtering | Browser local storage |
| Protection keywords | Words used to keep matching accounts visible | Browser local storage |
| X profile metadata | Account handle, display name, bio, creation date, and follow counts used for local exception and optional selective filtering | In-memory cache; not transmitted |
| Collected fadak data | Keyword frequency data for analysis (opt-in) | Browser local storage |

## Network Access

The extension reads X (Twitter) page content and intercepts X API responses **within your browser** to detect badges, profile information, and follow relationships. It does **not**:

- Send any data to external servers
- Make any network requests of its own
- Use analytics or tracking services
- Share data with third parties

## Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Save your settings and filter data locally |
| `unlimitedStorage` | Store follow lists and collected data without size limits |
| Host permissions (`x.com`, `twitter.com`) | Read page content to detect and hide badge accounts |

## Data Deletion

In-memory data is cleared when the page or browser session ends. Locally stored extension data is deleted when you uninstall the extension. Follow data and whitelist entries can also be removed through the extension UI.

## Limited Use

Information accessed by the extension is used only to provide its user-facing filtering, exception, backup, and local statistics features. It is not sold, transferred for advertising, used for credit decisions, or made available for human review. This use complies with the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/fotoner/blue-badge-remover

## Contact

For privacy concerns or questions, please open an issue on GitHub:
https://github.com/fotoner/blue-badge-remover/issues

# Privacy Policy — Blue Badge Remover

*Last updated: 2026-04-04*

## Overview

Blue Badge Remover is a browser extension that hides paid Twitter Blue badge accounts on X (formerly Twitter). This privacy policy explains what data the extension accesses and how it is handled.

## Data Collection

**Blue Badge Remover does not collect, transmit, or store any personal data on external servers.**

All data processing happens entirely within your browser.

## Data Accessed Locally

The extension accesses the following data, stored only in your browser's local storage (`chrome.storage.local`):

| Data | Purpose | Stored Where |
|------|---------|--------------|
| Extension settings | Your filter preferences (toggle states, hide mode, etc.) | Browser local storage |
| Follow list | Accounts you follow, to exclude them from filtering | Browser local storage |
| Whitelist | Accounts you manually added to never hide | Browser local storage |
| Keyword filter rules | Custom keywords for selective filtering | Browser local storage |
| Collected fadak data | Keyword frequency data for analysis (opt-in) | Browser local storage |

## Network Access

The extension intercepts X (Twitter) API responses **within your browser** to detect badge status and profile information. It does **not**:

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

All extension data is automatically deleted when you uninstall the extension. You can also manually clear data via the popup's "Clear Follow Cache" button.

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/fotoner/blue-badge-remover

## Contact

For privacy concerns or questions, please open an issue on GitHub:
https://github.com/fotoner/blue-badge-remover/issues

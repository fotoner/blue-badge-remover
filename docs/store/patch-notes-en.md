# Blue Badge Remover v1.8.2 Patch Notes

## Changes

- Paid badge retweets by accounts you follow now follow the "Hide Paid Badge Retweets" setting. To see them, turn the setting off or add the retweeter to your whitelist
- "Hide Entire Tweet" for quotes now hides the whole tweet even when the quoter is someone you follow, including when keyword or new high-reach filtering is on. To hide only the quote, choose "Hide Quote Only" or add the quoter to your whitelist
- X tabs that were already open before you installed or updated need a reload before filtering works. The popup now shows a reload prompt, and on Chrome and Edge the X page does too
- The "Home Timeline" filter scope now shows that it covers both the For you and Following tabs

## Fix

- Fix misreading the quoted account when its display name contains "@" (for example "Name@C105"), which broke follow and whitelist exceptions and self-quote detection
- Fix quote cards already on screen keeping their hidden state after you followed or unfollowed someone, until you moved to another page

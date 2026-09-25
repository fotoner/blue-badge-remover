# Blue Badge Remover v1.6.1 Patch Notes

This update fixes the whitelist features announced in v1.6.0 that did not actually ship, and resolves several stability issues in settings, statistics, and filters.

## Whitelist

- Add multiple handles at once on the whitelist page, separated by line breaks, spaces, or commas. This was announced in v1.6.0 but was not applied to the actual page
- In the input field, Enter adds a new line and `Ctrl+Enter` (`⌘+Enter` on Mac) adds the handles
- Collapse the list of saved accounts
- Fix the "Collapse again" button remaining after whitelisting an author from an expanded post, which hid the post again when clicked

## Settings and backup

- Fix settings changed in Advanced Filter Settings reverting while the dashboard or popup was open
- Importing filter lists now shows how many items will be replaced, asks for confirmation, and displays the result
- Fix some headings and buttons staying in Korean when the dashboard is set to English or Japanese
- Follow sync status now updates while the dashboard is open

## Stability

- Fix the X tab freezing for several seconds with filter packs that contain many wildcards (`*`)
- Wildcard rules now also match across multi-line profile bios
- Fix some hidden-post statistics being dropped, and statistics being kept for 29 days instead of 30
- Fix follow-list entries that could be lost when saves overlapped

## Other

- Update the default filter list. Thanks to our contributor
- Improve the release process so Firefox and Edge receive the latest version as well

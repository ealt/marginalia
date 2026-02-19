# Changelog

All notable changes to Marginalia are documented here.

## 0.1.1

Patch release.

- Fix panel action behavior when the comments panel has focus
- `Jump`, `Edit`, `Resolve`, and `Delete` now correctly target the active note's markdown editor from the panel
- Prevent panel fallback to "Open a markdown note to view comments" during panel-initiated actions

## 0.1.0

Initial release.

- Add, edit, resolve, and delete inline comments on selected text
- Editor highlights with separate unresolved/resolved styling
- Inline comment icon widgets in the editor for quick access
- Sidebar comments panel with per-comment jump, edit, resolve/unresolve, and delete actions
- Jump-to-comment selection and scroll behavior from panel actions
- Command palette commands: `Add comment` and `Toggle comments panel`
- Editor context-menu action to add comments from the current selection
- Ribbon icon to toggle the comments panel
- Optional best-effort reading mode highlighting
- Settings: author name, highlight colors, reading mode toggle
- Paired HTML comment marker format invisible to standard renderers
- Comment metadata includes ID, author, timestamp, and resolved state
- Safe serialization that escapes literal `-->` sequences in payload JSON
- Robust parser with malformed marker validation
- CI workflow (type-check, test, build) and release automation

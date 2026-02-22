# Changelog

All notable changes to Marginalia are documented here.

## Unreleased

- Add CriticMarkup interoperability:
  - Export Marginalia comments to CriticMarkup tokens, including child replies
    (`{==text==}{>>parent<<}{>>child<<}`)
  - Import CriticMarkup back into Marginalia markers with sidecar-assisted
    metadata restoration
  - Import standalone CriticMarkup comments (`{>>comment<<}`) as zero-length
    Marginalia anchors
- Add sidecar metadata files (`.critmeta.json`) to preserve and remap
  `id`/`author`/`ts`/`resolved`/`children` during round-trips
- Add command-palette commands:
  - `Export active note to CriticMarkup`
  - `Import active note from CriticMarkup`
- Add CLI commands:
  - `npm run interop:export -- path/to/note.md`
  - `npm run interop:import -- path/to/note.md`
- Add interop test coverage for range threads, standalone comments, sidecar
  mapping, and malformed token diagnostics
- Update agent instructions to require changelog updates for user-visible
  changes

## 0.2.1

Patch release.

- Fix Obsidian plugin-guideline compliance warnings by removing direct
  `workspace.activeLeaf` usage in favor of markdown-view leaf resolution
- Replace JavaScript body style mutation with a managed dynamic stylesheet for
  highlight color variables
- Add README disclosures for `git config user.name` author fallback, local data
  storage, and network behavior

## 0.2.0

Minor feature release.

- Make comment cards clickable (no separate `Jump` button) and keep panel
  selection synchronized with document navigation
- Default new comment author to `git config user.name` when the Author name
  setting is blank (fallback: `Unknown`)
- Improve selected-comment contrast in editor and reading mode highlights
- Allow selecting comments by clicking highlighted text in editor/reading mode
- Restrict edit/delete to the original author, and hide those actions for other
  users in the panel
- Add threaded replies as child comments on each top-level comment
- Expand child replies only when a thread is selected
- Add inline reply composer at the bottom of expanded threads
- Disallow reply-to-reply and resolve-on-reply actions
- Refresh project documentation (README, CONTRIBUTING, AGENTS, CHANGELOG)

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

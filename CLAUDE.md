# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Marginalia is an Obsidian plugin that adds Google Docs-style inline comments to markdown documents. Comments are stored as paired HTML comment markers invisible to standard markdown renderers.

## Commands

```bash
npm run build       # Production bundle → main.js
npm run dev         # Watch mode with inline sourcemaps
npm run check       # TypeScript type-check (no emit)
npm run test        # Unit tests (Vitest)
npm run test:watch  # Tests in watch mode
```

Run a single test file: `npx vitest run tests/commentParser.test.ts`

## Architecture

**Entry point:** `src/main.ts` → bundled by esbuild to `main.js` (CJS, ES2018 target). Obsidian, electron, and CodeMirror packages are externalized (not bundled).

### Module Responsibilities

- **`src/main.ts`** — `CommentsPlugin extends Plugin`. Registers commands, editor extension, sidebar view, context menu, ribbon icon. Contains all comment CRUD methods (add/edit/resolve/delete/jump). Manages `activeCommentId` state for sidebar highlighting.
- **`src/commentParser.ts`** — Pure functions with no Obsidian dependencies. Regex-based parsing of paired markers, JSON serialization with `-->` escape (`--\u003e`), ID generation, strict validation. This is the only module with unit tests.
- **`src/editorExtension.ts`** — CodeMirror 6 `ViewPlugin`. Re-parses on every `docChanged`, creates three decorations per comment: replace (hide start marker), mark (highlight text), replace with `CommentIconWidget` (end marker → clickable icon). Click dispatches `marginalia-icon-click` custom event.
- **`src/commentPanel.ts`** — `CommentPanelView extends ItemView`. Sidebar listing all comments with preview text, metadata, and action buttons. Redraws on active-leaf-change and after comment operations.
- **`src/commentModal.ts`** — Simple `Modal` with textarea for add/edit flows. Cmd/Ctrl+Enter submits.
- **`src/postProcessor.ts`** — `MarkdownPostProcessor` for best-effort reading mode highlighting via DOM `TreeWalker`. Secondary to editor mode.
- **`src/settings.ts`** — Settings tab: author name, highlight colors (updates CSS custom properties), reading mode toggle.
- **`src/types.ts`** — Interfaces: `Comment`, `CommentWithPosition`, `ParseCommentsResult`, `CommentsPluginSettings`.

### Comment Marker Format

```
<!-- marginalia-start: ID -->annotated text<!-- marginalia: {JSON payload} -->
```

Start marker has only the ID; end marker carries the full JSON. The `-->` sequence in JSON is escaped as `--\u003e` during serialization. The parser regex captures everything between `marginalia:` and `-->` as the payload, then runs `JSON.parse()`.

### Key Conventions

- Styles use CSS custom properties (`--marginalia-highlight-color`, `--marginalia-highlight-color-resolved`) and Obsidian theme variables for compatibility.
- Invalid/malformed marker pairs are silently skipped during parsing and surfaced to the user via Obsidian `Notice`.
- No overlapping comments are supported (V1 limitation).
- Reading mode highlighting is best-effort; editor mode is the primary experience.

## Testing

Tests live in `tests/` and use Vitest. Currently only `commentParser.ts` has unit tests covering parsing, serialization, escaping, validation, and ID generation. The parser module is pure functions with no Obsidian dependencies, making it directly testable.

## CI/CD

- **CI** (`.github/workflows/ci.yml`): On push/PR → install, type-check, test, build.
- **Release** (`.github/workflows/release.yml`): On `v*` tag → validates version matches `manifest.json`, builds zip with `manifest.json`, `main.js`, `styles.css`, `versions.json`.

## Local Testing in Obsidian

Build with `npm run build`, then copy `manifest.json`, `main.js`, and `styles.css` to a vault's `.obsidian/plugins/marginalia/` directory and enable the plugin.

# AGENTS.md

This is the single source of truth for AI agents working in this repository.
Human-facing contribution guidelines are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Project Overview

Marginalia is an Obsidian plugin that adds Google Docs-style inline comments to
markdown documents. Comments are stored as paired HTML comment markers invisible
to standard markdown renderers.

**License:** MIT | **Author:** Eric Alt

## Commands

```bash
npm install             # Install dependencies (Node.js 22+, npm 10+)
npm run build           # Production bundle → main.js
npm run dev             # Watch mode with inline sourcemaps
npm run check           # TypeScript type-check (tsc --noEmit)
npm run test            # Unit tests (Vitest)
npm run test:watch      # Tests in watch mode
npm run lint:plugin     # Obsidian community plugin lint
npm run version-bump patch  # Bump version (also: minor, major, or x.y.z)
```

Run a single test file: `npx vitest run tests/commentParser.test.ts`

Pre-PR validation: `npm run check && npm run test && npm run build`

## Architecture

**Entry point:** `src/main.ts` → bundled by esbuild to `main.js` (CJS, ES2018
target). Obsidian, electron, and CodeMirror packages are externalized.

### Project Structure

```
src/
├── main.ts            — Plugin entry, commands, comment CRUD
├── types.ts           — Comment, CommentWithPosition, Settings interfaces
├── commentParser.ts   — Pure parsing/serialization (no Obsidian deps)
├── editorExtension.ts — CM6 ViewPlugin: highlights, marker hiding, icon widget
├── commentPanel.ts    — Sidebar ItemView listing all comments
├── commentModal.ts    — Modal for add/edit comment text
├── postProcessor.ts   — Reading mode highlighting via DOM TreeWalker
└── settings.ts        — Settings tab: author, colors, reading mode toggle
tests/
└── commentParser.test.ts — Parser unit tests
```

Release artifacts: `main.js`, `manifest.json`, `styles.css`, `versions.json`

### Module Responsibilities

- **`main.ts`** — `CommentsPlugin extends Plugin`. Registers commands, editor
  extension, sidebar view, context menu, ribbon icon. Contains all comment CRUD
  methods (add/edit/resolve/delete/jump). Manages `activeCommentId` state for
  sidebar highlighting.
- **`commentParser.ts`** — Pure functions. Regex-based parsing of paired
  markers, JSON serialization with `-->` escape (`--\u003e`), ID generation,
  strict validation. Only module with unit tests.
- **`editorExtension.ts`** — CodeMirror 6 `ViewPlugin`. Re-parses on every
  `docChanged`, creates three decorations per comment: replace (hide start
  marker), mark (highlight text), replace with `CommentIconWidget` (end marker →
  clickable icon). Click dispatches `marginalia-icon-click` custom event.
- **`commentPanel.ts`** — `CommentPanelView extends ItemView`. Sidebar listing
  all comments with preview text, metadata, and action buttons. Redraws on
  active-leaf-change and after comment operations.
- **`commentModal.ts`** — Simple `Modal` with textarea for add/edit flows.
  Cmd/Ctrl+Enter submits.
- **`postProcessor.ts`** — `MarkdownPostProcessor` for best-effort reading mode
  highlighting via DOM `TreeWalker`. Secondary to editor mode.
- **`settings.ts`** — Settings tab: author name, highlight colors (updates CSS
  custom properties), reading mode toggle.
- **`types.ts`** — Interfaces: `Comment`, `CommentWithPosition`,
  `ParseCommentsResult`, `CommentsPluginSettings`.

### Comment Marker Format

```
<!-- marginalia-start: ID -->annotated text<!-- marginalia: {JSON payload} -->
```

Start marker has only the ID; end marker carries the full JSON. The `-->`
sequence in JSON is escaped as `--\u003e` during serialization. The parser regex
captures everything between `marginalia:` and `-->` as the payload, then runs
`JSON.parse()`.

### Key Conventions

- Styles use CSS custom properties (`--marginalia-highlight-color`,
  `--marginalia-highlight-color-resolved`) and Obsidian theme variables.
- Invalid/malformed marker pairs are silently skipped during parsing and
  surfaced to the user via Obsidian `Notice`.
- No overlapping comments (V1 limitation).
- Reading mode highlighting is best-effort; editor mode is the primary
  experience.

## Coding Style

- **Language:** TypeScript with strict compiler settings (`strict`,
  `noImplicitAny`, `strictNullChecks`).
- **Formatting:** 2-space indentation, semicolons, double quotes.
- **Naming:** `camelCase` for variables/functions, `PascalCase` for
  classes/types, `UPPER_SNAKE_CASE` for constants.
- **Files:** Lower camelCase in `src/` (e.g., `commentParser.ts`).
- Keep modules focused and small; prefer explicit types over `any`.

## Testing

Tests live in `tests/` and use Vitest. Currently only `commentParser.ts` has
unit tests covering parsing, serialization, escaping, validation, and ID
generation. The parser module is pure functions with no Obsidian dependencies,
making it directly testable.

- Use clear `describe`/`it` names that state behavior and edge cases.
- Add tests for parser/serialization changes and malformed marker handling.

## Commit & PR Conventions

- Short, imperative, sentence-case subjects (e.g., `Refactor comment modal
  styles and structure`).
- Keep commits focused; avoid mixing refactors with feature changes.
- PRs should include: concise summary, linked issues, validation steps,
  screenshots for UI changes.

## CI/CD

- **CI** (`.github/workflows/ci.yml`): On push/PR → install, type-check, test,
  build.
- **Release** (`.github/workflows/release.yml`): Manual `workflow_dispatch` →
  reads version from `manifest.json`, creates git tag, builds, publishes GitHub
  release with `main.js`, `manifest.json`, `styles.css` as individual assets.
  Typical flow: `npm run version-bump patch`, commit, push, then click "Run
  workflow" in GitHub Actions.

## Obsidian Community Plugin Rules

`npm run lint:plugin` checks common rejection reasons. Key rules:

- **Naming**: id/name/description must not contain "Obsidian" or end with
  "Plugin"
- **Settings tabs**: no top-level headings (`<h1>`/`<h2>`)
- **No `detachLeavesOfType` in `onunload`** — Obsidian handles cleanup
- **No inline styles** — use CSS classes
- **No `innerHTML`/`outerHTML`** — use `createEl`/`createDiv`
- **No `console.log`** — only `console.error`/`console.warn` for actual errors
- **No default hotkeys** in command definitions
- **Use `this.app`** not global `app`; **use `getActiveViewOfType()`** not
  `workspace.activeLeaf`

## Local Testing in Obsidian

Build with `npm run build`, then copy `manifest.json`, `main.js`, and
`styles.css` to a vault's `.obsidian/plugins/marginalia/` directory and enable
the plugin.

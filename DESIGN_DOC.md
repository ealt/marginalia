# Obsidian Comments Plugin — Implementation Plan (Historical)

> Status (current): this document is the original V1 plan. The implemented
> plugin now includes additional behavior (threaded child replies, inline thread
> reply composer, author-based edit/delete permissions, and panel/document
> selection sync). Use `README.md`, `CONTRIBUTING.md`, and `AGENTS.md` for
> current behavior.

## Context

Build an Obsidian plugin from scratch that lets users add comments to document text, similar to Google Docs commenting. Comments are stored as HTML comments in the markdown so they're invisible in any renderer outside Obsidian. The project directory (`/Users/ericalt/Documents/obsidian-comments`) is currently empty.

**V1 scope**: Add/edit/delete/resolve comments, editor highlighting, sidebar panel, configurable reading mode visibility.
**Deferred (original plan)**: Threading/replies, emoji reactions, hover tooltips.
**Implemented since this plan**: Threaded replies in `children`, inline reply
composer in expanded threads, permission checks, and improved selection syncing.

---

## Comment Format

Paired HTML comment markers bracket the annotated text:

```markdown
Text before <!-- marginalia-start: a1b2c3 -->annotated text<!-- marginalia: {"v":1,"id":"a1b2c3","text":"Is this accurate?","author":"Eric","ts":1708300000,"resolved":false,"children":[{"id":"r9k2m1z8","text":"I agree","author":"Riley","ts":1708300300}]} --> text after
```

**Why paired markers?** The start marker pins the beginning of the highlighted range. This survives text edits between the markers, avoids ambiguity with duplicate text, and is invisible in all standard markdown renderers. The start marker is lightweight (just the ID); the end marker carries the full JSON payload.

**Robustness + readability rule**: Keep payload human-readable JSON, but escape only the literal HTML comment terminator sequence inside serialized payload text:

- On serialize: replace all `-->` in the JSON string with `--\u003e`
- On parse: normal `JSON.parse()` restores original text semantics
- Do **not** escape normal `<`, `>`, `<-`, or `->`

---

## Project Structure

```
obsidian-comments/
├── manifest.json          — Plugin metadata
├── package.json           — Dependencies & scripts
├── tsconfig.json          — TypeScript config
├── esbuild.config.mjs     — Build config (from official sample plugin)
├── .gitignore
├── styles.css             — All plugin styles
└── src/
    ├── main.ts            — Plugin entry point, commands, comment CRUD
    ├── types.ts           — Comment, CommentWithPosition, Settings interfaces
    ├── commentParser.ts   — Parse/serialize comments from document text
    ├── editorExtension.ts — CM6 ViewPlugin: highlight + hide markers + icon widget
    ├── commentPanel.ts    — Sidebar ItemView listing all comments
    ├── commentModal.ts    — Modal for add/edit comment text
    ├── postProcessor.ts   — MarkdownPostProcessor for reading mode highlights
    └── settings.ts        — PluginSettingTab (author, colors, reading mode toggle)
```

---

## Implementation Steps

### 1. Project scaffolding
Create `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`. Run `npm install`. Config files follow the official Obsidian sample plugin conventions. Dependencies: `obsidian`, `@codemirror/state`, `@codemirror/view` (dev only, externalized in esbuild), `esbuild`, `typescript`.

### 2. Data model — `src/types.ts`
```typescript
interface CommentChild {
  id: string;
  text: string;
  author: string;
  ts: number;
}

interface Comment {
  v: 1;
  id: string;
  text: string;
  author: string;
  ts: number;         // Unix timestamp (seconds)
  resolved: boolean;
  children: CommentChild[];
}

interface CommentWithPosition {
  comment: Comment;
  startMarkerFrom: number;  // char offset of <!-- marginalia-start -->
  startMarkerTo: number;
  endMarkerFrom: number;    // char offset of <!-- marginalia: {...} -->
  endMarkerTo: number;
  annotatedFrom: number;    // text range between markers
  annotatedTo: number;
}

interface CommentsPluginSettings {
  authorName: string;
  highlightColor: string;
  resolvedHighlightColor: string;
  showInReadingMode: boolean;
}
```

### 3. Comment parser — `src/commentParser.ts`
Pure string processing, no Obsidian dependencies. Key functions:
- `parseComments(docText: string): CommentWithPosition[]` — regex-based, matches paired start/end markers, returns sorted by position
- `serializeComment(comment: Comment): string` — builds `<!-- marginalia: {...} -->`
- `buildStartMarker(id: string): string` — builds `<!-- marginalia-start: ID -->`
- `buildCommentMarkers(comment: Comment): { startMarker, endMarker }`
- `generateCommentId(): string` — 8-char random alphanumeric
- `validateParsedComment(parsed: unknown, startId: string): Comment | null` — strict schema + ID-match validation

Regex pattern for paired markers:
```
/<!--\s*marginalia-start:\s*([a-zA-Z0-9_-]+)\s*-->([\s\S]*?)<!--\s*marginalia:\s*([\s\S]*?)\s*-->/g
```
Group 3 captures everything between `marginalia:` and `-->`, then we `JSON.parse()` it. This is robust against `}` characters inside comment text values (e.g. `"text": "use { braces }"`), unlike a `\{[^}]*\}` pattern which would break.

Serialization detail for terminator safety:

```typescript
const json = JSON.stringify(comment);
const safeJson = json.replace(/-->/g, "--\\u003e");
```

This preserves readability and prevents accidental early close of the outer HTML comment.

### 4. Editor extension — `src/editorExtension.ts`
CM6 `ViewPlugin` that re-parses the document on every `docChanged` and builds three decorations per comment:
1. **`Decoration.replace({})`** on start marker — hides it
2. **`Decoration.mark({ class: "marginalia-highlight" })`** on annotated text — highlights it
3. **`Decoration.replace({ widget: CommentIconWidget })`** on end marker — shows a small icon

`CommentIconWidget` extends `WidgetType`, renders a clickable comment icon. Click dispatches a `CustomEvent` on the editor DOM.

### 5. Comment modal — `src/commentModal.ts`
Simple `Modal` with a textarea and submit/cancel buttons. Used for both add and edit flows.

### 6. Plugin entry point — `src/main.ts`
`CommentsPlugin extends Plugin`:
- **onload**: Register editor extension, post-processor, sidebar view, commands ("Add comment", "Toggle panel"), right-click context menu, ribbon icon, active-leaf-change listener
- **Comment CRUD methods**: `addComment` (wraps selection in markers), `editComment` (replaces end marker JSON), `deleteComment` (removes both markers, keeps text), `resolveComment` (toggles resolved flag in end marker)
- **Malformed marker safety**: never mutate if pair/payload validation fails; skip invalid entries and show `Notice` with count of ignored comments
- **Panel helpers**: `togglePanel()`, `refreshPanel()`
- **Settings**: `loadSettings()`, `saveSettings()`, `updateHighlightStyles()` (sets CSS custom properties)

### 7. Sidebar panel — `src/commentPanel.ts`
`CommentPanelView extends ItemView`:
- `redraw()` reads active document, parses comments, renders a card per comment
- Each card shows: annotated text preview (truncated), comment text, author + timestamp, action buttons (jump, edit, resolve, delete)
- Redraws on active-leaf-change and after any comment operation

### 8. Reading mode post-processor — `src/postProcessor.ts`
`MarkdownPostProcessor` that:
- Returns early if `showInReadingMode` is false
- Uses `ctx.getSectionInfo(el)` to get original source text
- Parses comments from the source section
- Walks the rendered DOM with `TreeWalker` to find and highlight matching text nodes

Note: Reading mode highlighting is "best effort" since the HTML comments are already stripped by the renderer. Editor mode highlighting (step 4) is the primary experience.

### 9. Settings — `src/settings.ts`
`PluginSettingTab` with: author name (text), highlight color (color picker), resolved highlight color (color picker), show in reading mode (toggle). Color changes update CSS custom properties on `document.body`.

### 10. Styles — `styles.css`
- `.marginalia-highlight` / `.marginalia-highlight-resolved` — background highlight with subtle bottom border
- `.marginalia-icon` — small inline icon, opacity transition on hover
- `.marginalia-panel-*` / `.marginalia-card-*` — sidebar panel layout and comment cards
- Uses Obsidian CSS variables (`--background-modifier-border`, `--text-muted`, etc.) for theme compatibility
- Uses CSS custom properties (`--marginalia-highlight-color`) for dynamic color settings

---

## Known V1 Limitations

- **No overlapping comments** — if one comment range overlaps another, the regex will mismatch. Documented limitation.
- **Reading mode highlight accuracy** — text search in rendered DOM may mismatch if formatting alters visible text. Best effort.
- **No live panel updates on typing** — panel redraws on leaf change and after comment operations, not on every keystroke.
- **Best-effort recovery for corrupted markers** — invalid pairs are ignored and surfaced to user; auto-repair is deferred.

---

## Verification

1. `npm run build` succeeds with no TypeScript errors
2. Copy plugin to an Obsidian vault's `.obsidian/plugins/obsidian-comments/` directory (manifest.json, main.js, styles.css)
3. Enable the plugin in Obsidian settings
4. Test workflow: select text → "Add comment" command → enter text → see highlight and icon in editor
5. Test sidebar: toggle panel → see comment card → click jump/edit/resolve/delete
6. Test reading mode: toggle setting → switch to reading view → verify highlight appears/disappears
7. Test edit resilience: edit annotated text between markers → verify comment stays attached
8. Test resolve: resolve comment → verify visual change (muted highlight, icon in panel updates)
9. Test delete: delete comment → verify markers removed, text preserved
10. Test terminator safety: comment text containing `-->` is preserved across serialize/parse and does not break marker parsing
11. Test malformed payload: intentionally break a marker JSON → plugin skips it safely and shows Notice

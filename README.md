# Marginalia

Google Docs-style comments for [Obsidian](https://obsidian.md).

Select text, leave a comment, and collaborate with highlights, a sidebar panel,
and resolution tracking -- all stored invisibly in standard markdown.

## Features

- **Inline comments** -- add comments on selected text in editor mode
- **Threaded replies** -- each top-level comment stores child replies in a
  `children` list; expanded threads show an inline reply field
- **Editor highlights** -- colored background for commented ranges with inline
  icon widgets and stronger emphasis for the selected thread
- **Sidebar panel** -- click any card to jump/select, view collapsed/expanded
  threads, and reply inline
- **Reading mode** -- optional best-effort highlighting in reading view
- **Document → panel sync** -- clicking highlighted text selects/focuses the
  matching thread in the panel
- **Author permissions** -- only the original author can edit/delete their
  comment or reply; replies cannot be resolved or replied to
- **Configurable** -- author name (or git `user.name` fallback), highlight
  colors, reading mode toggle
- **Portable** -- comments are stored as HTML comment markers, invisible to any
  renderer outside Obsidian
- **CriticMarkup interop** -- convert active notes (or files via CLI) to/from
  CriticMarkup with sidecar metadata for round-tripping author/timestamp/reply
  data

## Disclosures

- **Git config lookup** -- if Author name is blank in plugin settings, Marginalia
  runs `git config --get user.name` (then `git config --global --get user.name`)
  to choose a default author label.
- **No network calls** -- the plugin does not send comment data or note content
  over the network.
- **Storage** -- comments are embedded directly in your markdown note as HTML
  comment markers.

## How it works

Comments are stored as paired markers in the note source:

```md
<!-- marginalia-start: a1b2c3d4 -->annotated text<!-- marginalia: {"v":1,"id":"a1b2c3d4","text":"Is this accurate?","author":"Eric","ts":1708300000,"resolved":false,"children":[{"id":"r9k2m1z8","text":"I agree","author":"Riley","ts":1708300300}]} -->
```

Markers are standard HTML comments, so they're invisible in any markdown
renderer that doesn't understand them. The `-->` sequence in JSON payloads is
escaped to prevent breaking the outer comment boundary.

## Installation

### From Obsidian Community Plugins ([*pending approval*](https://github.com/obsidianmd/obsidian-releases/pull/10357))

Search for "Marginalia" in Settings > Community plugins.

### One-liner (recommended)

Run from anywhere — no download needed. Omit the path to be prompted, or
use `.` when already in your vault directory.

```bash
curl -fsSL https://raw.githubusercontent.com/ericalt/marginalia/main/scripts/install-marginalia.sh | bash -s -- /path/to/YourVault
```

Examples:
- `... | bash` — prompts for vault path
- `... | bash -s -- .` — install into current directory (if you’re in the vault)
- `... | bash -s -- ~/Documents/MyVault --force` — overwrite without prompting

### Local script / npm

If you already have the repo cloned:

```bash
bash scripts/install-marginalia.sh /path/to/YourVault
# or
npm run install:plugin -- /path/to/YourVault
```

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest release](https://github.com/ericalt/marginalia/releases/latest)
2. Create `.obsidian/plugins/marginalia/` in your vault
3. Copy the three files into that directory
4. Enable the plugin in Settings > Community plugins

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup and workflow details.

### Quick start

```bash
npm install
npm run dev         # watch mode
npm run build       # production bundle
npm run check       # type-check
npm run test        # unit tests
npm run interop:export -- path/to/note.md   # convert Marginalia -> CriticMarkup
npm run interop:import -- path/to/note.md   # convert CriticMarkup -> Marginalia
```

## CriticMarkup interoperability

Marginalia includes bidirectional conversion between plugin markers and
CriticMarkup.

### Command palette (active note)

- `Export active note to CriticMarkup`
- `Import active note from CriticMarkup`

### CLI workflow

```bash
npm run interop:export -- path/to/note.md
npm run interop:import -- path/to/note.md
```

Both commands use a sibling sidecar file (`note.critmeta.json`) to preserve
Marginalia-only metadata (`id`, `author`, `ts`, `resolved`, `children`) and map
records back during import.

Export shape:

```md
{==annotated text==}{>>parent comment<<}{>>first child<<}{>>second child<<}
```

Standalone CriticMarkup comments are also imported:

```md
{>>comment without highlight<<}
```

Those become zero-length Marginalia anchors and export back as standalone
CriticMarkup comment tokens.

### Rendering caveat

In markdown renderers without CriticMarkup support, CriticMarkup tokens are
shown as literal text (`{==...==}`, `{>>...<<}`, etc.).

### Local Obsidian testing

Build with `npm run build`, then copy `manifest.json`, `main.js`, and
`styles.css` to your vault's `.obsidian/plugins/marginalia/` directory and
enable the plugin.

## CI/CD

| Workflow | Trigger | Steps |
|---|---|---|
| [CI](.github/workflows/ci.yml) | Push / PR | Install, type-check, test, build |
| [Release](.github/workflows/release.yml) | Manual dispatch | Tag, build, publish GitHub release |

Release flow: `npm run version-bump patch` (or `minor` / `major`) > commit >
push > run workflow in GitHub Actions.

## License

[MIT](LICENSE)

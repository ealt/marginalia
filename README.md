# Marginalia

Google Docs-style comments for [Obsidian](https://obsidian.md).

Select text, leave a comment, and collaborate with highlights, a sidebar panel,
and resolution tracking -- all stored invisibly in standard markdown.

## Features

- **Inline comments** -- add, edit, resolve, and delete comments on any selected
  text
- **Editor highlights** -- colored background for commented ranges with inline
  icon widgets
- **Sidebar panel** -- browse all comments with jump, edit, resolve, and delete
  actions
- **Reading mode** -- optional best-effort highlighting in reading view
- **Configurable** -- author name, highlight colors, reading mode toggle
- **Portable** -- comments are stored as HTML comment markers, invisible to any
  renderer outside Obsidian

## How it works

Comments are stored as paired markers in the note source:

```md
<!-- marginalia-start: a1b2c3d4 -->annotated text<!-- marginalia: {"v":1,"id":"a1b2c3d4","text":"Is this accurate?","author":"Eric","ts":1708300000,"resolved":false} -->
```

Markers are standard HTML comments, so they're invisible in any markdown
renderer that doesn't understand them. The `-->` sequence in JSON payloads is
escaped to prevent breaking the outer comment boundary.

## Installation

### From Obsidian Community Plugins

*Coming soon* -- search for "Marginalia" in Settings > Community plugins.

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
```

### Local Obsidian testing

Build with `npm run build`, then copy `manifest.json`, `main.js`, and
`styles.css` to your vault's `.obsidian/plugins/marginalia/` directory and
enable the plugin.

## CI/CD

| Workflow | Trigger | Steps |
|---|---|---|
| [CI](.github/workflows/ci.yml) | Push / PR | Install, type-check, test, build |
| [Release](.github/workflows/release.yml) | Manual dispatch | Tag, build, publish GitHub release |

Release flow: `npm run version-bump patch` > commit > push > run workflow in
GitHub Actions.

## License

[MIT](LICENSE)

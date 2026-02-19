# Marginalia

Google Docs-style comments for Obsidian.

Add inline comments to any document. Select text, leave a comment, and collaborate with highlights, a sidebar panel, and resolution tracking — all stored invisibly in standard markdown.

## Features

- Add, edit, resolve, and delete comments on selected text
- Editor highlights for commented ranges
- Inline comment icon widget in editor
- Sidebar panel with jump/edit/resolve/delete actions
- Optional best-effort reading mode highlighting
- Robust parser validation for malformed markers

## Marker format

Comments are stored as paired markers in note source:

```md
<!-- marginalia-start: a1b2c3d4 -->annotated text<!-- marginalia: {"v":1,"id":"a1b2c3d4","text":"Is this accurate?","author":"Eric","ts":1708300000,"resolved":false} -->
```

To avoid breaking HTML comment boundaries, serialization escapes only literal `-->` sequences in payload JSON as `--\u003e`.

## Development

### Requirements

- Node.js 22+
- npm 10+

### Setup

```bash
npm install
```

### Commands

```bash
npm run build       # production bundle (main.js)
npm run check       # TypeScript type-check
npm run test        # parser unit tests
npm run test:watch  # watch-mode tests
```

## Local Obsidian testing

1. Build: `npm run build`
2. Copy these files to your vault plugin folder at `.obsidian/plugins/marginalia/`:
   - `manifest.json`
   - `main.js`
   - `styles.css`
3. Enable the plugin in Obsidian settings.

## GitHub Actions

- `.github/workflows/ci.yml`
  - Runs on push/PR
  - Executes `npm ci`, `npm run check`, `npm run test`, `npm run build`
- `.github/workflows/release.yml`
  - Runs when pushing a `v*` tag
  - Verifies tag version matches `manifest.json`
  - Builds and publishes a zip release artifact containing:
    - `manifest.json`
    - `main.js`
    - `styles.css`
    - `versions.json`

## Community Plugins submission checklist

Before submitting to Obsidian Community Plugins:

1. Ensure this repository is public on GitHub.
2. Create a tagged release (for example `v0.1.0`) after updating:
   - `manifest.json` version
   - `versions.json`
3. Verify the release includes `manifest.json`, `main.js`, and `styles.css`.
4. Follow Obsidian submission and policy docs:
   - https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin
   - https://github.com/obsidianmd/obsidian-releases

## License

MIT

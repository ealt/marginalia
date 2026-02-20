# Contributing

Thanks for your interest in contributing to Marginalia!

## Prerequisites

- Node.js 22+
- npm 10+
- An Obsidian vault for manual testing

## Setup

```bash
git clone https://github.com/ericalt/marginalia.git
cd marginalia
npm install
```

## Development workflow

```bash
npm run dev           # Watch mode with inline sourcemaps
npm run build         # Production bundle → main.js
npm run check         # TypeScript type-check (tsc --noEmit)
npm run test          # Unit tests (Vitest)
npm run test:watch    # Tests in watch mode
npm run lint:plugin   # Obsidian community plugin lint
```

### Testing in Obsidian

1. Run `npm run build`
2. Copy `manifest.json`, `main.js`, and `styles.css` to your vault's
   `.obsidian/plugins/marginalia/` directory
3. Enable the plugin in Obsidian settings
4. Reload Obsidian (Cmd/Ctrl+R) after rebuilding

### Running a single test

```bash
npx vitest run tests/commentParser.test.ts
```

## Before submitting a PR

Run the full validation suite:

```bash
npm run check && npm run test && npm run build
```

### PR checklist

- [ ] `npm run check` passes with no errors
- [ ] `npm run test` passes
- [ ] `npm run build` produces a working `main.js`
- [ ] `npm run lint:plugin` passes (if you changed plugin metadata or APIs)
- [ ] Commits use short, imperative, sentence-case subjects
- [ ] PR includes a concise summary of changes
- [ ] Screenshots or GIFs included for UI changes
- [ ] New parser/serialization behavior has test coverage

## Coding style

- TypeScript with strict settings (`strict`, `noImplicitAny`,
  `strictNullChecks`)
- 2-space indentation, semicolons, double quotes
- `camelCase` for variables/functions, `PascalCase` for classes/types
- Keep modules focused and small; prefer explicit types over `any`

See [AGENTS.md](AGENTS.md) for full architecture and convention details.

## Obsidian plugin rules

The plugin must pass community plugin review. Key rules enforced by
`npm run lint:plugin`:

- No `innerHTML`/`outerHTML` -- use `createEl`/`createDiv`
- No inline styles -- use CSS classes
- No `console.log` -- only `console.error`/`console.warn`
- No default hotkeys in commands
- Use `this.app` not global `app`
- Use `getActiveViewOfType()` not `workspace.activeLeaf`

## Release process

Releases are handled by maintainers:

1. `npm run version-bump <patch|minor|major>` (use `minor` for new features, `patch` for fixes)
2. Commit and push
3. Run the Release workflow from GitHub Actions

# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains plugin source modules. `src/main.ts` is the entry point wired into Obsidian APIs, with feature-focused files such as `commentParser.ts`, `commentPanel.ts`, and `settings.ts`.
- `tests/` contains Vitest unit tests (`*.test.ts`), currently focused on parser behavior.
- `main.js` is the bundled output from esbuild; treat it as generated code.
- `manifest.json`, `styles.css`, and `versions.json` are release artifacts required by Obsidian.
- `.github/workflows/` defines CI (`ci.yml`) and release automation (`release.yml`).

## Build, Test, and Development Commands
- `npm install`: install dependencies (Node.js 22+, npm 10+).
- `npm run dev`: watch-mode build for local development.
- `npm run build`: production bundle to `main.js`.
- `npm run check`: strict TypeScript type-check (`tsc --noEmit`).
- `npm run test`: run unit tests once with Vitest.
- `npm run test:watch`: run tests in watch mode.
- `npm run lint:plugin`: run plugin lint script from shared local toolchain.
- `npm run version-bump`: update plugin versions via shared toolchain script.

## Coding Style & Naming Conventions
- Language: TypeScript with strict compiler settings (`strict`, `noImplicitAny`, `strictNullChecks`).
- Follow existing style: 2-space indentation, semicolons, and double quotes.
- Naming: `camelCase` for variables/functions, `PascalCase` for classes/types, `UPPER_SNAKE_CASE` for constants.
- Keep modules focused and small; prefer explicit types over `any`.
- File names in `src/` use lower camel case (example: `commentParser.ts`).

## Testing Guidelines
- Framework: Vitest (`tests/*.test.ts`).
- Use clear `describe`/`it` names that state behavior and edge cases.
- Add tests for parser/serialization changes and malformed marker handling.
- Before opening a PR, run: `npm run check && npm run test && npm run build`.

## Commit & Pull Request Guidelines
- Commit messages in this repo follow short, imperative, sentence-case subjects (example: `Refactor comment modal styles and structure`).
- Keep commits focused; avoid mixing refactors with feature behavior changes.
- PRs should include:
  - A concise summary of user-visible and internal changes
  - Linked issue/context when applicable
  - Validation steps and command results
  - Screenshots or GIFs for UI/panel changes
- For release-related changes, call out updates to `manifest.json` and `versions.json`.

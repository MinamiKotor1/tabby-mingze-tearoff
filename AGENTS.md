# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains all plugin source code.
- `src/index.ts` is the Angular module entrypoint that registers providers.
- `src/tearoff.service.ts` holds the core tab tear-off logic (drag-out handling, hotkey flow, profile transfer).
- `src/*Provider.ts` files define focused integrations (`config`, `hotkey`, `contextMenu`).
- `dist/` is generated output (`index.js`, declarations, source maps); do not hand-edit.
- Root config files: `package.json`, `tsconfig.json`, `webpack.config.js`.

## Build, Test, and Development Commands
- `yarn install` — install dependencies.
- `yarn build` — compile TypeScript and bundle to `dist/` with webpack.
- `yarn watch` — rebuild on file changes during development.
- `npm run prepublishOnly` — release guard; runs the production build step before publish.

## Coding Style & Naming Conventions
- Language: TypeScript with `strict` mode enabled in `tsconfig.json`.
- Use 4-space indentation and follow existing semicolon-free style.
- Class/interface names: `PascalCase`; functions/variables: `camelCase`; constants: `UPPER_SNAKE_CASE`.
- Keep naming aligned with role: providers as `*Provider.ts`, services as `*.service.ts`.
- Prefer small, single-purpose provider classes and keep cross-module wiring in `src/index.ts`.

## Testing Guidelines
- There is currently no dedicated automated test suite.
- Minimum quality gate: run `yarn build` and fix all type/build errors.
- Manual smoke test in Tabby should cover:
  1. Drag tab out of window creates a new window.
  2. Context menu action `分离到新窗口` works.
  3. `tearoff-tab` hotkey triggers tear-off for supported tabs.
- For new test infrastructure, colocate tests near source as `*.spec.ts`.

## Commit & Pull Request Guidelines
- Current history uses short subjects (for example, `update`, `重构`). Keep commit titles brief and imperative.
- Prefer adding scope for clarity, e.g., `tearoff: guard unsupported tab types`.
- PRs should include: behavior summary, linked issue (if any), manual verification steps, and screenshots/GIFs for visible UI changes.
- Keep PRs focused to one logical change.

## Security & Configuration Tips
- Do not store secrets in plugin config or localStorage payloads.
- When changing defaults, update both `src/configProvider.ts` and `README.md` to keep docs and runtime behavior aligned.

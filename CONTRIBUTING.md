# Contributing to IMDirectory

Thanks for your interest in contributing. This guide explains how to get set up and what we expect from a pull request.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug or request a feature** using the [issue templates](.github/ISSUE_TEMPLATE).
- **Improve documentation**: fixes to the README, `DEVELOPERS.MD` or `docs/` are always welcome.
- **Add tests**: unit test coverage is currently low, so tests for existing code are very valuable.
- **Fix an issue or build a feature**: please open or comment on an issue first so we can agree the approach.

Security problems should **not** be reported in public issues. See [SECURITY.md](SECURITY.md).

## Getting set up

You need Node.js (a current LTS release) and [pnpm](https://pnpm.io/).

```console
pnpm install
```

The `@endeavour` packages come from Endeavour's public npm registry, which needs no credentials to install from. The `preinstall` script configures this for you.

### Run without a backend

The quickest way to try changes is the mocked mode, which uses Mock Service Worker so no IMAPI or sign-in is needed:

```console
cp .env.mock.example .env.mock
pnpm dev:mocked
```

The app is served on <http://localhost:8082>.

### Run against a real IMAPI

Copy `.env.example` to `.env`, then start the dev server with `pnpm dev`. The dev server proxies `/imapi` to `http://127.0.0.1:8080`, so IMAPI must be running there. All settings are described in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

Never commit `.env` files containing real values, and never put secrets in a `VITE_…` variable, as they are compiled into the public bundle.

For an overview of the code layout see [DEVELOPERS.MD](DEVELOPERS.MD).

## Before you open a pull request

Run these locally and make sure they pass:

```console
pnpm lint
pnpm format
pnpm tsc:build
pnpm test:unit
```

- Add or update **unit tests** in `tests/unit/` for any logic you change.
- Update the **documentation** if behaviour, configuration or commands change.
- Keep pull requests focused: one change per pull request.
- Husky runs Prettier on staged files when you commit.

The end-to-end suite (`pnpm test:e2e`, Gauge and Playwright) needs a running environment and a test account, so you do not need to run it for a first contribution. The maintainers will run it.

## Commit messages and branches

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(editor): add shape validation summary
fix(directory): handle empty search results
docs: clarify mocked mode setup
```

Common types are `feat`, `fix`, `docs`, `test`, `refactor` and `chore`.

Create a branch from `develop`, named like `feature/short-name` or `fix/short-name`, and open the pull request against `develop`.

## Coding style

- TypeScript in strict mode, Vue 3 Composition API, PrimeVue components and Tailwind utilities.
- Use the `@/` alias for imports from `src/`.
- Avoid `any` where you can, even though the lint rule allows it.
- ESLint and Prettier settings are in the repository, so let the tools format your code.

## Licensing

IMDirectory is licensed under the [Apache License 2.0](LICENSE). By submitting a contribution you agree that it is provided under the same licence.

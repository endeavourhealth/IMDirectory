# IMDirectory Developer Documentation

This document provides a structural overview of the **IMDirectory** project to help developers understand the architecture, key directories, and development workflow.

## 🛠 Technology Stack

- **Framework**: [Vue 3](https://vuejs.org/) (Composition API)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **State Management**: [Pinia](https://pinia.vuejs.org/)
- **Routing**: [Vue Router](https://router.vuejs.org/)
- **UI Library**: [PrimeVue](https://primevue.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [Sass](https://sass-lang.com/)
- **Testing**: [Vitest](https://vitest.dev/) (Unit) & [Gauge](https://gauge.org/)/[Playwright](https://playwright.dev/) (E2E)
- **API Mocking**: [MSW (Mock Service Worker)](https://mswjs.io/)
- **Package Manager**: [pnpm](https://pnpm.io/)

## 📂 Project Structure

The codebase follows a standard Vue/Vite structure with logic separated by responsibility:

### Source Directory (`/src`)

- **`components/`**: Reusable Vue components.
- **`views/`**: Page-level components associated with routes.
- **`composables/`**: Shared stateful logic using Vue's Composition API.
- **`stores/`**: Pinia state management modules.
- **`services/`**: API calls and business logic layer.
- **`router/`**: Vue Router configuration and navigation guards.
- **`models/`, `interfaces/`, `enums/`, `typings/`**: TypeScript type definitions and constants.
- **`helpers/`**: Utility functions and common logic.
- **`assets/`**: Static assets like images and global styles.
- **`constants/`**: Application-wide constant values.
- **`main.ts`**: Application entry point.
- **`App.vue`**: Root component.

### Other Directories

- **`public/`**: Static files served directly (e.g., icons, mock service worker).
- **`tests/`**: Unit and E2E test suites.
- **`.nuxt/`**: Generated types and schema (project may use some Nuxt-like patterns or extensions).
- **`.github/`**: CI/CD workflows and issue templates.
- **`docs/`**: Project documentation (including this file).

## 🚀 Development Workflow

### Installation
```bash
pnpm install
```

### Local Development
Runs the application with hot-reloading:
```bash
pnpm dev
```

### Building for Production
Compiles and minifies for production:
```bash
pnpm build
```

### Testing
- **Unit Tests**: `pnpm test:unit`
- **Coverage**: `pnpm test:coverage`
- **E2E Tests**: `pnpm test:e2e`

### Linting & Formatting
- **Lint**: `pnpm lint`
- **Format**: `pnpm format`

## 🔌 API Interaction

The project expects the **IMAPI** to be running on `localhost:8080` for local development. Environment variables are managed via a `.env` file in the root.

- **Hosting Mode**: `VITE_HOSTING_MODE="public"` or `"private"`

## 🔐 Authentication

Users sign in with [Casdoor](https://casdoor.org) directly (OpenID Connect, authorization code flow with PKCE, no client secret) using `oidc-client-ts` (`src/services/AuthService.ts`). The Casdoor access token is sent to IMAPI as `Authorization: Bearer …` by the axios interceptor in `src/services/api.ts` and is renewed with the refresh token before it expires. Tokens are kept in `sessionStorage`, so each browser tab signs in separately (Casdoor remembers you, so this is seamless).

The Casdoor URL and this app's client id are not configured here: `AuthService` fetches them from IMAPI (`GET api/config/public/auth?app=IMDirectory`), which serves its own `CASDOOR_URL` and `CASDOOR_APP_IMDIRECTORY_CLIENT_ID`. If IMAPI answers `"clientId": null`, sign-in is disabled (e.g. public deployments, and `pnpm dev:mocked`). An HTTP error, `404` included, is an error, not "sign-in off".

In Casdoor, register the app's **root URL** (e.g. `https://directory.example.org/`, `http://localhost:8082/` for development) as a redirect URL on the application. The app uses hash routing, and a redirect URL cannot contain a fragment, so Casdoor returns to the root and the app finishes signing in (`AuthService.completeSigninIfRedirected`, called before the router starts) and restores the page you were on. IMAPI accepts tokens for this application because its client id is in `CASDOOR_APP_IMDIRECTORY_CLIENT_ID`.

## 🎨 UI & Styling

- **PrimeVue**: used for high-level UI components.
- **Tailwind CSS**: used for utility-first styling.
- **Sass**: used for custom complex styles.
- **FontAwesome Pro**: Integrated for icons (requires specific setup in `index.html`).

---
*Last updated: April 2026*
